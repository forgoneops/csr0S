//! System tray. OFF by default: only created when config.tray_enabled is true.

use crate::window;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("tray_show", "Show").build(app)?;
    let quit = MenuItemBuilder::with_id("tray_quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).item(&show).item(&quit).build()?;

    let mut b = TrayIconBuilder::with_id("caesaros")
        .tooltip("CaesarOS")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray_show" => window::show_and_focus(app),
            "tray_quit" => crate::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                window::show_and_focus(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.build(app)?;
    Ok(())
}
