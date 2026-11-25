//! Config load/save (atomic) and locale detection.

use serde::{Deserialize, Serialize};
use shell_logic::geometry::{clamp as clamp_geometry, Geometry};
use shell_logic::picker::{Registry, LOCAL_ID};
use std::fs;
use std::io;
use std::path::Path;

pub const CONFIG_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredGateway {
    pub id: String,
    pub name: String,
    pub address: String,
}

/// A popped-out window kept for the next start: its label, gateway URL and last geometry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredPop {
    pub label: String,
    pub url: String,
    pub window: Option<Geometry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub version: u32,
    /// Remote gateways only; the local entry is never stored.
    pub gateways: Vec<StoredGateway>,
    pub selected: String,
    pub window: Option<Geometry>,
    pub pops: Vec<StoredPop>,
    pub tray_enabled: bool,
    pub locale: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            version: CONFIG_VERSION,
            gateways: Vec::new(),
            selected: LOCAL_ID.to_string(),
            window: None,
            pops: Vec::new(),
            tray_enabled: false,
            locale: None,
        }
    }
}

impl Config {
    /// Build the registry from the stored remotes.
    pub fn registry(&self, local_address: &str) -> Registry {
        let remotes: Vec<(String, String, String)> = self
            .gateways
            .iter()
            .map(|g| (g.id.clone(), g.name.clone(), g.address.clone()))
            .collect();
        Registry::from_parts(local_address, &remotes, &self.selected)
    }

    /// Copy the registry back into the stored form.
    pub fn set_registry(&mut self, reg: &Registry) {
        self.gateways = reg
            .gateways()
            .iter()
            .filter(|g| !g.builtin)
            .map(|g| StoredGateway { id: g.id.clone(), name: g.name.clone(), address: g.address.clone() })
            .collect();
        self.selected = reg.selected().id.clone();
    }
}

/// Load the config. A missing file gives defaults; a broken file is left
/// untouched on disk (it is never deleted or overwritten here) and defaults
/// are used for this run.
pub fn load(path: &Path) -> Config {
    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Config>(&text) {
            Ok(mut cfg) => {
                // A hand-edited config can carry a missing or insane geometry; clamp it
                // here so a later save never meets a NaN (serde_json refuses to write one).
                cfg.window = cfg.window.map(clamp_geometry);
                for p in &mut cfg.pops {
                    p.window = p.window.map(clamp_geometry);
                }
                cfg
            }
            Err(e) => {
                eprintln!("caesaros-shell: config is not valid ({e}); using defaults, file left untouched");
                Config::default()
            }
        },
        Err(e) if e.kind() == io::ErrorKind::NotFound => Config::default(),
        Err(e) => {
            eprintln!("caesaros-shell: cannot read config ({e}); using defaults");
            Config::default()
        }
    }
}

/// Save atomically: write a temp file next to the target, then rename.
pub fn save(path: &Path, cfg: &Config) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

/// "pl" or "en": config.locale, else LC_ALL / LC_MESSAGES / LANG, else "en".
pub fn detect_locale(cfg: &Config) -> &'static str {
    if let Some(l) = cfg.locale.as_deref() {
        match l {
            "pl" => return "pl",
            "en" => return "en",
            _ => {}
        }
    }
    for var in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(v) = std::env::var(var) {
            if !v.is_empty() {
                // The first non-empty variable decides, as in POSIX locale lookup.
                return if v.to_ascii_lowercase().starts_with("pl") { "pl" } else { "en" };
            }
        }
    }
    "en"
}
