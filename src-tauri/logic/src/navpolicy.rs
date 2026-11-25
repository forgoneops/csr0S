//! Navigation and IPC policy. Cross-origin navigation is denied, never handed
//! to the OS browser. Guest (gateway) pages never reach Tauri commands.

use crate::gateway::origin_of;
use url::Url;

/// Origins under which the bundled shell page is served.
pub const SHELL_ORIGIN_UNIX: &str = "tauri://localhost";
pub const SHELL_ORIGIN_WINDOWS: &str = "http://tauri.localhost";

/// The shell origin for the current platform (Windows serves http://tauri.localhost).
pub fn platform_shell_origin() -> &'static str {
    if cfg!(windows) {
        SHELL_ORIGIN_WINDOWS
    } else {
        SHELL_ORIGIN_UNIX
    }
}

fn is_shell_origin(origin: &str) -> bool {
    origin == SHELL_ORIGIN_UNIX || origin == SHELL_ORIGIN_WINDOWS
}

/// May the webview navigate to `target`?
/// True for the shell origin and for the selected gateway origin only.
pub fn allow_navigation(target: &Url, gateway_origin: Option<&str>, shell_origin: &str) -> bool {
    let Some(origin) = origin_of(target) else {
        return false; // javascript:, data:, file:, about: have no host
    };
    if origin == shell_origin {
        return true;
    }
    matches!(gateway_origin, Some(g) if g == origin)
}

/// May a page at `url` call the shell commands? Only the bundled shell page.
pub fn ipc_allowed(url: &Url) -> bool {
    origin_of(url).map(|o| is_shell_origin(&o)).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHELL: &str = "tauri://localhost";
    const GW: Option<&str> = Some("https://gw.example.com");

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn shell_origin_ok() {
        assert!(allow_navigation(&u("tauri://localhost/index.html"), None, SHELL));
        assert!(allow_navigation(&u("http://tauri.localhost/index.html"), None, "http://tauri.localhost"));
        assert!(!allow_navigation(&u("http://tauri.localhost/"), None, SHELL));
    }

    #[test]
    fn gateway_root_and_subpath_ok() {
        assert!(allow_navigation(&u("https://gw.example.com/"), GW, SHELL));
        assert!(allow_navigation(&u("https://gw.example.com/a/b?c=1"), GW, SHELL));
        assert!(allow_navigation(&u("https://GW.example.com:443/x"), GW, SHELL));
    }

    #[test]
    fn other_origins_denied() {
        assert!(!allow_navigation(&u("https://gw.example.com:8443/"), GW, SHELL));
        assert!(!allow_navigation(&u("https://evil.example.com/"), GW, SHELL));
        assert!(!allow_navigation(&u("https://gw.example.com.evil.example/"), GW, SHELL));
        assert!(!allow_navigation(&u("http://gw.example.com/"), GW, SHELL));
    }

    #[test]
    fn no_gateway_only_shell() {
        assert!(!allow_navigation(&u("https://gw.example.com/"), None, SHELL));
        assert!(allow_navigation(&u("tauri://localhost/"), None, SHELL));
    }

    #[test]
    fn dangerous_schemes_denied() {
        for s in ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi", "about:blank", "blob:https://gw.example.com/x"] {
            assert!(!allow_navigation(&u(s), GW, SHELL), "{s}");
            assert!(!ipc_allowed(&u(s)), "{s}");
        }
    }

    #[test]
    fn ipc_only_for_shell() {
        assert!(ipc_allowed(&u("tauri://localhost/index.html")));
        assert!(ipc_allowed(&u("http://tauri.localhost/")));
        assert!(!ipc_allowed(&u("https://gw.example.com/")));
        assert!(!ipc_allowed(&u("http://127.0.0.1:4410/")));
        assert!(!ipc_allowed(&u("tauri://localhost.evil.example/")));
        assert!(!ipc_allowed(&u("https://tauri.localhost/")));
    }
}
