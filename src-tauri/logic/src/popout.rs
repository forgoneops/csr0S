//! Pop-out windows: which `window.open` requests the shell honours and how
//! their labels are chosen. The Atrium (a guest page with no IPC) only asks
//! with `window.open("<gateway>/?pop=<view>&thread=<id>")`; the shell decides.

use url::Url;

pub const POP_PREFIX: &str = "pop-";
/// More windows than this are refused (each is a full webview).
pub const MAX_POPS: usize = 8;

fn is_view(v: &str) -> bool {
    !v.is_empty() && v.len() <= 40 && v.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// A request is honoured only when it targets the selected gateway origin and carries a sane `pop` view.
pub fn is_pop_request(target: &Url, gateway_origin: Option<&str>) -> bool {
    let Some(g) = gateway_origin else { return false };
    crate::gateway::origin_of(target).as_deref() == Some(g) && target.query_pairs().any(|(k, v)| k == "pop" && is_view(&v))
}

/// A popped window asks to be closed by navigating to `?pop-close=1` on the gateway (a page cannot close a window it did not open itself).
pub fn is_pop_close(target: &Url, gateway_origin: Option<&str>) -> bool {
    let Some(g) = gateway_origin else { return false };
    crate::gateway::origin_of(target).as_deref() == Some(g) && target.query_pairs().any(|(k, v)| k == "pop-close" && v == "1")
}

pub fn is_pop_label(label: &str) -> bool {
    label.strip_prefix(POP_PREFIX).is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}

/// Smallest `pop-N` (N from 1) not in `used`.
pub fn next_label(used: &[String]) -> String {
    (1..).map(|n| format!("{POP_PREFIX}{n}")).find(|l| !used.contains(l)).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    const GW: Option<&str> = Some("http://127.0.0.1:4479");
    fn u(s: &str) -> Url { Url::parse(s).unwrap() }

    #[test]
    fn close_request_is_the_gateway_only() {
        assert!(is_pop_close(&u("http://127.0.0.1:4479/?pop-close=1"), GW));
        assert!(!is_pop_close(&u("http://127.0.0.1:4479/?pop-close=0"), GW));
        assert!(!is_pop_close(&u("http://evil.example/?pop-close=1"), GW));
        assert!(!is_pop_close(&u("http://127.0.0.1:4479/?pop-close=1"), None));
    }

    #[test]
    fn honours_only_gateway_pop_urls() {
        assert!(is_pop_request(&u("http://127.0.0.1:4479/?pop=chat&thread=abc"), GW));
        assert!(!is_pop_request(&u("http://127.0.0.1:4479/?thread=abc"), GW));
        assert!(!is_pop_request(&u("http://127.0.0.1:4479/?pop=../x"), GW));
        assert!(!is_pop_request(&u("http://127.0.0.1:4479/?pop="), GW));
        assert!(!is_pop_request(&u("https://evil.example/?pop=chat"), GW));
        assert!(!is_pop_request(&u("http://127.0.0.1:4480/?pop=chat"), GW));
        assert!(!is_pop_request(&u("http://127.0.0.1:4479/?pop=chat"), None));
    }
    #[test]
    fn labels() {
        assert_eq!(next_label(&[]), "pop-1");
        assert_eq!(next_label(&["pop-1".into(), "pop-3".into()]), "pop-2");
        assert!(is_pop_label("pop-12")); assert!(!is_pop_label("pop-")); assert!(!is_pop_label("main")); assert!(!is_pop_label("pop-1x"));
    }
}
