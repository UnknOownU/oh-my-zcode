use serde::Serialize;

#[derive(Debug, Serialize)]
pub(super) struct EmptyObject {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct InitializeResult {
    pub protocol_version: &'static str,
    pub capabilities: Capabilities,
    pub server_info: ServerInfo,
}

#[derive(Debug, Serialize)]
pub(super) struct Capabilities {
    pub tools: EmptyObject,
}

#[derive(Debug, Serialize)]
pub(super) struct ServerInfo {
    pub name: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Serialize)]
pub(super) struct ToolsResult {
    pub tools: [Tool; 2],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Tool {
    name: &'static str,
    description: &'static str,
    input_schema: Schema,
}

#[derive(Debug, Serialize)]
struct Schema {
    #[serde(rename = "type")]
    kind: &'static str,
    properties: EmptyObject,
}

#[derive(Debug, Serialize)]
pub(super) struct ToolResult {
    pub content: [TextContent; 1],
}

#[derive(Debug, Serialize)]
pub(super) struct TextContent {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub text: String,
}

pub(super) const fn initialize() -> InitializeResult {
    InitializeResult {
        protocol_version: "2024-11-05",
        capabilities: Capabilities {
            tools: EmptyObject {},
        },
        server_info: ServerInfo {
            name: "oh-my-zcode-scope",
            version: env!("CARGO_PKG_VERSION"),
        },
    }
}

pub(super) const fn tools() -> ToolsResult {
    ToolsResult {
        tools: [
            Tool {
                name: "get_scope",
                description: "Read the current security scope (targets, env, window). Arming happens through /ohmy-redteam, never through this server.",
                input_schema: Schema {
                    kind: "object",
                    properties: EmptyObject {},
                },
            },
            Tool {
                name: "revoke",
                description: "Delete the current invocation scope and close the security gate.",
                input_schema: Schema {
                    kind: "object",
                    properties: EmptyObject {},
                },
            },
        ],
    }
}
