//! Local core child process, started on demand. The shell only ever kills a
//! core it started itself.

use shell_logic::gateway::is_loopback_url;
use std::env;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use url::Url;

pub const DEFAULT_PORT: u16 = 4410;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Launch {
    /// A prebuilt core executable.
    Binary(PathBuf),
    /// `bun core/server.ts` run inside this directory.
    Bun(PathBuf),
}

#[derive(Debug)]
pub enum StartError {
    /// No core found by any discovery rule.
    Missing,
    /// Found, but could not be started (or the address is not loopback).
    Failed(String),
}

/// Discovery order: CAESAROS_CORE_BIN, <exe_dir>/caesaros-core,
/// CAESAROS_CORE_DIR/core/server.ts, <current dir>/core/server.ts.
pub fn discover() -> Option<Launch> {
    if let Some(p) = env::var_os("CAESAROS_CORE_BIN").map(PathBuf::from) {
        if p.is_file() {
            return Some(Launch::Binary(p));
        }
    }
    if let Some(dir) = env::current_exe().ok().and_then(|e| e.parent().map(|d| d.to_path_buf())) {
        let p = dir.join(format!("caesaros-core{}", env::consts::EXE_SUFFIX));
        if p.is_file() {
            return Some(Launch::Binary(p));
        }
    }
    if let Some(dir) = env::var_os("CAESAROS_CORE_DIR").map(PathBuf::from) {
        if dir.join("core").join("server.ts").is_file() {
            return Some(Launch::Bun(dir));
        }
    }
    if let Ok(dir) = env::current_dir() {
        if dir.join("core").join("server.ts").is_file() {
            return Some(Launch::Bun(dir));
        }
    }
    None
}

/// Port to hand to the core: the gateway URL port, default 4410.
pub fn port_for(address: &str) -> u16 {
    Url::parse(address).ok().and_then(|u| u.port()).unwrap_or(DEFAULT_PORT)
}

#[derive(Default)]
pub struct CoreProc {
    child: Option<Child>,
}

impl CoreProc {
    /// True when we started a core and it is still running.
    pub fn is_running(&mut self) -> bool {
        match self.child.as_mut() {
            Some(c) => match c.try_wait() {
                Ok(None) => true,
                _ => {
                    self.child = None;
                    false
                }
            },
            None => false,
        }
    }

    /// Start the core unless our own child is already running (never twice).
    /// Only loopback addresses are ever started.
    pub fn ensure_started(&mut self, address: &str) -> Result<(), StartError> {
        if self.is_running() {
            return Ok(());
        }
        let loopback = Url::parse(address).map(|u| is_loopback_url(&u)).unwrap_or(false);
        if !loopback {
            return Err(StartError::Failed("the local gateway address is not loopback".to_string()));
        }
        let launch = discover().ok_or(StartError::Missing)?;
        let port = port_for(address);
        let mut cmd = match &launch {
            Launch::Binary(p) => Command::new(p),
            Launch::Bun(dir) => {
                let mut c = Command::new("bun");
                c.arg("core/server.ts").current_dir(dir);
                c
            }
        };
        cmd.env("CAESAROS_HOST", "127.0.0.1")
            .env("CAESAROS_PORT", port.to_string())
            // the core stops by itself if this shell dies without cleaning up (killed, crashed, logout)
            .env("CAESAROS_PARENT_PID", std::process::id().to_string())
            .stdin(Stdio::null());
        // The core's data dir must be the person's own, never a path inside the bundle (a compiled core has no source tree).
        if env::var_os("CAESAROS_DATA").is_none() {
            let base = env::var_os("XDG_DATA_HOME").map(PathBuf::from)
                .or_else(|| env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
                .unwrap_or_default();
            cmd.env("CAESAROS_DATA", base.join("caesaros"));
        }
        // an installed app carries its web, packs and skills in `resources` next to the executables
        if env::var_os("CAESAROS_ROOT").is_none() {
            if let Some(res) = env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join("resources"))) {
                if res.is_dir() {
                    cmd.env("CAESAROS_ROOT", &res);
                    if env::var_os("CAESAROS_SKILLS_DIR").is_none() && res.join("skills").is_dir() {
                        cmd.env("CAESAROS_SKILLS_DIR", res.join("skills"));
                    }
                }
            }
        }
        match cmd.spawn() {
            Ok(child) => {
                eprintln!("caesaros-shell: started local core (pid {})", child.id());
                self.child = Some(child);
                Ok(())
            }
            Err(e) => Err(StartError::Failed(e.to_string())),
        }
    }

    /// Kill the core, but only when this shell started it.
    pub fn kill(&mut self) {
        if let Some(mut c) = self.child.take() {
            let _ = c.kill();
            let _ = c.wait();
            eprintln!("caesaros-shell: stopped local core");
        }
    }
}
