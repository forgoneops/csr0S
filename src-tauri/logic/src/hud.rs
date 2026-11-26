//! HUD window: the title channel (the only way the HUD page talks to the shell), the HUD URL, and Hyprland's dialect for floating and pinning it.
//! Everything here is pure, so it is tested without a window or a compositor.

use serde_json::Value;
use url::Url;

pub const HUD_LABEL: &str = "hud";
pub const HUD_TITLE: &str = "CaesarOS HUD";
pub const MIN_HEIGHT: f64 = 60.0;
pub const MAX_HEIGHT: f64 = 720.0;
pub const WIDTH: f64 = 680.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TitleCmd {
    /// The page's own idea of its height, clamped to what a HUD may be.
    Height(f64),
    Close,
    Open,
}

/// "CaesarOS HUD ·h192", "CaesarOS HUD ·close", "CaesarOS HUD ·open"; anything else is not for the shell.
pub fn parse_title(title: &str) -> Option<TitleCmd> {
    let rest = title.strip_prefix(HUD_TITLE)?.trim().strip_prefix('\u{b7}')?;
    match rest {
        "close" => Some(TitleCmd::Close),
        "open" => Some(TitleCmd::Open),
        h => h.strip_prefix('h')?.parse::<f64>().ok().filter(|v| v.is_finite()).map(|v| TitleCmd::Height(v.clamp(MIN_HEIGHT, MAX_HEIGHT))),
    }
}

/// The HUD page: the selected gateway's own origin with `?hud=1`. None when the origin is not a plain http(s) origin.
pub fn hud_url(gateway_origin: &str) -> Option<Url> {
    let u = Url::parse(gateway_origin).ok()?;
    if u.scheme() != "http" && u.scheme() != "https" || u.host_str().is_none() {
        return None;
    }
    Url::parse(&format!("{}/?hud=1", u.origin().ascii_serialization())).ok()
}

/// `$XDG_RUNTIME_DIR/hypr/<signature>/.socket.sock`, or None outside Hyprland.
pub fn hyprland_socket(runtime_dir: Option<&str>, signature: Option<&str>) -> Option<String> {
    let (r, s) = (runtime_dir?, signature?);
    if r.is_empty() || s.is_empty() || s.contains('/') {
        return None;
    }
    Some(format!("{}/hypr/{}/.socket.sock", r.trim_end_matches('/'), s))
}

#[derive(Debug, Clone, PartialEq)]
pub struct HudClient {
    pub address: String,
    pub floating: bool,
    pub pinned: bool,
}

/// The first client whose title is the HUD's (it starts with HUD_TITLE: the page appends its height).
pub fn find_client(clients_json: &str) -> Option<HudClient> {
    let v: Value = serde_json::from_str(clients_json).ok()?;
    v.as_array()?.iter().find_map(|c| {
        let title = c.get("title")?.as_str()?;
        // the page starts with the bare title and appends a height; a lookalike with the same prefix is not the HUD
        if title != HUD_TITLE && parse_title(title).is_none() {
            return None;
        }
        let a = c.get("address")?.as_str()?;
        if a.is_empty() {
            return None;
        }
        Some(HudClient { address: if a.starts_with("0x") { a.to_string() } else { format!("0x{a}") }, floating: c.get("floating").and_then(Value::as_bool).unwrap_or(false), pinned: c.get("pinned").and_then(Value::as_bool).unwrap_or(false) })
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Action {
    Float,
    Pin,
    /// Move to a pixel position (x, y).
    Move(i32, i32),
}

/// The same request in Hyprland's two dialects: the classic one and the Lua one (Hyprland 0.55+ with a Lua config).
pub fn commands(address: &str, action: Action) -> (String, String) {
    let sel = format!("address:{address}");
    match action {
        Action::Float => (format!("dispatch setfloating {sel}"), format!("dispatch hl.dsp.window.float({{ action = \"enable\", window = \"{sel}\" }})")),
        Action::Pin => (format!("dispatch pin {sel}"), format!("dispatch hl.dsp.window.pin({{ action = \"enable\", window = \"{sel}\" }})")),
        Action::Move(x, y) => (format!("dispatch movewindowpixel exact {x} {y},{sel}"), format!("dispatch hl.dsp.window.move({{ x = {x}, y = {y}, window = \"{sel}\" }})")),
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Reply {
    Ok,
    WrongSyntax,
    Failed,
}

pub fn classify_reply(reply: &str) -> Reply {
    let t = reply.trim();
    if t == "ok" {
        Reply::Ok
    } else if t.starts_with("Invalid dispatcher") || t.starts_with("error:") {
        Reply::WrongSyntax
    } else {
        Reply::Failed
    }
}

/// Top centre of a monitor, a little below its top edge: where the HUD parks. `monitor` is (x, y, width, height) in layout pixels.
pub fn park_position(monitor: (i32, i32, i32, i32), hud_width: i32) -> (i32, i32) {
    (monitor.0 + (monitor.2 - hud_width).max(0) / 2, monitor.1 + 56)
}

/// The monitor under a given point, from `j/monitors`: (x, y, width, height) in layout pixels (scale applied), else the first one.
pub fn monitor_rect(monitors_json: &str) -> Option<(i32, i32, i32, i32)> {
    let v: Value = serde_json::from_str(monitors_json).ok()?;
    let m = v.as_array()?.iter().find(|m| m.get("focused").and_then(Value::as_bool).unwrap_or(false)).or_else(|| v.as_array()?.first())?;
    let (x, y, w, h) = (m.get("x")?.as_i64()?, m.get("y")?.as_i64()?, m.get("width")?.as_f64()?, m.get("height")?.as_f64()?);
    let s = m.get("scale").and_then(Value::as_f64).filter(|s| *s > 0.0).unwrap_or(1.0);
    Some((x as i32, y as i32, (w / s) as i32, (h / s) as i32))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_channel() {
        assert_eq!(parse_title("CaesarOS HUD \u{b7}h192"), Some(TitleCmd::Height(192.0)));
        assert_eq!(parse_title("CaesarOS HUD \u{b7}h1e2"), Some(TitleCmd::Height(100.0)));
        assert_eq!(parse_title("CaesarOS HUD \u{b7}h+120"), Some(TitleCmd::Height(120.0)));
        assert_eq!(parse_title("CaesarOS HUD \u{b7}h.5"), Some(TitleCmd::Height(MIN_HEIGHT)));
        assert_eq!(parse_title("CaesarOS HUD \u{b7}h9999"), Some(TitleCmd::Height(MAX_HEIGHT)));
        assert_eq!(parse_title("CaesarOS HUD \u{b7}h1"), Some(TitleCmd::Height(MIN_HEIGHT)));
        assert_eq!(parse_title("CaesarOS HUD \u{b7}close"), Some(TitleCmd::Close));
        assert_eq!(parse_title("CaesarOS HUD \u{b7}open"), Some(TitleCmd::Open));
        for bad in ["CaesarOS HUD", "Good evening \u{b7} CaesarOS", "CaesarOS HUD \u{b7}hx", "CaesarOS HUD \u{b7}h", "CaesarOS HUD \u{b7}quit", "CaesarOS HUD \u{b7}hNaN"] {
            assert_eq!(parse_title(bad), None, "{bad}");
        }
    }

    #[test]
    fn url_is_the_gateways_own_origin() {
        assert_eq!(hud_url("http://127.0.0.1:4410/some/path?x=1").unwrap().as_str(), "http://127.0.0.1:4410/?hud=1");
        assert_eq!(hud_url("https://gw.example.com").unwrap().as_str(), "https://gw.example.com/?hud=1");
        assert!(hud_url("file:///etc/passwd").is_none() && hud_url("javascript:alert(1)").is_none() && hud_url("not a url").is_none());
    }

    #[test]
    fn hyprland_socket_needs_both_and_no_path_tricks() {
        assert_eq!(hyprland_socket(Some("/run/user/1000"), Some("abc_1")).as_deref(), Some("/run/user/1000/hypr/abc_1/.socket.sock"));
        assert!(hyprland_socket(None, Some("abc")).is_none() && hyprland_socket(Some("/run"), None).is_none() && hyprland_socket(Some("/run"), Some("../x")).is_none());
    }

    #[test]
    fn finds_the_hud_client_by_title_prefix() {
        let j = r#"[{"address":"0x1","title":"kitty","floating":false,"pinned":false},{"address":"0xabc","title":"CaesarOS HUD ·h106","floating":true,"pinned":false}]"#;
        assert_eq!(find_client(j), Some(HudClient { address: "0xabc".into(), floating: true, pinned: false }));
        assert_eq!(find_client(r#"[{"address":"abc","title":"CaesarOS HUD"}]"#).unwrap().address, "0xabc");
        assert!(find_client(r#"[{"address":"0x2","title":"CaesarOS HUD evil"}]"#).is_none());
        assert!(find_client("[]").is_none() && find_client("nope").is_none() && find_client(r#"[{"address":"0x1","title":"other"}]"#).is_none());
    }

    #[test]
    fn both_dialects_name_the_window_by_address() {
        let (legacy, lua) = commands("0xabc", Action::Pin);
        assert_eq!(legacy, "dispatch pin address:0xabc"); assert!(lua.contains("hl.dsp.window.pin") && lua.contains("address:0xabc"));
        assert_eq!(commands("0xabc", Action::Move(100, 56)).0, "dispatch movewindowpixel exact 100 56,address:0xabc");
        assert!(commands("0xabc", Action::Float).1.contains("hl.dsp.window.float"));
    }

    #[test]
    fn replies_are_told_apart() {
        assert_eq!(classify_reply("ok"), Reply::Ok); assert_eq!(classify_reply("Invalid dispatcher"), Reply::WrongSyntax);
        assert_eq!(classify_reply("error: lua: bad"), Reply::WrongSyntax); assert_eq!(classify_reply("window not found"), Reply::Failed);
    }

    #[test]
    fn parks_top_centre_of_the_focused_monitor() {
        assert_eq!(park_position((0, 0, 1920, 1080), 680), (620, 56)); assert_eq!(park_position((1920, 0, 1280, 720), 680), (2220, 56));
        assert_eq!(park_position((0, 0, 400, 300), 680), (0, 56));
        let j = r#"[{"x":0,"y":0,"width":2880,"height":1800,"scale":1.5,"focused":false},{"x":1920,"y":0,"width":1920,"height":1080,"scale":1,"focused":true}]"#;
        assert_eq!(monitor_rect(j), Some((1920, 0, 1920, 1080)));
        assert_eq!(monitor_rect(r#"[{"x":0,"y":0,"width":2880,"height":1800,"scale":1.5,"focused":false}]"#), Some((0, 0, 1920, 1200)));
        assert!(monitor_rect("[]").is_none());
    }
}
