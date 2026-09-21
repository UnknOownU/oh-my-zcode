use oh_my_zcode::hook;
use serde_json::json;

fn event(
    kind: &str,
    session: &str,
    workspace: &std::path::Path,
    payload: &serde_json::Value,
) -> Result<Option<String>, Box<dyn std::error::Error>> {
    let mut input = payload.clone();
    let object = input.as_object_mut().ok_or("Expected fixture object")?;
    object.insert("cwd".to_owned(), json!(workspace));
    object.insert("session_id".to_owned(), json!(session));
    Ok(hook::run(kind, &serde_json::to_vec(&input)?)?)
}

#[test]
fn rejects_citations_when_sanitized_session_names_collide() {
    // Given one session has read a source and another shares its sanitized filename.
    let workspace = tempfile::tempdir().expect("workspace");
    event(
        "sources",
        "session/a",
        workspace.path(),
        &json!({"tool_name":"WebFetch",
        "tool_input":{"url":"https://example.test/paper"},"tool_response":{"output":"read"}}),
    )
    .expect("source event");
    // When the other session signs that source.
    let output = event(
        "stop",
        "session?a",
        workspace.path(),
        &json!({
        "last_assistant_message":"https://example.test/paper\nSOURCES: VERIFIED"}),
    )
    .expect("stop event");
    // Then its distinct full identity has no retrieval authority.
    assert!(output.is_some_and(|output| output.contains("\"decision\":\"block\"")));
}

#[test]
fn rejects_old_source_records_without_migrating_them() {
    // Given an obsolete unversioned source record.
    let workspace = tempfile::tempdir().expect("workspace");
    let evidence = workspace.path().join(".oh-my-zcode/evidence");
    std::fs::create_dir_all(&evidence).expect("evidence directory");
    std::fs::write(
        evidence.join("session.jsonl"),
        "{\"session_id\":\"session\",\"kind\":\"source\",\"url\":\"example.test\"}\n",
    )
    .expect("old record");
    // When a current claim attempts to consume it.
    let output = event(
        "stop",
        "session",
        workspace.path(),
        &json!({
        "last_assistant_message":"https://example.test\nSOURCES: VERIFIED"}),
    )
    .expect("stop event");
    // Then the obsolete format grants no authority.
    assert!(output.is_some_and(|output| output.contains("\"decision\":\"block\"")));
}

#[test]
fn denies_missing_fetch_result_even_when_request_has_url() {
    // Given a retrieval request with no observed response.
    let workspace = tempfile::tempdir().expect("workspace");
    event(
        "sources",
        "session",
        workspace.path(),
        &json!({"tool_name":"WebFetch",
        "tool_input":{"url":"https://example.test"}}),
    )
    .expect("source event");
    // When it is cited as verified.
    let output = event(
        "stop",
        "session",
        workspace.path(),
        &json!({
        "last_assistant_message":"https://example.test\nSOURCES: VERIFIED"}),
    )
    .expect("stop event");
    // Then the missing execution outcome cannot authorize the claim.
    assert!(output.is_some_and(|output| output.contains("\"decision\":\"block\"")));
}

#[test]
fn citation_identity_preserves_distinct_resources() {
    for cited in [
        "https://example.test/admin?token=abc",
        "http://example.test/Admin?Token=ABC",
        "https://www.example.test/Admin?Token=ABC",
        "https://example.test/Admin/?Token=ABC",
    ] {
        let root = tempfile::tempdir().expect("workspace");
        event(
            "sources",
            "session",
            root.path(),
            &json!({"tool_input":{"url":"https://example.test/Admin?Token=ABC"},
            "tool_response":{"output":"read"}}),
        )
        .expect("source");
        let output = event(
            "stop",
            "session",
            root.path(),
            &json!({"last_assistant_message":format!("{cited}\nSOURCES: VERIFIED")}),
        )
        .expect("stop");
        assert!(output.is_some(), "{cited}");
    }
}
