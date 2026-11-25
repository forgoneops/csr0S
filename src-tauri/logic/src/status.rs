//! Connection status and the `ShellState` JSON handed to the bundled page.

use crate::picker::{Gateway, GatewayKind, Registry};
use crate::probe_reason::ProbeReason;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatusKind {
    Idle,
    Checking,
    Online,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reason {
    None,
    Unreachable,
    Refused,
    Timeout,
    Dns,
    HttpStatus,
    BadUrl,
    NotSelected,
    CoreMissing,
    CoreFailed,
    CoreTimeout,
}

impl From<ProbeReason> for Reason {
    fn from(p: ProbeReason) -> Reason {
        match p {
            ProbeReason::Refused => Reason::Refused,
            ProbeReason::Timeout => Reason::Timeout,
            ProbeReason::Dns => Reason::Dns,
            ProbeReason::Unreachable => Reason::Unreachable,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Status {
    pub kind: StatusKind,
    pub gateway_id: Option<String>,
    pub gateway_name: Option<String>,
    pub address: Option<String>,
    pub reason: Reason,
    pub http_status: Option<u16>,
    pub detail: Option<String>,
    pub core_started: bool,
    pub checked_unix_ms: Option<u64>,
}

impl Status {
    fn base(kind: StatusKind, gw: Option<&Gateway>, reason: Reason) -> Status {
        Status {
            kind,
            gateway_id: gw.map(|g| g.id.clone()),
            gateway_name: gw.map(|g| g.name.clone()),
            address: gw.map(|g| g.address.clone()),
            reason,
            http_status: None,
            detail: None,
            core_started: false,
            checked_unix_ms: None,
        }
    }

    /// Nothing is being connected (picker shown, no attempt in flight).
    pub fn idle(gw: Option<&Gateway>) -> Status {
        Status::base(StatusKind::Idle, gw, Reason::NotSelected)
    }

    pub fn checking(gw: &Gateway, core_started: bool) -> Status {
        let mut s = Status::base(StatusKind::Checking, Some(gw), Reason::None);
        s.core_started = core_started;
        s
    }

    pub fn online(gw: &Gateway, http_status: Option<u16>, core_started: bool, now_ms: u64) -> Status {
        let mut s = Status::base(StatusKind::Online, Some(gw), Reason::None);
        s.http_status = http_status;
        s.core_started = core_started;
        s.checked_unix_ms = Some(now_ms);
        s
    }

    pub fn offline(
        gw: Option<&Gateway>,
        reason: Reason,
        http_status: Option<u16>,
        detail: Option<String>,
        core_started: bool,
        now_ms: u64,
    ) -> Status {
        let mut s = Status::base(StatusKind::Offline, gw, reason);
        s.http_status = http_status;
        s.detail = detail;
        s.core_started = core_started;
        s.checked_unix_ms = Some(now_ms);
        s
    }
}

/// Parse "HTTP/1.1 200 OK" into 200. Only the first line is looked at.
pub fn parse_status_line(text: &str) -> Option<u16> {
    let line = text.lines().next()?.trim();
    let mut parts = line.split_whitespace();
    let version = parts.next()?;
    if !version.starts_with("HTTP/") {
        return None;
    }
    let code = parts.next()?;
    if code.len() != 3 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let n: u16 = code.parse().ok()?;
    (100..=599).contains(&n).then_some(n)
}

/// 2xx and 3xx mean the gateway is up; anything else is `Reason::HttpStatus`.
pub fn is_online_status(code: u16) -> bool {
    (200..400).contains(&code)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GatewayView {
    pub id: String,
    pub name: String,
    pub address: String,
    pub kind: GatewayKind,
    pub builtin: bool,
    pub selected: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShellState {
    pub locale: String,
    pub tray_enabled: bool,
    pub selected_id: Option<String>,
    pub gateways: Vec<GatewayView>,
    pub status: Status,
}

impl ShellState {
    pub fn build(locale: &str, tray_enabled: bool, registry: &Registry, status: &Status) -> ShellState {
        let selected = registry.selected().id.clone();
        let gateways = registry
            .gateways()
            .iter()
            .map(|g| GatewayView {
                id: g.id.clone(),
                name: g.name.clone(),
                address: g.address.clone(),
                kind: g.kind,
                builtin: g.builtin,
                selected: g.id == selected,
            })
            .collect();
        ShellState {
            locale: locale.to_string(),
            tray_enabled,
            selected_id: Some(selected),
            gateways,
            status: status.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_line_parsing() {
        assert_eq!(parse_status_line("HTTP/1.1 200 OK"), Some(200));
        assert_eq!(parse_status_line("HTTP/1.0 503 Service Unavailable\r\nX: y"), Some(503));
        assert_eq!(parse_status_line("HTTP/2 204"), Some(204));
        assert_eq!(parse_status_line("garbage"), None);
        assert_eq!(parse_status_line(""), None);
        assert_eq!(parse_status_line("HTTP/1.1 abc"), None);
        assert_eq!(parse_status_line("HTTP/1.1 20"), None);
        assert_eq!(parse_status_line("HTTP/1.1 999"), None);
        assert_eq!(parse_status_line("<html>HTTP/1.1 200"), None);
    }

    #[test]
    fn online_classification() {
        assert!(is_online_status(200));
        assert!(is_online_status(204));
        assert!(is_online_status(302));
        assert!(!is_online_status(199));
        assert!(!is_online_status(400));
        assert!(!is_online_status(404));
        assert!(!is_online_status(500));
    }

    #[test]
    fn json_contract() {
        let reg = Registry::new_default("http://127.0.0.1:4410");
        let st = Status::idle(Some(reg.selected()));
        let state = ShellState::build("en", false, &reg, &st);
        let v = serde_json::to_value(&state).unwrap();
        assert_eq!(v["locale"], "en");
        assert_eq!(v["tray_enabled"], false);
        assert_eq!(v["selected_id"], "local");
        assert_eq!(v["gateways"][0]["kind"], "local");
        assert_eq!(v["gateways"][0]["builtin"], true);
        assert_eq!(v["gateways"][0]["selected"], true);
        assert_eq!(v["status"]["kind"], "idle");
        assert_eq!(v["status"]["reason"], "not_selected");
        assert!(v["status"]["http_status"].is_null());
        assert_eq!(v["status"]["core_started"], false);
        let off = Status::offline(None, Reason::CoreTimeout, None, None, true, 5);
        assert_eq!(serde_json::to_value(&off).unwrap()["reason"], "core_timeout");
        let http = Status::offline(None, Reason::HttpStatus, Some(500), None, false, 5);
        assert_eq!(serde_json::to_value(&http).unwrap()["reason"], "http_status");
    }

    #[test]
    fn probe_reason_to_reason() {
        assert_eq!(Reason::from(ProbeReason::Refused), Reason::Refused);
        assert_eq!(Reason::from(ProbeReason::Unreachable), Reason::Unreachable);
    }
}
