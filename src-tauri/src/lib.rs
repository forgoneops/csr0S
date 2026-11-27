//! CaesarOS native shell: window, tray, shortcuts, single instance, deep links
//! and on-demand local core start. The UI stays the web app at the gateway URL
//! and the logic stays the core; this crate implements no app features.

mod commands;
mod config;
mod core_proc;
mod hud;
mod probe;
mod tray;
mod window;

use config::Config;
use core_proc::CoreProc;
use shell_logic::deeplink::{classify, DeepLinkAction};
use shell_logic::gateway::gateway_origin;
use shell_logic::picker::{Registry, DEFAULT_LOCAL_ADDRESS};
use shell_logic::status::{ShellState, Status};
use std::path::PathBuf;
use shell_logic::geometry::Geometry;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

const LOCAL_GATEWAY_ENV: &str = "CAESAROS_LOCAL_GATEWAY";

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    // A poisoned lock only means another thread panicked; the data is still usable.
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

struct Inner {
    registry: Registry,
    status: Status,
    config: Config,
    /// Bumped on every new connection attempt or picker request; a worker whose
    /// generation is stale stops and never touches the window.
    generation: u64,
}

/// State shared by the commands, the window closure and the worker threads.
pub struct Shared {
    inner: Mutex<Inner>,
    core: Mutex<CoreProc>,
    config_path: PathBuf,
    /// Set once the app is quitting, so closing a pop-out then keeps it in the config for the next start.
    quitting: AtomicBool,
    restore_pending: AtomicBool,
}

impl Shared {
    fn new(config_path: PathBuf) -> Shared {
        let config = config::load(&config_path);
        let local = std::env::var(LOCAL_GATEWAY_ENV).unwrap_or_else(|_| DEFAULT_LOCAL_ADDRESS.to_string());
        let registry = config.registry(&local);
        let status = Status::idle(Some(registry.selected()));
        Shared {
            inner: Mutex::new(Inner { registry, status, config, generation: 0 }),
            core: Mutex::new(CoreProc::default()),
            config_path,
            quitting: AtomicBool::new(false),
            restore_pending: AtomicBool::new(true),
        }
    }

    pub fn state(&self) -> ShellState {
        let inner = lock(&self.inner);
        let locale = config::detect_locale(&inner.config);
        ShellState::build(locale, inner.config.tray_enabled, &inner.registry, &inner.status)
    }

    /// Origin of the selected gateway (read by the on_navigation closure).
    pub fn selected_origin(&self) -> Option<String> {
        gateway_origin(&lock(&self.inner).registry.selected().address)
    }

    fn tray_enabled(&self) -> bool {
        lock(&self.inner).config.tray_enabled
    }

    fn persist(&self, inner: &mut Inner) {
        let reg = inner.registry.clone();
        inner.config.set_registry(&reg);
        if let Err(e) = config::save(&self.config_path, &inner.config) {
            eprintln!("caesaros-shell: cannot save config: {e}");
        }
    }

    pub fn select(&self, id: &str) -> Result<(), String> {
        let mut inner = lock(&self.inner);
        inner.registry.select(id).map_err(|e| e.to_string())?;
        self.persist(&mut inner);
        Ok(())
    }

    pub fn add(&self, name: &str, address: &str) -> Result<(), String> {
        let mut inner = lock(&self.inner);
        inner.registry.add(name, address).map_err(|e| e.to_string())?;
        self.persist(&mut inner);
        Ok(())
    }

    pub fn remove(&self, id: &str) -> Result<(), String> {
        let mut inner = lock(&self.inner);
        let was_selected = inner.registry.selected().id == id;
        inner.registry.remove(id).map_err(|e| e.to_string())?;
        if was_selected {
            inner.generation += 1;
            inner.status = Status::idle(Some(inner.registry.selected()));
        }
        self.persist(&mut inner);
        Ok(())
    }

    /// Cancel any attempt in flight, go idle and show the bundled picker page.
    pub fn show_picker(&self, app: &AppHandle) {
        {
            let mut inner = lock(&self.inner);
            inner.generation += 1;
            inner.status = Status::idle(Some(inner.registry.selected()));
        }
        window::show_and_focus(app);
        window::go_picker(app);
    }

    fn is_current(&self, generation: u64) -> bool {
        lock(&self.inner).generation == generation
    }

    /// Set the status only while `generation` is still the current attempt.
    fn set_status(&self, generation: u64, status: Status) -> bool {
        let mut inner = lock(&self.inner);
        if inner.generation != generation {
            return false;
        }
        inner.status = status;
        true
    }

    fn core_running(&self) -> bool {
        lock(&self.core).is_running()
    }

    fn save_geometry(&self, app: &AppHandle) {
        let Some(g) = window::main_window(app).and_then(|w| window::current_geometry(&w)) else {
            return;
        };
        let mut inner = lock(&self.inner);
        inner.config.window = Some(g);
        self.persist(&mut inner);
    }

    /// True once: the first caller after start may restore the popped-out windows.
    fn take_restore(&self) -> bool {
        self.restore_pending.swap(false, Ordering::SeqCst)
    }

    fn pops(&self) -> Vec<config::StoredPop> {
        lock(&self.inner).config.pops.clone()
    }

    fn pop_set(&self, label: &str, url: &str, window: Option<Geometry>) {
        let mut inner = lock(&self.inner);
        inner.config.pops.retain(|p| p.label != label);
        inner.config.pops.push(config::StoredPop { label: label.into(), url: url.into(), window });
        self.persist(&mut inner);
    }

    fn pop_geometry(&self, label: &str, g: Geometry) {
        let mut inner = lock(&self.inner);
        if let Some(p) = inner.config.pops.iter_mut().find(|p| p.label == label) {
            p.window = Some(g);
            self.persist(&mut inner);
        }
    }

    fn pop_remove(&self, label: &str) {
        let mut inner = lock(&self.inner);
        inner.config.pops.retain(|p| p.label != label);
        self.persist(&mut inner);
    }

    fn kill_core(&self) {
        lock(&self.core).kill();
    }
}

/// Save the window geometry, stop our own core (if any) and exit.
pub fn quit(app: &AppHandle) {
    if let Some(shared) = app.try_state::<Arc<Shared>>() {
        shared.quitting.store(true, Ordering::SeqCst);
        shared.save_geometry(app);
        window::save_pop_geometry(app);
        shared.kill_core();
    }
    app.exit(0);
}

/// Connection attempts: probe the selected gateway, start the local core when
/// that is what is missing, then open the gateway in the window.
mod connect {
    use super::*;
    use crate::core_proc::StartError;
    use crate::probe::{probe, ProbeResult};
    use shell_logic::picker::{Gateway, GatewayKind};
    use shell_logic::status::Reason;
    use std::time::{Duration, Instant};

    const CORE_WAIT: Duration = Duration::from_secs(15);
    const CORE_POLL: Duration = Duration::from_millis(250);

    /// Start one attempt on a worker thread; any older attempt becomes stale.
    pub fn spawn(app: &AppHandle, shared: Arc<Shared>) {
        let (generation, gw) = {
            let mut inner = lock(&shared.inner);
            inner.generation += 1;
            let gw = inner.registry.selected().clone();
            let running = lock(&shared.core).is_running();
            inner.status = Status::checking(&gw, running);
            (inner.generation, gw)
        };
        let app = app.clone();
        std::thread::spawn(move || run(&app, &shared, generation, &gw));
    }

    fn online(app: &AppHandle, shared: &Shared, generation: u64, gw: &Gateway, code: Option<u16>) {
        let status = Status::online(gw, code, shared.core_running(), now_ms());
        if shared.set_status(generation, status) {
            window::go_gateway(app, &gw.address);
            window::show_and_focus(app);
            window::restore_pops(app);
            hud::after_online(app);
        }
    }

    fn offline(app: &AppHandle, shared: &Shared, generation: u64, gw: &Gateway, reason: Reason, code: Option<u16>, detail: Option<String>) {
        let status = Status::offline(Some(gw), reason, code, detail, shared.core_running(), now_ms());
        if shared.set_status(generation, status) {
            window::show_and_focus(app); // the window starts hidden; an offline gateway is the one reason to show the picker
        }
    }

    fn run(app: &AppHandle, shared: &Shared, generation: u64, gw: &Gateway) {
        match probe(&gw.address) {
            ProbeResult::Online(code) => online(app, shared, generation, gw, code),
            ProbeResult::HttpStatus(code) => {
                offline(app, shared, generation, gw, Reason::HttpStatus, Some(code), None)
            }
            ProbeResult::BadUrl => offline(app, shared, generation, gw, Reason::BadUrl, None, None),
            ProbeResult::Failed(reason, detail) => {
                // The core is started on demand only for the local gateway,
                // and only when nothing answers there.
                if gw.kind == GatewayKind::Local && reason.core_may_help() {
                    start_core(app, shared, generation, gw);
                } else {
                    offline(app, shared, generation, gw, reason.into(), None, Some(detail));
                }
            }
        }
    }

    fn start_core(app: &AppHandle, shared: &Shared, generation: u64, gw: &Gateway) {
        let started = lock(&shared.core).ensure_started(&gw.address);
        match started {
            Err(StartError::Missing) => {
                return offline(app, shared, generation, gw, Reason::CoreMissing, None, None);
            }
            Err(StartError::Failed(e)) => {
                return offline(app, shared, generation, gw, Reason::CoreFailed, None, Some(e));
            }
            Ok(()) => {}
        }
        if !shared.set_status(generation, Status::checking(gw, true)) {
            return;
        }
        let deadline = Instant::now() + CORE_WAIT;
        while Instant::now() < deadline {
            if !shared.is_current(generation) {
                return;
            }
            if let ProbeResult::Online(code) = probe(&gw.address) {
                return online(app, shared, generation, gw, code);
            }
            if !shared.core_running() {
                return offline(app, 
                    shared,
                    generation,
                    gw,
                    Reason::CoreFailed,
                    None,
                    Some("the core exited right after start".to_string()),
                );
            }
            std::thread::sleep(CORE_POLL);
        }
        offline(app, shared, generation, gw, Reason::CoreTimeout, None, None);
    }
}

fn handle_second_launch(app: &AppHandle, argv: &[String]) {
    if argv.iter().any(|a| a == "--hud") {
        hud::toggle(app);                                  // the HUD is summoned and put away with one key: `caesaros-shell --hud`
        return;
    }
    window::show_and_focus(app);
    if argv.iter().any(|a| a == "--picker") {
        if let Some(shared) = app.try_state::<Arc<Shared>>() {
            shared.show_picker(app);
        }
    }
}

fn build_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let connection = MenuItemBuilder::with_id("connection", "Connection...").build(app)?;
    let hud_item = MenuItemBuilder::with_id("hud", "HUD (floating chat)").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let submenu = SubmenuBuilder::new(app, "CaesarOS").item(&connection).item(&hud_item).separator().item(&quit_item).build()?;
    let menu = MenuBuilder::new(app).item(&submenu).build()?;
    app.set_menu(menu)?;
    Ok(())
}

pub fn run() {
    let built = tauri::Builder::default()
        // Single instance must be the first plugin.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| handle_second_launch(app, &argv)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_shell_state,
            commands::select_gateway,
            commands::add_gateway,
            commands::remove_gateway,
            commands::retry_gateway,
            commands::open_picker,
            commands::quit_app,
        ])
        .on_menu_event(|app, event| match event.id().as_ref() {
            "connection" => {
                if let Some(shared) = app.try_state::<Arc<Shared>>() {
                    shared.show_picker(app);
                }
            }
            "hud" => hud::toggle(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_window_event(|win, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = win.app_handle();
                let Some(shared) = app.try_state::<Arc<Shared>>() else { return };
                if win.label() == shell_logic::hud::HUD_LABEL {
                    return;                                // closing the HUD only closes the HUD
                }
                if shell_logic::popout::is_pop_label(win.label()) {
                    // Closing a pop-out returns it to the main window; on quit it stays listed for the next start.
                    if !shared.quitting.load(Ordering::SeqCst) {
                        shared.pop_remove(win.label());
                    }
                    return;
                }
                shared.save_geometry(app);
                if shared.tray_enabled() {
                    // With the tray, closing only hides the window.
                    api.prevent_close();
                    let _ = win.hide();
                } else {
                    // Without it the main window closing ends the app, pop-outs included; they are kept for next time.
                    api.prevent_close();
                    quit(app);
                }
            }
        })
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;

            let dir = app.path().app_config_dir()?;
            let shared = Arc::new(Shared::new(dir.join("config.json")));
            app.manage(shared.clone());

            let saved = lock(&shared.inner).config.window;
            window::create_main(app.handle(), saved, shared.clone())?;
            if std::env::args().any(|a| a == "--hud") {
                hud::open_when_online();
            }
            eprintln!("caesaros-shell: window ready");
            build_menu(app)?;
            if shared.tray_enabled() {
                tray::create(app.handle())?;
            }

            // Deep links only bring the picker to the front; they never navigate.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            if let Err(e) = app.deep_link().register_all() {
                eprintln!("caesaros-shell: deep link registration failed: {e}");
            }
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if event.urls().iter().any(|u| classify(u.as_str()) == DeepLinkAction::FocusPicker) {
                    if let Some(shared) = handle.try_state::<Arc<Shared>>() {
                        shared.show_picker(&handle);
                    }
                }
            });

            // Probe the selected gateway once at startup; the bundled page stays
            // up as the picker/offline page unless it comes online.
            connect::spawn(app.handle(), shared);
            Ok(())
        })
        .build(tauri::generate_context!());

    match built {
        Ok(app) => app.run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(shared) = app.try_state::<Arc<Shared>>() {
                    shared.kill_core();
                }
            }
        }),
        Err(e) => {
            eprintln!("caesaros-shell: cannot start: {e}");
            std::process::exit(1);
        }
    }
}
