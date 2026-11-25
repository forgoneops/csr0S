//! Why a health probe failed to connect.

use serde::{Deserialize, Serialize};
use std::io::ErrorKind;

/// Coarse classification of a connection failure, decided by the I/O layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectFailure {
    Refused,
    Timeout,
    Dns,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProbeReason {
    Refused,
    Timeout,
    Dns,
    Unreachable,
}

impl ConnectFailure {
    /// Map an I/O error kind seen while connecting or reading.
    pub fn from_io_kind(kind: ErrorKind) -> ConnectFailure {
        match kind {
            ErrorKind::ConnectionRefused => ConnectFailure::Refused,
            ErrorKind::TimedOut | ErrorKind::WouldBlock => ConnectFailure::Timeout,
            _ => ConnectFailure::Other,
        }
    }
}

impl From<ConnectFailure> for ProbeReason {
    fn from(f: ConnectFailure) -> ProbeReason {
        match f {
            ConnectFailure::Refused => ProbeReason::Refused,
            ConnectFailure::Timeout => ProbeReason::Timeout,
            ConnectFailure::Dns => ProbeReason::Dns,
            ConnectFailure::Other => ProbeReason::Unreachable,
        }
    }
}

impl ProbeReason {
    /// Reasons for which starting the local core makes sense.
    pub fn core_may_help(self) -> bool {
        matches!(self, ProbeReason::Refused | ProbeReason::Unreachable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failure_mapping() {
        assert_eq!(ProbeReason::from(ConnectFailure::Refused), ProbeReason::Refused);
        assert_eq!(ProbeReason::from(ConnectFailure::Timeout), ProbeReason::Timeout);
        assert_eq!(ProbeReason::from(ConnectFailure::Dns), ProbeReason::Dns);
        assert_eq!(ProbeReason::from(ConnectFailure::Other), ProbeReason::Unreachable);
    }

    #[test]
    fn io_kind_mapping() {
        assert_eq!(ConnectFailure::from_io_kind(ErrorKind::ConnectionRefused), ConnectFailure::Refused);
        assert_eq!(ConnectFailure::from_io_kind(ErrorKind::TimedOut), ConnectFailure::Timeout);
        assert_eq!(ConnectFailure::from_io_kind(ErrorKind::WouldBlock), ConnectFailure::Timeout);
        assert_eq!(ConnectFailure::from_io_kind(ErrorKind::PermissionDenied), ConnectFailure::Other);
    }

    #[test]
    fn core_help_only_when_nothing_listens() {
        assert!(ProbeReason::Refused.core_may_help());
        assert!(ProbeReason::Unreachable.core_may_help());
        assert!(!ProbeReason::Timeout.core_may_help());
        assert!(!ProbeReason::Dns.core_may_help());
    }
}
