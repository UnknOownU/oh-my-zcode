//! Session-start update notice: compare the installed plugin version against
//! the published marketplace and, when a newer one exists, append one line to
//! the injected doctrine. Fail-open by construction — every error path is
//! silent: a notice that cannot be established does not exist.
//!
//! Guardrails: the check runs at most once per 24h (state file), the fetch is
//! a 2s-capped anonymous GET of a public JSON (no payload, no identifier), and
//! `"disabled": true` in the state file is a kill switch. In production the
//! plugin root is derived from the binary's own location (`<root>/bin/`);
//! `ZCODE_PLUGIN_ROOT` is honored as an override (tests use it).

use serde::Deserialize;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_MARKETPLACE_URL: &str =
    "https://raw.githubusercontent.com/UnknOownU/oh-my-zcode/main/marketplace.json";
const CURL_TIMEOUT_SECS: &str = "2";
const RETRY_EVERY_MS: u64 = 24 * 60 * 60 * 1000;

#[derive(Deserialize)]
struct Marketplace {
    #[serde(default)]
    plugins: Vec<MarketplaceEntry>,
}

#[derive(Deserialize)]
struct MarketplaceEntry {
    name: String,
    version: String,
}

#[derive(Default, Deserialize, serde::Serialize)]
struct State {
    #[serde(default)]
    last_attempt_ms: u64,
    #[serde(default)]
    latest: Option<String>,
    #[serde(default)]
    disabled: bool,
}

/// One notice line, or None. Never returns an error.
pub(super) fn notice() -> Option<String> {
    let installed = installed_version()?;
    let state = load_state();
    if state.disabled {
        return None;
    }
    let latest = if fresh(&state) {
        state.latest.clone()
    } else {
        let latest = fetch_latest().or(state.latest);
        save_state(&State {
            last_attempt_ms: now_ms(),
            latest: latest.clone(),
            disabled: false,
        });
        latest
    }?;
    if !is_newer(&latest, &installed) {
        return None;
    }
    Some(format!(
        "UPDATE oh-my-zcode: {latest} available (installed {installed}) — \
         update via Settings > Plugins or `zcode plugins update oh-my-zcode@unknoownu`."
    ))
}

fn installed_version() -> Option<String> {
    let root = plugin_root()?;
    let manifest = std::fs::read_to_string(root.join(".zcode-plugin").join("plugin.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&manifest).ok()?;
    value.get("version")?.as_str().map(str::to_string)
}

fn plugin_root() -> Option<PathBuf> {
    if let Ok(root) = std::env::var("ZCODE_PLUGIN_ROOT") {
        return Some(PathBuf::from(root));
    }
    // The binary ships at <plugin root>/bin/oh-my-zcode(.exe).
    let exe = std::env::current_exe().ok()?;
    exe.parent()?.parent().map(PathBuf::from)
}

fn fresh(state: &State) -> bool {
    now_ms().saturating_sub(state.last_attempt_ms) < RETRY_EVERY_MS
}

fn fetch_latest() -> Option<String> {
    let url = std::env::var("OH_MY_ZCODE_UPDATE_URL")
        .unwrap_or_else(|_| DEFAULT_MARKETPLACE_URL.to_string());
    let output = Command::new("curl")
        .args(["-sS", "-f", "-L", "-m", CURL_TIMEOUT_SECS, &url])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let body = String::from_utf8(output.stdout).ok()?;
    let marketplace: Marketplace = serde_json::from_str(&body).ok()?;
    marketplace
        .plugins
        .into_iter()
        .find(|entry| entry.name == "oh-my-zcode")
        .map(|entry| entry.version)
}

fn state_path() -> PathBuf {
    if let Ok(path) = std::env::var("OH_MY_ZCODE_UPDATE_STATE") {
        return PathBuf::from(path);
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_or_else(|_| PathBuf::from("."), PathBuf::from);
    home.join(".zcode")
        .join("cli")
        .join("plugins")
        .join("data")
        .join("oh-my-zcode@unknoownu")
        .join("update-check.json")
}

fn load_state() -> State {
    std::fs::read_to_string(state_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_state(state: &State) {
    let path = state_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(
        &path,
        serde_json::to_string_pretty(state).unwrap_or_default(),
    );
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            u64::try_from(duration.as_millis()).unwrap_or(0)
        })
}

fn is_newer(candidate: &str, installed: &str) -> bool {
    match (parse_version(candidate), parse_version(installed)) {
        (Some(candidate), Some(installed)) => candidate > installed,
        _ => false,
    }
}

/// Strict `major.minor.patch`; a pre-release suffix is tolerated on the patch
/// component and ignored ("3.1.0-rc.2" parses as 3.1.0). Anything else is
/// unparseable, and an unparseable candidate never triggers a notice.
fn parse_version(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts
        .next()?
        .split(|c: char| !c.is_ascii_digit())
        .next()
        .filter(|digits| !digits.is_empty())
        .and_then(|digits| digits.parse().ok())
        .unwrap_or(0);
    Some((major, minor, patch))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_versions_are_detected() {
        assert!(is_newer("3.1.0", "3.0.0"));
        assert!(is_newer("3.0.1", "3.0.0"));
        assert!(is_newer("4.0.0", "3.9.9"));
        assert!(!is_newer("3.0.0", "3.0.0"));
        assert!(!is_newer("3.0.0", "3.1.0"));
    }

    #[test]
    fn garbage_never_triggers_a_notice() {
        assert!(!is_newer("garbage", "3.0.0"));
        assert!(!is_newer("3.1", "3.0.0"));
        assert!(!is_newer("", "3.0.0"));
    }

    #[test]
    fn prerelease_patch_is_tolerated_and_ignored() {
        assert!(is_newer("3.1.0-rc.2", "3.0.9"));
        assert!(!is_newer("3.1.0-beta.1", "3.1.0"));
    }

    #[test]
    fn marketplace_entry_is_found_by_name() {
        let body = r#"{"plugins":[
            {"name":"other","version":"9.9.9"},
            {"name":"oh-my-zcode","version":"3.1.0"}
        ]}"#;
        let marketplace: Marketplace = serde_json::from_str(body).unwrap();
        let entry = marketplace
            .plugins
            .into_iter()
            .find(|entry| entry.name == "oh-my-zcode")
            .unwrap();
        assert_eq!(entry.version, "3.1.0");
    }

    #[test]
    fn state_round_trips_with_defaults() {
        let state: State =
            serde_json::from_str(r#"{"last_attempt_ms":123,"latest":"3.1.0"}"#).unwrap();
        assert_eq!(state.last_attempt_ms, 123);
        assert_eq!(state.latest.as_deref(), Some("3.1.0"));
        assert!(!state.disabled);
    }
}
