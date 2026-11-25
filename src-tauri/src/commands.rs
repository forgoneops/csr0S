//! Tauri commands for the bundled shell page, plus the IPC origin guard.
//! The page calls these through window.__TAURI__.core.invoke.

use crate::{connect, Shared};
use shell_logic::navpolicy::ipc_allowed;
use shell_logic::status::ShellState;
use std::sync::Arc;
use tauri::{AppHandle, State, Webview};

type Shell<'a> = State<'a, Arc<Shared>>;

/// Refuse any caller that is not the bundled shell page, so guest gateway
/// content can never reach the commands.
fn guard(webview: &Webview) -> Result<(), String> {
    match webview.url() {
        Ok(url) if ipc_allowed(&url) => Ok(()),
        _ => Err("ipc refused: not the shell page".to_string()),
    }
}

#[tauri::command]
pub async fn get_shell_state(webview: Webview, shared: Shell<'_>) -> Result<ShellState, String> {
    guard(&webview)?;
    Ok(shared.state())
}

#[tauri::command]
pub async fn select_gateway(
    app: AppHandle,
    webview: Webview,
    shared: Shell<'_>,
    id: String,
) -> Result<ShellState, String> {
    guard(&webview)?;
    shared.select(&id)?;
    connect::spawn(&app, shared.inner().clone());
    Ok(shared.state())
}

#[tauri::command]
pub async fn add_gateway(
    webview: Webview,
    shared: Shell<'_>,
    name: String,
    address: String,
) -> Result<ShellState, String> {
    guard(&webview)?;
    shared.add(&name, &address)?;
    Ok(shared.state())
}

#[tauri::command]
pub async fn remove_gateway(webview: Webview, shared: Shell<'_>, id: String) -> Result<ShellState, String> {
    guard(&webview)?;
    shared.remove(&id)?;
    Ok(shared.state())
}

#[tauri::command]
pub async fn retry_gateway(app: AppHandle, webview: Webview, shared: Shell<'_>) -> Result<ShellState, String> {
    guard(&webview)?;
    connect::spawn(&app, shared.inner().clone());
    Ok(shared.state())
}

#[tauri::command]
pub async fn open_picker(app: AppHandle, webview: Webview, shared: Shell<'_>) -> Result<ShellState, String> {
    guard(&webview)?;
    shared.show_picker(&app);
    Ok(shared.state())
}

#[tauri::command]
pub async fn quit_app(app: AppHandle, webview: Webview) -> Result<(), String> {
    guard(&webview)?;
    crate::quit(&app);
    Ok(())
}
