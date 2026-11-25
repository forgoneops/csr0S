//! Gateway address validation and normalisation.

use std::net::IpAddr;
use url::{Host, Url};

/// Longest accepted address, in bytes.
pub const MAX_ADDRESS_LEN: usize = 2048;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AddressError {
    Empty,
    TooLong,
    Unparseable,
    BadScheme,
    Credentials,
    Fragment,
    NoHost,
    BadPort,
    InsecureRemote,
}

impl std::fmt::Display for AddressError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            AddressError::Empty => "address is empty",
            AddressError::TooLong => "address is too long",
            AddressError::Unparseable => "address is not a valid URL",
            AddressError::BadScheme => "address must start with http:// or https://",
            AddressError::Credentials => "address must not contain a username or password",
            AddressError::Fragment => "address must not contain a fragment",
            AddressError::NoHost => "address has no host",
            AddressError::BadPort => "port 0 is not allowed",
            AddressError::InsecureRemote => "plain http is only allowed for this device; use https",
        };
        f.write_str(s)
    }
}

impl std::error::Error for AddressError {}

/// True when the host is localhost or a loopback IP (127.0.0.0/8, ::1).
pub fn is_loopback_host(host: &Host<&str>) -> bool {
    match host {
        Host::Domain(d) => d.eq_ignore_ascii_case("localhost"),
        Host::Ipv4(ip) => IpAddr::V4(*ip).is_loopback(),
        Host::Ipv6(ip) => IpAddr::V6(*ip).is_loopback(),
    }
}

/// True when the URL points at a loopback host.
pub fn is_loopback_url(url: &Url) -> bool {
    url.host().map(|h| is_loopback_host(&h)).unwrap_or(false)
}

/// Validate and normalise a gateway address. Returns the normalised string.
pub fn validate_address(input: &str) -> Result<String, AddressError> {
    let s = input.trim();
    if s.is_empty() {
        return Err(AddressError::Empty);
    }
    if s.len() > MAX_ADDRESS_LEN {
        return Err(AddressError::TooLong);
    }
    let url = Url::parse(s).map_err(|_| AddressError::Unparseable)?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err(AddressError::BadScheme),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AddressError::Credentials);
    }
    if url.fragment().is_some() {
        return Err(AddressError::Fragment);
    }
    let host = url.host().ok_or(AddressError::NoHost)?;
    if url.port() == Some(0) {
        return Err(AddressError::BadPort);
    }
    if url.scheme() == "http" && !is_loopback_host(&host) {
        return Err(AddressError::InsecureRemote);
    }
    // Url already lowercases the host and drops the default port.
    let mut out = url.as_str().to_string();
    if url.path() == "/" && url.query().is_none() && out.ends_with('/') {
        out.pop();
    }
    Ok(out)
}

/// "scheme://host[:port]" of an address, or None when it does not parse.
pub fn gateway_origin(address: &str) -> Option<String> {
    let url = Url::parse(address.trim()).ok()?;
    origin_of(&url)
}

/// "scheme://host[:port]" of a parsed URL (None when there is no host).
pub fn origin_of(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    Some(match url.port() {
        Some(p) => format!("{}://{}:{}", url.scheme(), host, p),
        None => format!("{}://{}", url.scheme(), host),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_addresses() {
        assert_eq!(validate_address("https://gw.example.com").unwrap(), "https://gw.example.com");
        assert_eq!(validate_address("  https://GW.Example.com/ ").unwrap(), "https://gw.example.com");
        assert_eq!(validate_address("https://gw.example.com:443/").unwrap(), "https://gw.example.com");
        assert_eq!(validate_address("https://gw.example.com:8443").unwrap(), "https://gw.example.com:8443");
        assert_eq!(validate_address("https://gw.example.com/app/").unwrap(), "https://gw.example.com/app/");
        assert_eq!(validate_address("https://gw.example.com/?a=1").unwrap(), "https://gw.example.com/?a=1");
    }

    #[test]
    fn loopback_http_allowed() {
        assert_eq!(validate_address("http://127.0.0.1:4410").unwrap(), "http://127.0.0.1:4410");
        assert_eq!(validate_address("http://localhost:4410/").unwrap(), "http://localhost:4410");
        assert_eq!(validate_address("http://127.5.6.7").unwrap(), "http://127.5.6.7");
        assert_eq!(validate_address("http://[::1]:4410").unwrap(), "http://[::1]:4410");
        assert_eq!(validate_address("http://127.0.0.1:80").unwrap(), "http://127.0.0.1");
    }

    #[test]
    fn http_remote_rejected() {
        assert_eq!(validate_address("http://gw.example.com"), Err(AddressError::InsecureRemote));
        assert_eq!(validate_address("http://172.16.0.1:4410"), Err(AddressError::InsecureRemote));
        assert_eq!(validate_address("http://[2001:db8::1]"), Err(AddressError::InsecureRemote));
        assert_eq!(validate_address("http://localhost.evil.example"), Err(AddressError::InsecureRemote));
    }

    #[test]
    fn credentials_rejected() {
        assert_eq!(validate_address("https://user:pw@example.com"), Err(AddressError::Credentials));
        assert_eq!(validate_address("https://user@example.com"), Err(AddressError::Credentials));
        assert_eq!(validate_address("http://127.0.0.1@example.com"), Err(AddressError::Credentials));
    }

    #[test]
    fn bad_schemes_rejected() {
        for s in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hi",
            "tauri://localhost",
            "ftp://gw.example.com",
            "caesaros://open",
            "gw.example.com",
        ] {
            assert!(validate_address(s).is_err(), "{s} must be rejected");
        }
        assert_eq!(validate_address("javascript:alert(1)"), Err(AddressError::BadScheme));
        assert_eq!(validate_address("file:///etc/passwd"), Err(AddressError::BadScheme));
        assert_eq!(validate_address("data:text/html,hi"), Err(AddressError::BadScheme));
        assert_eq!(validate_address("tauri://localhost"), Err(AddressError::BadScheme));
    }

    #[test]
    fn fragment_port_empty_long() {
        assert_eq!(validate_address("https://gw.example.com/#x"), Err(AddressError::Fragment));
        assert_eq!(validate_address("https://gw.example.com/#"), Err(AddressError::Fragment));
        assert_eq!(validate_address("https://gw.example.com:0"), Err(AddressError::BadPort));
        assert_eq!(validate_address(""), Err(AddressError::Empty));
        assert_eq!(validate_address("   "), Err(AddressError::Empty));
        let long = format!("https://gw.example.com/{}", "a".repeat(2100));
        assert_eq!(validate_address(&long), Err(AddressError::TooLong));
    }

    #[test]
    fn origins() {
        assert_eq!(gateway_origin("https://gw.example.com/x/y").as_deref(), Some("https://gw.example.com"));
        assert_eq!(gateway_origin("http://127.0.0.1:4410").as_deref(), Some("http://127.0.0.1:4410"));
        assert_eq!(gateway_origin("http://[::1]:4410/a").as_deref(), Some("http://[::1]:4410"));
        assert_eq!(gateway_origin("nonsense"), None);
    }
}
