//! Gateway registry: the local entry first, remote entries only when the
//! person adds them.

use crate::gateway::{validate_address, AddressError};
use serde::{Deserialize, Serialize};

pub const DEFAULT_LOCAL_ADDRESS: &str = "http://127.0.0.1:4410";
pub const LOCAL_ID: &str = "local";
pub const LOCAL_NAME: &str = "This device";
pub const MAX_GATEWAYS: usize = 8;
pub const MAX_NAME_CHARS: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GatewayKind {
    Local,
    Remote,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Gateway {
    pub id: String,
    pub name: String,
    pub address: String,
    pub kind: GatewayKind,
    pub builtin: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistryError {
    BadName,
    BadAddress(AddressError),
    Duplicate,
    LimitReached,
    UnknownId,
    Builtin,
}

impl std::fmt::Display for RegistryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RegistryError::BadName => write!(f, "name must be 1 to {MAX_NAME_CHARS} characters"),
            RegistryError::BadAddress(e) => write!(f, "{e}"),
            RegistryError::Duplicate => f.write_str("this address is already in the list"),
            RegistryError::LimitReached => write!(f, "at most {MAX_GATEWAYS} gateways are allowed"),
            RegistryError::UnknownId => f.write_str("unknown gateway"),
            RegistryError::Builtin => f.write_str("the built-in entry cannot be removed"),
        }
    }
}

impl std::error::Error for RegistryError {}

impl From<AddressError> for RegistryError {
    fn from(e: AddressError) -> Self {
        RegistryError::BadAddress(e)
    }
}

#[derive(Debug, Clone)]
pub struct Registry {
    gateways: Vec<Gateway>,
    selected: String,
}

fn clean_name(name: &str) -> Result<String, RegistryError> {
    let n = name.trim();
    let len = n.chars().count();
    if len == 0 || len > MAX_NAME_CHARS || n.chars().any(|c| c.is_control()) {
        return Err(RegistryError::BadName);
    }
    Ok(n.to_string())
}

impl Registry {
    /// Registry holding only the local entry. An invalid `local_address`
    /// (for example from a bad environment variable) falls back to the default.
    pub fn new_default(local_address: &str) -> Registry {
        let address = validate_address(local_address).unwrap_or_else(|_| DEFAULT_LOCAL_ADDRESS.to_string());
        Registry {
            gateways: vec![Gateway {
                id: LOCAL_ID.to_string(),
                name: LOCAL_NAME.to_string(),
                address,
                kind: GatewayKind::Local,
                builtin: true,
            }],
            selected: LOCAL_ID.to_string(),
        }
    }

    /// Rebuild from stored remotes (id, name, address); invalid or duplicate
    /// entries are dropped, an unknown `selected` falls back to local.
    pub fn from_parts(local_address: &str, remotes: &[(String, String, String)], selected: &str) -> Registry {
        let mut reg = Registry::new_default(local_address);
        for (id, name, address) in remotes {
            if id == LOCAL_ID || reg.gateways.iter().any(|g| &g.id == id) {
                continue;
            }
            if let Ok(g) = reg.add(name, address) {
                // keep the stored id so a saved `selected` stays valid
                if let Some(last) = reg.gateways.last_mut() {
                    last.id = id.clone();
                    debug_assert_eq!(last.address, g.address);
                }
            }
        }
        if reg.gateways.iter().any(|g| g.id == selected) {
            reg.selected = selected.to_string();
        }
        reg
    }

    pub fn gateways(&self) -> &[Gateway] {
        &self.gateways
    }

    pub fn selected(&self) -> &Gateway {
        self.gateways
            .iter()
            .find(|g| g.id == self.selected)
            .unwrap_or(&self.gateways[0])
    }

    fn next_id(&self) -> String {
        (1usize..)
            .map(|n| format!("g{n}"))
            .find(|id| !self.gateways.iter().any(|g| &g.id == id))
            .expect("unbounded range")
    }

    pub fn add(&mut self, name: &str, address: &str) -> Result<Gateway, RegistryError> {
        let name = clean_name(name)?;
        let address = validate_address(address)?;
        if self.gateways.len() >= MAX_GATEWAYS {
            return Err(RegistryError::LimitReached);
        }
        if self.gateways.iter().any(|g| g.address == address) {
            return Err(RegistryError::Duplicate);
        }
        let gw = Gateway { id: self.next_id(), name, address, kind: GatewayKind::Remote, builtin: false };
        self.gateways.push(gw.clone());
        Ok(gw)
    }

    /// Remove a remote entry; when it was selected the local entry is selected.
    pub fn remove(&mut self, id: &str) -> Result<(), RegistryError> {
        let idx = self.gateways.iter().position(|g| g.id == id).ok_or(RegistryError::UnknownId)?;
        if self.gateways[idx].builtin {
            return Err(RegistryError::Builtin);
        }
        self.gateways.remove(idx);
        if self.selected == id {
            self.selected = LOCAL_ID.to_string();
        }
        Ok(())
    }

    pub fn select(&mut self, id: &str) -> Result<&Gateway, RegistryError> {
        let idx = self.gateways.iter().position(|g| g.id == id).ok_or(RegistryError::UnknownId)?;
        self.selected = id.to_string();
        Ok(&self.gateways[idx])
    }

    pub fn set_local_address(&mut self, address: &str) -> Result<(), RegistryError> {
        let address = validate_address(address)?;
        self.gateways[0].address = address;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reg() -> Registry {
        Registry::new_default(DEFAULT_LOCAL_ADDRESS)
    }

    #[test]
    fn default_has_one_builtin_local_first() {
        let r = reg();
        assert_eq!(r.gateways().len(), 1);
        let g = &r.gateways()[0];
        assert_eq!((g.id.as_str(), g.name.as_str()), ("local", "This device"));
        assert_eq!(g.kind, GatewayKind::Local);
        assert!(g.builtin);
        assert_eq!(g.address, "http://127.0.0.1:4410");
        assert_eq!(r.selected().id, "local");
    }

    #[test]
    fn invalid_local_address_falls_back() {
        let r = Registry::new_default("http://evil.example");
        assert_eq!(r.gateways()[0].address, DEFAULT_LOCAL_ADDRESS);
        let r = Registry::new_default("http://localhost:9000/");
        assert_eq!(r.gateways()[0].address, "http://localhost:9000");
    }

    #[test]
    fn add_remote_entries() {
        let mut r = reg();
        let a = r.add("Work", "https://a.example.com").unwrap();
        let b = r.add("Home", "https://b.example.com/").unwrap();
        assert_eq!((a.id.as_str(), b.id.as_str()), ("g1", "g2"));
        assert_eq!(a.kind, GatewayKind::Remote);
        assert!(!a.builtin);
        assert_eq!(b.address, "https://b.example.com");
        assert_eq!(r.gateways().len(), 3);
        assert_eq!(r.gateways()[0].id, "local");
    }

    #[test]
    fn duplicate_rejected() {
        let mut r = reg();
        r.add("A", "https://a.example.com").unwrap();
        assert_eq!(r.add("B", "https://A.example.com/"), Err(RegistryError::Duplicate));
        assert_eq!(r.add("C", "http://127.0.0.1:4410/"), Err(RegistryError::Duplicate));
    }

    #[test]
    fn builtin_remove_rejected_remote_ok() {
        let mut r = reg();
        assert_eq!(r.remove("local"), Err(RegistryError::Builtin));
        assert_eq!(r.remove("nope"), Err(RegistryError::UnknownId));
        let g = r.add("A", "https://a.example.com").unwrap();
        r.select(&g.id).unwrap();
        r.remove(&g.id).unwrap();
        assert_eq!(r.selected().id, "local");
        assert_eq!(r.gateways().len(), 1);
    }

    #[test]
    fn select_unknown_rejected() {
        let mut r = reg();
        assert_eq!(r.select("zzz").err(), Some(RegistryError::UnknownId));
        let g = r.add("A", "https://a.example.com").unwrap();
        assert_eq!(r.select(&g.id).unwrap().name, "A");
        assert_eq!(r.selected().id, g.id);
    }

    #[test]
    fn max_eight() {
        let mut r = reg();
        for i in 0..7 {
            r.add("N", &format!("https://h{i}.example.com")).unwrap();
        }
        assert_eq!(r.gateways().len(), 8);
        assert_eq!(r.add("N", "https://extra.example.com"), Err(RegistryError::LimitReached));
    }

    #[test]
    fn name_rules() {
        let mut r = reg();
        assert_eq!(r.add("   ", "https://a.example.com"), Err(RegistryError::BadName));
        assert_eq!(r.add(&"x".repeat(41), "https://a.example.com"), Err(RegistryError::BadName));
        assert_eq!(r.add(&"x".repeat(40), "https://a.example.com").unwrap().name.len(), 40);
        let g = r.add("  Padded  ", "https://b.example.com").unwrap();
        assert_eq!(g.name, "Padded");
        assert!(matches!(r.add("A", "http://b.example.com"), Err(RegistryError::BadAddress(_))));
    }

    #[test]
    fn set_local_address_validates() {
        let mut r = reg();
        r.set_local_address("http://127.0.0.1:5000/").unwrap();
        assert_eq!(r.gateways()[0].address, "http://127.0.0.1:5000");
        assert!(r.set_local_address("javascript:1").is_err());
        assert_eq!(r.gateways()[0].address, "http://127.0.0.1:5000");
    }

    #[test]
    fn from_parts_restores_ids_and_selection() {
        let remotes = vec![
            ("g7".to_string(), "Work".to_string(), "https://a.example.com".to_string()),
            ("g8".to_string(), "Bad".to_string(), "http://bad.example.com".to_string()),
            ("local".to_string(), "Spoof".to_string(), "https://c.example.com".to_string()),
        ];
        let r = Registry::from_parts(DEFAULT_LOCAL_ADDRESS, &remotes, "g7");
        assert_eq!(r.gateways().len(), 2);
        assert_eq!(r.selected().id, "g7");
        let r = Registry::from_parts(DEFAULT_LOCAL_ADDRESS, &remotes, "missing");
        assert_eq!(r.selected().id, "local");
    }
}
