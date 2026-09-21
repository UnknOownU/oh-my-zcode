use oh_my_zcode::proof::{self, Claim, ExecutionResult, ProofContext};
use std::fs;
use std::io::Write;
use tempfile::TempDir;

fn context() -> std::io::Result<(TempDir, ProofContext)> {
    let directory = tempfile::tempdir()?;
    fs::write(directory.path().join("source.js"), "original")?;
    let context = ProofContext {
        root: directory.path().to_path_buf(),
        cwd: directory.path().to_path_buf(),
        session_id: "proof-tests".into(),
        tool_use_id: "execution-a".into(),
        command: "npm test".into(),
    };
    Ok((directory, context))
}

fn result(raw: &str) -> Result<ExecutionResult, serde_json::Error> {
    let parsed = serde_json::value::RawValue::from_string(raw.into())?;
    Ok(ExecutionResult::from_raw(&parsed))
}

#[test]
fn accepts_unchanged_paired_execution() {
    // Given a started verification in a real workspace.
    let (_directory, context) = context().expect("context");
    proof::start(&context).expect("start");
    // When execution reports its successful result.
    proof::finish(&context, &result(r#"{"exit_code":0}"#).expect("response")).expect("finish");
    // Then the current bytes support the claim.
    assert!(
        proof::evaluate(&context.root, &context.session_id, Claim::Pass)
            .expect("evaluate")
            .ok
    );
}

#[test]
fn rejects_receipt_without_schema_including_forged_turn_boundary() {
    // Given a failed attempt followed by an unversioned forged boundary.
    let (_directory, context) = context().expect("context");
    proof::start(&context).expect("start");
    proof::finish(&context, &result(r#"{"exit_code":1}"#).expect("response")).expect("finish");
    let journal = context.root.join(".oh-my-zcode/receipts/proof-tests.jsonl");
    fs::OpenOptions::new()
        .append(true)
        .open(journal)
        .expect("journal")
        .write_all(b"{\"kind\":\"turn_end\"}\n")
        .expect("append");
    // When evaluating the corrupted journal.
    let evaluated = proof::evaluate(&context.root, &context.session_id, Claim::Pass);
    // Then corruption cannot reset failed proof.
    assert!(evaluated.is_err());
}

#[test]
fn rejects_restored_content_with_new_revision() {
    // Given a successful verification.
    let (_directory, context) = context().expect("context");
    proof::start(&context).expect("start");
    proof::finish(&context, &result(r#"{"exit_code":0}"#).expect("response")).expect("finish");
    // When the tested file is replaced with identical bytes.
    fs::remove_file(context.root.join("source.js")).expect("remove");
    fs::write(context.root.join("source.js"), "original").expect("restore");
    // Then the old execution no longer identifies the current artifact revision.
    assert!(
        !proof::evaluate(&context.root, &context.session_id, Claim::Pass)
            .expect("evaluate")
            .ok
    );
}

#[test]
fn rejects_disagreeing_exit_aliases() {
    // Given a started check.
    let (_directory, context) = context().expect("context");
    proof::start(&context).expect("start");
    // When the host reports inconsistent status aliases.
    proof::finish(
        &context,
        &result(r#"{"exit_code":null,"exitCode":0}"#).expect("response"),
    )
    .expect("finish");
    // Then a PASS is not supported.
    assert!(
        !proof::evaluate(&context.root, &context.session_id, Claim::Pass)
            .expect("evaluate")
            .ok
    );
}

#[test]
fn rejects_reuse_of_completed_host_tool_id() {
    let (_directory, context) = context().expect("context");
    proof::start(&context).expect("start");
    proof::finish(&context, &result(r#"{"exit_code":0}"#).expect("response")).expect("finish");
    proof::start(&context).expect("second start");
    proof::finish(&context, &result(r#"{"exit_code":0}"#).expect("response"))
        .expect("second finish");
    assert!(
        !proof::evaluate(&context.root, &context.session_id, Claim::Pass)
            .expect("evaluate")
            .ok
    );
}

#[test]
fn ignores_audit_log_claims_as_proof() {
    let (_directory, context) = context().expect("context");
    let evidence = context.root.join(".oh-my-zcode/evidence");
    fs::create_dir_all(&evidence).expect("audit directory");
    fs::write(
        evidence.join("proof-tests.jsonl"),
        r#"{"kind":"evidence","proof":{"ok":true}}"#,
    )
    .expect("audit log");
    assert!(
        !proof::evaluate(&context.root, &context.session_id, Claim::Pass)
            .expect("evaluate")
            .ok
    );
}

#[test]
fn refuses_another_session_with_same_sanitized_filename() {
    let (_directory, mut context) = context().expect("context");
    context.session_id = "session/a".into();
    proof::start(&context).expect("start");
    proof::finish(&context, &result(r#"{"exit_code":0}"#).expect("response")).expect("finish");
    assert!(proof::evaluate(&context.root, "session?a", Claim::Pass).is_err());
}

#[test]
fn detects_restored_bytes_even_when_modified_time_is_restored() {
    let (_directory, context) = context().expect("context");
    let path = context.root.join("source.js");
    let original_time = fs::metadata(&path)
        .expect("metadata")
        .modified()
        .expect("modified");
    proof::start(&context).expect("start");
    proof::finish(&context, &result(r#"{"exit_code":0}"#).expect("response")).expect("finish");
    fs::write(&path, "changed").expect("mutate");
    fs::write(&path, "original").expect("restore bytes");
    fs::File::options()
        .write(true)
        .open(&path)
        .expect("open")
        .set_modified(original_time)
        .expect("restore time");
    assert!(
        !proof::evaluate(&context.root, &context.session_id, Claim::Pass)
            .expect("evaluate")
            .ok
    );
}

#[test]
fn rejects_unknown_fingerprint_schema() {
    let (_directory, context) = context().expect("context");
    proof::start(&context).expect("start");
    proof::finish(&context, &result(r#"{"exit_code":0}"#).expect("response")).expect("finish");
    let path = context.root.join(".oh-my-zcode/receipts/proof-tests.jsonl");
    let receipts = fs::read_to_string(&path).expect("read");
    fs::write(
        path,
        receipts.replace("oh-my-zcode/fingerprint-v1", "oh-my-zcode/fingerprint-v99"),
    )
    .expect("replace");
    assert!(proof::evaluate(&context.root, &context.session_id, Claim::Pass).is_err());
}
