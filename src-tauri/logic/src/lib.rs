//! Pure, testable logic of the CaesarOS native shell. No Tauri dependency,
//! no network, no filesystem: everything here is unit tested on any machine.

pub mod deeplink;
pub mod gateway;
pub mod hud;
pub mod geometry;
pub mod navpolicy;
pub mod picker;
pub mod popout;
pub mod probe_reason;
pub mod status;
