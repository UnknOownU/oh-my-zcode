use serde_json::json;
use std::{
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

fn blocked(
    event: &str,
    root: &Path,
    input: &serde_json::Value,
) -> Result<bool, Box<dyn std::error::Error>> {
    let payload = json!({"session_id":"review","cwd":root,"tool_input":input});
    let mut child = Command::new(env!("CARGO_BIN_EXE_oh-my-zcode"))
        .args(["hook", event])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .ok_or("stdin unavailable")?
        .write_all(&serde_json::to_vec(&payload)?)?;
    let output = child.wait_with_output()?;
    assert!(output.status.success());
    Ok(!output.stdout.is_empty())
}

fn armed() -> Result<tempfile::TempDir, Box<dyn std::error::Error>> {
    let root = tempfile::tempdir()?;
    let path = root.path().join(".oh-my-zcode/security");
    std::fs::create_dir_all(&path)?;
    std::fs::write(
        path.join("active_scope.json"),
        serde_json::to_vec(&json!({
            "targets":["x.example.com"],"env":"dev","source":"invocation",
            "granted_at":"2020-01-01T00:00:00Z","expires_at":"2099-01-01T00:00:00Z"
        }))?,
    )?;
    Ok(root)
}

#[test]
fn execution_boundary_denies_unsupported_attack_forms() {
    let root = tempfile::tempdir().expect("workspace");
    for command in [
        "exec nuclei -u https://evil.test",
        "bash -c 'exec nuclei -u https://evil.test'",
        "timeout 10 nuclei -u https://evil.test",
        "env -C /tmp nuclei -u https://evil.test",
        "sudo -R / nuclei -u https://evil.test",
        "powershell -EncodedCommand bgB1AGMAbABlAGkA",
        "powershell -ec bgB1AGMAbABlAGkA",
        "cmd /c call nuclei -u https://evil.test",
        "nu{cl,zz}ei -u https://evil.test",
        "python -m sqlmap -u https://evil.test",
    ] {
        assert!(
            blocked("scope", root.path(), &json!({"command":command})).expect("hook response"),
            "{command}"
        );
    }
}

#[test]
fn execution_boundary_preserves_benign_wrapper_commands() {
    let root = tempfile::tempdir().expect("workspace");
    for command in [
        "exec grep nuclei README.md",
        "timeout 10 echo nuclei",
        "env -C /tmp grep nuclei README.md",
        "sudo -R / grep nuclei README.md",
        "cmd /c call echo nuclei",
        "python -m pytest -q",
    ] {
        assert!(
            !blocked("scope", root.path(), &json!({"command":command})).expect("hook response"),
            "{command}"
        );
    }
}

#[test]
fn scoped_execution_rejects_every_unproven_target() {
    let root = armed().expect("scope");
    for command in [
        "nmap evil.example.com",
        "nuclei -l evil-hosts.txt",
        "nuclei -u h\"tt\"ps://evil.example/path",
        "curl h\"tt\"ps://evil.example/path",
        "nuclei -u https://x.example.com -u evil.example.com",
        "nuclei -u https://x.example.com -l targets.txt",
        "nmap x.example.com evil.example.com",
    ] {
        assert!(
            blocked("scope", root.path(), &json!({"command":command})).expect("hook response"),
            "{command}"
        );
    }
}

#[test]
fn scoped_execution_accepts_supported_explicit_targets() {
    let root = armed().expect("scope");
    for command in [
        "nmap x.example.com",
        "nuclei -u https://x.example.com",
        "nuclei -u https://x.example.com -silent",
        "curl h\"tt\"ps://x.example.com/path",
        "grep nuclei README.md",
    ] {
        assert!(
            !blocked("scope", root.path(), &json!({"command":command})).expect("hook response"),
            "{command}"
        );
    }
}

#[test]
fn tagged_dispatch_requires_explicit_confined_targets() {
    let root = armed().expect("scope");
    for prompt in [
        "[ohmy-redteam review] run nmap against evil.example.com",
        "[ohmy-redteam review] check https://x.example.com and evil.example.com",
    ] {
        assert!(
            blocked("dispatch", root.path(), &json!({"prompt":prompt})).expect("hook response"),
            "{prompt}"
        );
    }
    assert!(
        !blocked(
            "dispatch",
            root.path(),
            &json!({"prompt":"[ohmy-redteam review] inspect https://x.example.com"})
        )
        .expect("hook response")
    );
}
