//! HTTP health probe over std::net (no http crate).

use shell_logic::probe_reason::{ConnectFailure, ProbeReason};
use shell_logic::status::{is_online_status, parse_status_line};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;
use url::Url;

const TIMEOUT: Duration = Duration::from_secs(3);
const MAX_RESPONSE_BYTES: u64 = 4096;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProbeResult {
    /// 2xx/3xx answer (None for an https gateway where only TCP was checked).
    Online(Option<u16>),
    /// The server answered, but not with 2xx/3xx.
    HttpStatus(u16),
    Failed(ProbeReason, String),
    BadUrl,
}

/// Probe `{address}/api/health`.
///
/// std::net cannot speak TLS and the task forbids extra dependencies, so for
/// an https gateway only the TCP connect is checked; the webview then shows
/// any TLS problem itself.
pub fn probe(address: &str) -> ProbeResult {
    let Ok(url) = Url::parse(address) else {
        return ProbeResult::BadUrl;
    };
    let Some(host) = url.host_str() else {
        return ProbeResult::BadUrl;
    };
    let Some(port) = url.port_or_known_default() else {
        return ProbeResult::BadUrl;
    };
    let https = url.scheme() == "https";
    if !https && url.scheme() != "http" {
        return ProbeResult::BadUrl;
    }

    // Resolve (IPv6 hosts keep their brackets in host_str; strip for resolving).
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    let addrs: Vec<_> = match (bare, port).to_socket_addrs() {
        Ok(it) => it.collect(),
        Err(e) => return ProbeResult::Failed(ConnectFailure::Dns.into(), e.to_string()),
    };
    if addrs.is_empty() {
        return ProbeResult::Failed(ConnectFailure::Dns.into(), "no address".to_string());
    }

    let mut last_err = None;
    let mut stream = None;
    for a in &addrs {
        match TcpStream::connect_timeout(a, TIMEOUT) {
            Ok(s) => {
                stream = Some(s);
                break;
            }
            Err(e) => last_err = Some(e),
        }
    }
    let Some(mut stream) = stream else {
        let e = last_err.expect("at least one address was tried");
        return ProbeResult::Failed(ConnectFailure::from_io_kind(e.kind()).into(), e.to_string());
    };
    if https {
        return ProbeResult::Online(None);
    }

    let _ = stream.set_read_timeout(Some(TIMEOUT));
    let _ = stream.set_write_timeout(Some(TIMEOUT));
    let path = url.path().trim_end_matches('/');
    let host_header = match url.port() {
        Some(p) => format!("{host}:{p}"),
        None => host.to_string(),
    };
    let req = format!(
        "GET {path}/api/health HTTP/1.1\r\nHost: {host_header}\r\nConnection: close\r\nUser-Agent: caesaros-shell/0.1.0\r\n\r\n"
    );
    if let Err(e) = stream.write_all(req.as_bytes()) {
        return ProbeResult::Failed(ConnectFailure::from_io_kind(e.kind()).into(), e.to_string());
    }
    let mut buf = Vec::new();
    let read = (&mut stream).take(MAX_RESPONSE_BYTES).read_to_end(&mut buf);
    // A timeout after a partial answer is fine as long as the status line arrived.
    let text = String::from_utf8_lossy(&buf);
    match parse_status_line(&text) {
        Some(code) if is_online_status(code) => ProbeResult::Online(Some(code)),
        Some(code) => ProbeResult::HttpStatus(code),
        None => match read {
            Err(e) => ProbeResult::Failed(ConnectFailure::from_io_kind(e.kind()).into(), e.to_string()),
            Ok(_) => ProbeResult::Failed(ProbeReason::Unreachable, "not an HTTP answer".to_string()),
        },
    }
}
