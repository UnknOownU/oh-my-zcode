use crate::smoke::{Error, Result};
use serde::Deserialize;

#[derive(Deserialize)]
struct HookResult {
    #[serde(rename = "hookSpecificOutput")]
    output: HookOutput,
}
#[derive(Deserialize)]
struct HookOutput {
    #[serde(rename = "hookEventName")]
    event: String,
    #[serde(rename = "additionalContext")]
    context: String,
}
#[derive(Deserialize)]
struct RpcResult<T> {
    jsonrpc: String,
    id: u64,
    result: T,
}
#[derive(Deserialize)]
struct Initialize {
    #[serde(rename = "protocolVersion")]
    protocol: String,
    #[serde(rename = "serverInfo")]
    server: Server,
}
#[derive(Deserialize)]
struct Server {
    name: String,
    version: String,
}
#[derive(Deserialize)]
struct Tools {
    tools: Vec<Tool>,
}
#[derive(Deserialize)]
struct Tool {
    name: String,
}

pub(crate) fn hook(bytes: &[u8]) -> Result<()> {
    let result: HookResult = serde_json::from_slice(bytes)?;
    if result.output.event != "SessionStart" || result.output.context.is_empty() {
        return Err(Error::Contract("SessionStart did not inject context"));
    }
    Ok(())
}

pub(crate) fn mcp(bytes: &[u8]) -> Result<()> {
    let text =
        std::str::from_utf8(bytes).map_err(|_| Error::Contract("MCP emitted non-UTF8 output"))?;
    let mut lines = text.lines();
    let initialize: RpcResult<Initialize> = serde_json::from_str(
        lines
            .next()
            .ok_or(Error::Contract("missing initialize response"))?,
    )?;
    let tools: RpcResult<Tools> = serde_json::from_str(
        lines
            .next()
            .ok_or(Error::Contract("missing tools/list response"))?,
    )?;
    check_initialize(&initialize)?;
    if tools.jsonrpc != "2.0" || tools.id != 2 || lines.next().is_some() {
        return Err(Error::Contract("unexpected MCP response framing"));
    }
    check_tools(&tools.result)
}

fn check_tools(tools: &Tools) -> Result<()> {
    let mut names: Vec<_> = tools.tools.iter().map(|tool| tool.name.as_str()).collect();
    names.sort_unstable();
    if names != ["get_scope", "revoke"] {
        return Err(Error::Contract("unexpected MCP tools"));
    }
    Ok(())
}

fn check_initialize(response: &RpcResult<Initialize>) -> Result<()> {
    let valid_envelope = response.jsonrpc == "2.0" && response.id == 1;
    let server = &response.result.server;
    if !valid_envelope
        || response.result.protocol != "2024-11-05"
        || server.name != "oh-my-zcode-scope"
        || server.version != "3.0.0"
    {
        return Err(Error::Contract("unexpected MCP initialize result"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_success_exit_payload_without_registered_tools() {
        let output = br#"{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","serverInfo":{"name":"oh-my-zcode-scope","version":"3.0.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}"#;
        assert!(mcp(output).is_err());
    }

    #[test]
    fn rejects_empty_context_from_session_start() {
        let output =
            br#"{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":""}}"#;
        assert!(hook(output).is_err());
    }
}
