#![allow(
    clippy::expect_used,
    clippy::indexing_slicing,
    reason = "test fixtures and assertions"
)]
use oh_my_zcode::scope::read_scope;
use serde_json::json;
use std::{
    fs,
    time::{Duration, SystemTime},
};

fn fixture(root: &std::path::Path, overrides: &serde_json::Value) {
    let mut scope = json!({"targets":["*.example.com:443"],"env":"staging","granted_at":"2020-01-01T00:00:00Z","expires_at":"2099-01-01T00:00:00Z","source":"invocation"});
    for (key, value) in overrides.as_object().expect("object") {
        scope[key] = value.clone();
    }
    let directory = root.join(".oh-my-zcode/security");
    fs::create_dir_all(&directory).expect("fixture directory");
    fs::write(directory.join("active_scope.json"), scope.to_string()).expect("fixture scope");
}

#[test]
fn current_scope_requires_valid_invocation_and_window() {
    let root = tempfile::tempdir().expect("temporary workspace");
    fixture(root.path(), &json!({}));
    let now = SystemTime::UNIX_EPOCH + Duration::from_hours(500_000);
    let scope = read_scope(root.path(), now)
        .expect("scope read")
        .expect("armed");
    assert_eq!(scope.env(), "staging");
    assert!(scope.permits_url("https://api.example.com"));
    assert!(!scope.permits_url("https://example.com"));
    assert!(!scope.permits_url("http://api.example.com"));
    for invalid in [
        json!({"env":"prod"}),
        json!({"env":"unknown"}),
        json!({"source":"userConfig"}),
        json!({"targets":[]}),
        json!({"expires_at":"not-a-date"}),
        json!({"expires_at":"2021-01-01T00:00:00Z"}),
        json!({"granted_at":"2098-01-01T00:00:00Z"}),
    ] {
        fixture(root.path(), &invalid);
        assert!(
            read_scope(root.path(), now)
                .expect("read invalid scope")
                .is_none()
        );
        assert!(
            root.path()
                .join(".oh-my-zcode/security/active_scope.json")
                .exists()
        );
    }
}

#[test]
fn host_patterns_normalize_idn_and_preserve_explicit_ports() {
    let root = tempfile::tempdir().expect("temporary workspace");
    for (target, allowed, denied) in [
        (
            "localhost",
            "http://localhost:1234",
            "http://evil.localhost:1234",
        ),
        (
            "https://example.com:443/path",
            "https://example.com",
            "https://example.com:8443",
        ),
        ("[::1]:3000", "http://[::1]:3000", "http://[::1]:3001"),
        (
            "bücher.example",
            "https://xn--bcher-kva.example",
            "https://evil.example",
        ),
        (
            "*.example.com",
            "https://a.b.example.com:8080",
            "https://badexample.com",
        ),
    ] {
        fixture(root.path(), &json!({"targets":[target]}));
        let scope = read_scope(root.path(), SystemTime::now())
            .expect("read")
            .expect(target);
        assert!(scope.permits_url(allowed), "{target} rejects {allowed}");
        assert!(!scope.permits_url(denied), "{target} admits {denied}");
    }
}

#[test]
fn unknown_fields_and_malformed_target_fail_closed_without_writes() {
    let root = tempfile::tempdir().expect("temporary workspace");
    for invalid in [
        json!({"extra":true}),
        json!({"targets":["user@example.com"]}),
        json!({"targets":["example.com:"]}),
        json!({"targets":["file:///tmp"]}),
        json!({"targets":["*.127.0.0.1"]}),
    ] {
        fixture(root.path(), &invalid);
        assert!(
            read_scope(root.path(), SystemTime::now())
                .expect("read")
                .is_none()
        );
    }
    fs::write(
        root.path().join(".oh-my-zcode/security/active_scope.json"),
        "{",
    )
    .expect("malformed fixture");
    assert!(
        read_scope(root.path(), SystemTime::now())
            .expect("read")
            .is_none()
    );
}

#[test]
fn bare_hosts_require_an_unrestricted_port_scope() {
    let root = tempfile::tempdir().expect("temporary workspace");
    for (target, host) in [
        ("example.com", "EXAMPLE.COM"),
        ("*.example.com", "deep.api.example.com"),
        ("bücher.example", "xn--bcher-kva.example"),
        ("127.0.0.1", "127.0.0.1"),
        ("[::1]", "0:0:0:0:0:0:0:1"),
        ("[::ffff:127.0.0.1]", "::ffff:127.0.0.1"),
        ("example.com", "example.com."),
    ] {
        fixture(root.path(), &json!({"targets":[target]}));
        let scope = read_scope(root.path(), SystemTime::now())
            .expect("read")
            .expect("armed");
        assert!(scope.permits_host(host), "{target} rejects {host}");
        assert!(!scope.permits_host("outside.example.net"));
    }
    for target in [
        "example.com:443",
        "https://example.com:443/path",
        "*.example.com:443",
    ] {
        fixture(root.path(), &json!({"targets":[target]}));
        let scope = read_scope(root.path(), SystemTime::now())
            .expect("read")
            .expect("armed");
        assert!(
            !scope.permits_host("example.com"),
            "ported scope {target} admits all-port host"
        );
        assert!(
            !scope.permits_host("api.example.com"),
            "ported scope {target} admits all-port host"
        );
    }
}

#[test]
fn bare_hosts_reject_ambiguous_and_aggregate_target_syntax() {
    let root = tempfile::tempdir().expect("temporary workspace");
    fixture(
        root.path(),
        &json!({"targets":["127.0.0.1","[::1]","example.com","*.example.com"]}),
    );
    let scope = read_scope(root.path(), SystemTime::now())
        .expect("read")
        .expect("armed");
    for host in [
        "https://example.com",
        "example.com:443",
        "example.com/path",
        "user@example.com",
        "*.example.com",
        "127.0.0.1/8",
        "127.0.0.1-2",
        "127.1",
        "2130706433",
        "0x7f000001",
        "0177.0.0.1",
        "127.0.0.01",
        "%65xample.com",
        "[::1]",
        " example.com",
        "example.com ",
        "a..example.com",
        "-a.example.com",
        "a-.example.com",
    ] {
        assert!(
            !scope.permits_host(host),
            "unsafe host expression authorized: {host}"
        );
    }
    fixture(root.path(), &json!({"targets":["*.example.com"]}));
    let scope = read_scope(root.path(), SystemTime::now())
        .expect("read")
        .expect("armed");
    assert!(!scope.permits_host("example.com"), "wildcard admits apex");
    assert!(
        !scope.permits_host("badexample.com"),
        "wildcard crosses label boundary"
    );
}

#[test]
fn numeric_ranges_are_not_hosts_even_if_written_as_scope_targets() {
    let root = tempfile::tempdir().expect("temporary workspace");
    fixture(root.path(), &json!({"targets":["127.0.0.1-2"]}));
    let scope = read_scope(root.path(), SystemTime::now())
        .expect("read")
        .expect("armed");
    assert!(!scope.permits_host("127.0.0.1-2"));
}
