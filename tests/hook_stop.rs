use serde::Deserialize;
use serde_json::json;
use std::{
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

#[derive(Debug, Deserialize)]
struct Block {
    decision: String,
    reason: String,
}

fn stop(workspace: &Path, message: &str) -> Result<Option<Block>, Box<dyn std::error::Error>> {
    let input = json!({"cwd":workspace,"session_id":"session",
        "last_assistant_message":message});
    let mut child = Command::new(env!("CARGO_BIN_EXE_oh-my-zcode"))
        .args(["hook", "stop"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .ok_or("stdin unavailable")?
        .write_all(&serde_json::to_vec(&input)?)?;
    let output = child.wait_with_output()?;
    assert!(output.status.success());
    if output.stdout.is_empty() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&output.stdout)?))
}

fn unwritable_receipts() -> Result<tempfile::TempDir, std::io::Error> {
    let workspace = tempfile::tempdir()?;
    std::fs::create_dir_all(workspace.path().join(".oh-my-zcode/receipts/session.jsonl"))?;
    Ok(workspace)
}

#[test]
fn reports_persistence_failure_when_turn_boundary_cannot_be_written() {
    let given = unwritable_receipts().expect("unwritable journal");
    let when = stop(given.path(), "VERDICT: FAIL")
        .expect("stop response")
        .expect("blocked");
    assert_eq!(when.decision, "block");
    assert!(!when.reason.is_empty());
}

#[test]
fn successful_turn_closure_consumes_a_previously_valid_receipt() {
    use oh_my_zcode::proof::{self, Claim, ExecutionResult, ProofContext};
    let given = tempfile::tempdir().expect("workspace");
    std::fs::write(given.path().join("source.js"), "original").expect("source");
    let context = ProofContext {
        root: given.path().to_path_buf(),
        cwd: given.path().to_path_buf(),
        session_id: "session".into(),
        tool_use_id: "check".into(),
        command: "npm test".into(),
    };
    let raw =
        serde_json::value::RawValue::from_string("{\"exit_code\":0}".into()).expect("response");
    proof::start(&context).expect("start");
    proof::finish(&context, &ExecutionResult::from_raw(&raw)).expect("finish");
    assert!(
        proof::evaluate(&context.root, &context.session_id, Claim::Pass)
            .expect("before close")
            .ok
    );
    assert!(
        stop(given.path(), "VERDICT: PASS")
            .expect("closing response")
            .is_none()
    );
    let when = stop(given.path(), "VERDICT: PASS")
        .expect("next response")
        .expect("blocked");
    assert_eq!(when.decision, "block");
    assert!(!when.reason.is_empty());
}
