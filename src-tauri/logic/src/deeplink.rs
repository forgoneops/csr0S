//! Deep link classification. A deep link can only bring the picker to the
//! front: it never navigates and never adds a gateway, whatever its payload.

use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeepLinkAction {
    FocusPicker,
    Ignore,
}

pub const SCHEME: &str = "caesaros";

pub fn classify(input: &str) -> DeepLinkAction {
    match Url::parse(input.trim()) {
        Ok(u) if u.scheme() == SCHEME => DeepLinkAction::FocusPicker,
        _ => DeepLinkAction::Ignore,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caesaros_scheme_focuses_picker() {
        assert_eq!(classify("caesaros://open"), DeepLinkAction::FocusPicker);
        assert_eq!(classify("caesaros://g?url=https://evil.example"), DeepLinkAction::FocusPicker);
        assert_eq!(classify("CAESAROS://open"), DeepLinkAction::FocusPicker);
    }

    #[test]
    fn everything_else_ignored() {
        assert_eq!(classify("https://evil.example"), DeepLinkAction::Ignore);
        assert_eq!(classify("javascript:alert(1)"), DeepLinkAction::Ignore);
        assert_eq!(classify("file:///etc/passwd"), DeepLinkAction::Ignore);
        assert_eq!(classify("caesaros"), DeepLinkAction::Ignore);
        assert_eq!(classify("%%% garbage"), DeepLinkAction::Ignore);
        assert_eq!(classify(""), DeepLinkAction::Ignore);
    }
}
