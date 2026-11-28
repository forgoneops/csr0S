//! Main window: creation, saved geometry, navigation helpers.

use crate::Shared;
use shell_logic::geometry::{clamp, Geometry, MIN_HEIGHT, MIN_WIDTH};
use shell_logic::gateway::gateway_origin;
use shell_logic::navpolicy::{allow_navigation, platform_shell_origin};
use shell_logic::popout::{is_pop_close, is_pop_label, is_pop_request, next_label, MAX_POPS};
use std::sync::Arc;
use tauri::webview::{NewWindowResponse, PermissionKind, PermissionResponse};
use tauri::{AppHandle, Manager, PhysicalPosition, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MAIN_LABEL: &str = "main";

/// URL of the bundled shell page.
pub fn shell_url() -> Option<Url> {
    Url::parse(&format!("{}/index.html", platform_shell_origin())).ok()
}

/// Create the one and only window at the clamped saved geometry.
pub fn create_main(app: &AppHandle, saved: Option<Geometry>, shared: Arc<Shared>) -> tauri::Result<WebviewWindow> {
    let g = clamp(saved.unwrap_or_default());
    let mut b = WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::App("index.html".into()))
        .title("CaesarOS")
        .visible(false) // shown once the gateway answers, so the picker page never flashes at launch
        .inner_size(g.width, g.height)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT);
    b = guard_navigation(b, app, shared, None);
    if let (Some(x), Some(y)) = (g.x, g.y) {
        b = b.position(x, y);
    }
    let w = b.build()?;
    enable_media(&w);
    Ok(w)
}

/// WebKitGTK ships with enable-media-stream off, so getUserMedia fails before any permission prompt. No-op elsewhere.
fn enable_media(w: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    let _ = w.with_webview(|pw| {
        use webkit2gtk::{SettingsExt, WebViewExt};
        if let Some(s) = pw.inner().settings() {
            s.set_enable_media_stream(true);
            s.set_enable_mediasource(true);
        }
    });
    #[cfg(not(target_os = "linux"))]
    let _ = w;
}

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN_LABEL)
}

/// Show, unminimize and focus the window.
pub fn show_and_focus(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Return the window to the bundled picker page.
pub fn go_picker(app: &AppHandle) {
    if let (Some(w), Some(url)) = (main_window(app), shell_url()) {
        if let Err(e) = w.navigate(url) {
            eprintln!("caesaros-shell: cannot show picker: {e}");
        }
    }
}

/// Navigate to the selected gateway (the on_navigation policy still applies).
pub fn go_gateway(app: &AppHandle, address: &str) {
    // Only an address whose origin parses is ever navigated to.
    if gateway_origin(address).is_none() {
        return;
    }
    if let (Some(w), Ok(url)) = (main_window(app), Url::parse(address)) {
        if let Err(e) = w.navigate(url) {
            eprintln!("caesaros-shell: cannot open gateway: {e}");
        }
    }
}

/// Current geometry: logical inner size (so decorations do not accumulate on
/// every launch) and outer position.
pub fn current_geometry(w: &WebviewWindow) -> Option<Geometry> {
    if w.is_minimized().unwrap_or(false) {
        return None;
    }
    let scale = w.scale_factor().ok()?;
    let size = w.inner_size().ok()?.to_logical::<f64>(scale);
    let pos: Option<PhysicalPosition<i32>> = w.outer_position().ok();
    Some(Geometry {
        width: size.width,
        height: size.height,
        x: pos.map(|p| p.x as f64 / scale),
        y: pos.map(|p| p.y as f64 / scale),
    })
}

type Builder<'a> = WebviewWindowBuilder<'a, tauri::Wry, AppHandle>;

/// The navigation policy for every shell window, plus the pop-out hook: a guest page may only ask for a
/// new window with a gateway `?pop=` URL (no IPC needed); the shell opens it itself and always denies the default.
pub(crate) fn guard_hud<'a>(b: Builder<'a>, app: &AppHandle, shared: Arc<Shared>) -> Builder<'a> { guard_navigation(b, app, shared, None) }

fn guard_navigation<'a>(b: Builder<'a>, app: &AppHandle, shared: Arc<Shared>, pop_label: Option<String>) -> Builder<'a> {
    let (app, shared2, shared3, app_nav) = (app.clone(), shared.clone(), shared.clone(), app.clone());
    b.on_navigation(move |url| {
        if let Some(label) = &pop_label {
            if is_pop_close(url, shared.selected_origin().as_deref()) {
                // The page asked to be closed (it cannot close a window it did not open): the shell does it, off this callback's thread.
                let (app, label) = (app_nav.clone(), label.clone());
                std::thread::spawn(move || { if let Some(w) = app.get_webview_window(&label) { let _ = w.close(); } });
                return false;
            }
        }
        let ok = allow_navigation(url, shared.selected_origin().as_deref(), platform_shell_origin());
        if !ok {
            // Denied, and never handed to the OS browser.
            eprintln!("caesaros-shell: navigation denied to {}", url.origin().ascii_serialization());
        }
        ok
    })
    // Microphone only, and only for the shell page or the selected gateway; camera, screen, location, the rest are denied.
    .on_permission_request(move |wv, kind| {
        let from_ours = wv.url().map(|u| allow_navigation(&u, shared3.selected_origin().as_deref(), platform_shell_origin())).unwrap_or(false);
        match kind {
            PermissionKind::Microphone if from_ours => PermissionResponse::Allow,
            _ => PermissionResponse::Deny,
        }
    })
    .on_new_window(move |url, _features| {
        if is_pop_request(&url, shared2.selected_origin().as_deref()) {
            // Built off this callback's thread: a window cannot be created while the webview waits for the answer.
            let app = app.clone();
            std::thread::spawn(move || open_pop(&app, url, None, None));
        } else if matches!(url.scheme(), "http" | "https") && url.host().is_some() {
            // External links such as Hall of Fame profiles belong in the user's browser.
            let app = app.clone();
            std::thread::spawn(move || {
                if let Err(error) = tauri_plugin_opener::OpenerExt::opener(&app).open_url(url.as_str(), None::<&str>) {
                    eprintln!("caesaros-shell: could not open external link: {error}");
                }
            });
        } else {
            eprintln!("caesaros-shell: new window denied to {}", url.origin().ascii_serialization());
        }
        NewWindowResponse::Deny
    })
}

fn pop_labels(app: &AppHandle) -> Vec<String> {
    app.webview_windows().into_keys().filter(|l| is_pop_label(l)).collect()
}

/// Open a popped-out window on `url` (already checked as a pop request), at its saved geometry when it has one.
pub fn open_pop(app: &AppHandle, url: Url, saved: Option<Geometry>, label: Option<String>) {
    let Some(shared) = app.try_state::<Arc<Shared>>() else { return };
    let used = pop_labels(app);
    if used.len() >= MAX_POPS {
        eprintln!("caesaros-shell: pop-out refused, {MAX_POPS} windows are open");
        return;
    }
    let label = label.filter(|l| !used.contains(l)).unwrap_or_else(|| next_label(&used));
    let g = clamp(saved.unwrap_or_default());
    let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url.clone()))
        .title("CaesarOS")
        .inner_size(g.width, g.height)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT);
    b = guard_navigation(b, app, shared.inner().clone(), Some(label.clone()));
    if let (Some(x), Some(y)) = (g.x, g.y) {
        b = b.position(x, y);
    }
    match b.build() {
        Ok(w) => {
            enable_media(&w);
            shared.pop_set(&label, url.as_str(), saved)
        }
        Err(e) => eprintln!("caesaros-shell: cannot open {label}: {e}"),
    }
}

/// Reopen the windows that were popped out when the app was last closed. Once per run, after the gateway is up.
pub fn restore_pops(app: &AppHandle) {
    let Some(shared) = app.try_state::<Arc<Shared>>() else { return };
    if !shared.take_restore() {
        return;
    }
    let origin = shared.selected_origin();
    for p in shared.pops() {
        match Url::parse(&p.url) {
            Ok(url) if is_pop_request(&url, origin.as_deref()) => open_pop(app, url, p.window, Some(p.label)),
            _ => shared.pop_remove(&p.label),
        }
    }
}

/// Write the current geometry of every open pop-out window into the config.
pub fn save_pop_geometry(app: &AppHandle) {
    let Some(shared) = app.try_state::<Arc<Shared>>() else { return };
    for l in pop_labels(app) {
        if let Some(g) = app.get_webview_window(&l).and_then(|w| current_geometry(&w)) {
            shared.pop_geometry(&l, g);
        }
    }
}
