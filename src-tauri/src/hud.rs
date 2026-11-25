//! The HUD: a small frameless, transparent, always-on-top window on the gateway's own `/?hud=1` page. The page talks back only through its
//! title (see shell_logic::hud): its height, close, and "open the main window". Nothing is injected into it and it gets no commands.
//! On Hyprland a new toplevel is tiled and `alwaysOnTop` is ignored, so after it maps we ask the compositor to float and pin it and park it
//! at the top centre of the focused monitor; Hyprland has two dispatch dialects (classic and Lua), so each request tries one, then the other.

use crate::{window, Shared};
use shell_logic::hud::{classify_reply, commands, find_client, hud_url, hyprland_socket, monitor_rect, park_position, parse_title, Action, Reply, TitleCmd, HUD_LABEL, HUD_TITLE, WIDTH};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

/// `--hud` on a first launch: open the HUD as soon as the gateway is up.
static PENDING: AtomicBool = AtomicBool::new(false);
/// Which dispatch dialect this compositor speaks, learned once.
static LUA: AtomicBool = AtomicBool::new(false);
/// The main window was hidden to make room for the HUD (the whole app becomes the small strip), so closing the HUD brings it back.
static MAIN_HIDDEN: AtomicBool = AtomicBool::new(false);

fn hide_main(app: &AppHandle) {
    if let Some(m) = window::main_window(app) {
        if m.is_visible().unwrap_or(false) {
            let _ = m.hide();
            MAIN_HIDDEN.store(true, Ordering::SeqCst);
        }
    }
}

fn restore_main(app: &AppHandle) {
    if MAIN_HIDDEN.swap(false, Ordering::SeqCst) {
        window::show_and_focus(app);
    }
}

pub fn open_when_online() {
    PENDING.store(true, Ordering::SeqCst);
}

/// Called when the gateway comes online: open the HUD if a first launch asked for it.
pub fn after_online(app: &AppHandle) {
    if PENDING.swap(false, Ordering::SeqCst) {
        toggle(app);
    }
}

#[cfg(unix)]
fn request(command: &str) -> Option<String> {
    use std::io::{Read, Write};
    use std::os::unix::net::UnixStream;
    use std::time::Duration;
    let path = hyprland_socket(std::env::var("XDG_RUNTIME_DIR").ok().as_deref(), std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok().as_deref())?;
    let mut s = UnixStream::connect(path).ok()?;
    s.set_read_timeout(Some(Duration::from_millis(1500))).ok()?;
    s.write_all(command.as_bytes()).ok()?;
    let mut out = String::new();
    s.read_to_string(&mut out).ok()?;
    Some(out)
}
#[cfg(not(unix))]
fn request(_command: &str) -> Option<String> {
    None
}

/// One dispatch, in the dialect that works here (the learned one first).
fn dispatch(address: &str, action: Action) -> Reply {
    let (legacy, lua) = commands(address, action);
    let order = if LUA.load(Ordering::SeqCst) { [(&lua, true), (&legacy, false)] } else { [(&legacy, false), (&lua, true)] };
    for (cmd, is_lua) in order {
        match request(cmd).map(|r| classify_reply(&r)) {
            None => return Reply::Failed,
            Some(Reply::WrongSyntax) => continue,
            Some(r) => {
                LUA.store(is_lua, Ordering::SeqCst);
                return r;
            }
        }
    }
    Reply::WrongSyntax
}

/// Put the HUD at the top centre of the focused monitor (top edge fixed, so a growing answer hangs downward).
fn park() {
    let Some(c) = request("j/clients").and_then(|j| find_client(&j)) else { return };
    if let Some(m) = request("j/monitors").and_then(|j| monitor_rect(&j)) {
        let (x, y) = park_position(m, WIDTH as i32);
        let r = dispatch(&c.address, Action::Move(x, y));
        if std::env::var_os("CAESAROS_HUD_DEBUG").is_some() {
            eprintln!("hud park {x},{y}: {r:?}");
        }
    }
}

/// Float, pin and park the HUD. Retries while the compositor has not listed the window yet, then keeps parking for a few seconds: Hyprland
/// re-places a floating window while it settles and again when the page sizes it, so one move is not enough. Quiet outside Hyprland.
fn promote() {
    for _ in 0..40 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        let Some(c) = request("j/clients").and_then(|j| find_client(&j)) else { continue };
        if !c.floating && dispatch(&c.address, Action::Float) != Reply::Ok {
            continue;
        }
        if !c.pinned && dispatch(&c.address, Action::Pin) != Reply::Ok {
            continue;
        }
        for _ in 0..16 {
            park();
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
        return;
    }
    eprintln!("caesaros-shell: the HUD could not be floated (not Hyprland, or the window never appeared)");
}

fn on_title(app: &AppHandle, title: &str) {
    if std::env::var_os("CAESAROS_HUD_DEBUG").is_some() {
        eprintln!("hud title: {title}");
    }
    let Some(w) = app.get_webview_window(HUD_LABEL) else { return };
    match parse_title(title) {
        Some(TitleCmd::Height(h)) => {
            let _ = w.set_size(LogicalSize::new(WIDTH, h));
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(150));
                park();
            });
        }
        Some(TitleCmd::Close) => {
            let _ = w.hide();
            restore_main(app);
        }
        Some(TitleCmd::Open) => {
            let _ = w.hide();
            MAIN_HIDDEN.store(false, Ordering::SeqCst);
            window::show_and_focus(app);
        }
        None => {}
    }
}

/// Show the HUD, create it on first use, hide it when it is showing.
pub fn toggle(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(HUD_LABEL) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            restore_main(app);
        } else {
            hide_main(app);
            let _ = w.show();
            let _ = w.set_focus();
            std::thread::spawn(promote);
        }
        return;
    }
    let Some(shared) = app.try_state::<Arc<Shared>>() else { return };
    let Some(origin) = shared.selected_origin() else { return };
    let Some(url) = hud_url(&origin) else { return };
    let handle = app.clone();
    let built = window::guard_hud(WebviewWindowBuilder::new(app, HUD_LABEL, WebviewUrl::External(url)), app, shared.inner().clone())
        .title(HUD_TITLE)
        .inner_size(WIDTH, 110.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .on_document_title_changed(move |_w, t| on_title(&handle, &t))
        .build();
    match built {
        Ok(_) => {
            hide_main(app);
            std::thread::spawn(promote);
        }
        Err(e) => eprintln!("caesaros-shell: cannot open the HUD: {e}"),
    }
}
