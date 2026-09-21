use oh_my_zcode::proof::{self, Claim, ExecutionResult, ProofContext};
use proptest::prelude::*;
use std::fs;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]

    #[test]
    fn text_status_never_authorizes_a_pass(status in "[ -~]{0,24}") {
        let directory = tempfile::tempdir().expect("fixture");
        fs::write(directory.path().join("source"), "tested").expect("source");
        let context = ProofContext {
            root: directory.path().into(),
            cwd: directory.path().into(),
            session_id: "status-property".into(),
            tool_use_id: "attempt".into(),
            command: "npm test".into(),
        };
        proof::start(&context).expect("start");
        let serialized = serde_json::to_string(&serde_json::json!({ "exit_code": status })).expect("serialize");
        let raw = serde_json::value::RawValue::from_string(serialized).expect("raw");
        proof::finish(&context, &ExecutionResult::from_raw(&raw)).expect("finish");
        prop_assert!(!proof::evaluate(&context.root, &context.session_id, Claim::Pass).expect("evaluate").ok);
    }

    #[test]
    fn any_changed_source_bytes_invalidate_a_completed_receipt(
        original in proptest::collection::vec(any::<u8>(), 1..64),
        changed in proptest::collection::vec(any::<u8>(), 1..64),
    ) {
        prop_assume!(original != changed);
        let directory = tempfile::tempdir().expect("fixture");
        let path = directory.path().join("source");
        fs::write(&path, &original).expect("source");
        let context = ProofContext {
            root: directory.path().into(),
            cwd: directory.path().into(),
            session_id: "mutation-property".into(),
            tool_use_id: "attempt".into(),
            command: "npm test".into(),
        };
        proof::start(&context).expect("start");
        let raw = serde_json::value::RawValue::from_string(r#"{"exit_code":0}"#.into()).expect("raw");
        proof::finish(&context, &ExecutionResult::from_raw(&raw)).expect("finish");
        fs::write(&path, changed).expect("mutate");
        prop_assert!(!proof::evaluate(&context.root, &context.session_id, Claim::Pass).expect("evaluate").ok);
    }
}
