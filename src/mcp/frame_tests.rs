#![allow(
    clippy::expect_used,
    clippy::indexing_slicing,
    reason = "test assertions inspect protocol frames"
)]
use super::{MAX_FRAME_BYTES, serve};
use std::io::Cursor;

#[test]
fn oversized_frame_is_rejected_then_next_request_is_served() {
    let mut bytes = vec![b'x'; usize::try_from(MAX_FRAME_BYTES).expect("bounded length") + 20];
    bytes.extend_from_slice(b"\n{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"ping\"}\n");
    let mut output = Vec::new();
    serve(Cursor::new(bytes), &mut output, None).expect("transport runs");
    let text = String::from_utf8(output).expect("UTF-8 responses");
    let responses: Vec<serde_json::Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).expect("JSON response"))
        .collect();
    assert_eq!(responses.len(), 2);
    assert_eq!(responses[0]["error"]["code"], -32600);
    assert_eq!(responses[1]["id"], 7);
    assert_eq!(responses[1]["result"], serde_json::json!({}));
}

#[test]
fn invalid_utf8_frame_does_not_break_transport() {
    let mut output = Vec::new();
    serve(Cursor::new([255, 10]), &mut output, None).expect("transport runs");
    let response: serde_json::Value = serde_json::from_slice(&output).expect("JSON response");
    assert_eq!(response["error"]["code"], -32700);
}

#[test]
fn argument_schema_accepts_only_an_empty_object() {
    for arguments in [
        serde_json::json!([]),
        serde_json::json!(null),
        serde_json::json!({"target":"example.com"}),
    ] {
        let request = serde_json::json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"revoke","arguments":arguments}}).to_string();
        let mut output = Vec::new();
        serve(Cursor::new(request), &mut output, None).expect("transport runs");
        let response: serde_json::Value = serde_json::from_slice(&output).expect("JSON response");
        assert_eq!(response["error"]["code"], -32602);
    }
}
