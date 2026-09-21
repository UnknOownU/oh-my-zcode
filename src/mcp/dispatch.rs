use super::{
    McpError, catalog,
    wire::{Request, Response},
};
use crate::scope::{self, ValidatedScope};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, time::SystemTime};

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub(super) enum ResultBody {
    Initialize(catalog::InitializeResult),
    Tools(catalog::ToolsResult),
    Tool(catalog::ToolResult),
    Empty(catalog::EmptyObject),
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ToolCall {
    name: String,
    #[serde(default, rename = "arguments")]
    #[allow(
        clippy::zero_sized_map_values,
        reason = "An uninhabited value type admits only an empty JSON object"
    )]
    _arguments: BTreeMap<String, NoArgument>,
}

#[derive(Debug, Deserialize)]
enum NoArgument {}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum ScopeStatus<'a> {
    Armed {
        armed: bool,
        targets: &'a [String],
        env: &'a str,
        granted_at: &'a str,
        expires_at: &'a str,
        source: &'a str,
    },
    Unarmed {
        armed: bool,
        hint: &'static str,
    },
}

impl<'a> From<Option<&'a ValidatedScope>> for ScopeStatus<'a> {
    fn from(scope: Option<&'a ValidatedScope>) -> Self {
        match scope {
            Some(scope) => Self::Armed {
                armed: true,
                targets: scope.targets(),
                env: scope.env(),
                granted_at: scope.granted_at(),
                expires_at: scope.expires_at(),
                source: scope.source(),
            },
            None => Self::Unarmed {
                armed: false,
                hint: "armed by running /ohmy-redteam with your target — expires in 60 minutes",
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct RevokeResult {
    revoked: bool,
}

pub(super) fn respond(request: Request, root: Option<&Path>) -> Response<ResultBody> {
    if !request.has_object_params() {
        return Response::error(request.id, -32602, "Parameters must be an object");
    }
    let result = match request.method.as_str() {
        "initialize" => Ok(ResultBody::Initialize(catalog::initialize())),
        "ping" => Ok(ResultBody::Empty(catalog::EmptyObject {})),
        "tools/list" => Ok(ResultBody::Tools(catalog::tools())),
        "tools/call" => return call(request, root),
        _ => Err(format!("Method not found: {}", request.method)),
    };
    match result {
        Ok(body) => Response::result(request.id, body),
        Err(message) => Response::error(request.id, -32601, message),
    }
}

fn call(request: Request, root: Option<&Path>) -> Response<ResultBody> {
    let Some(params) = request.params else {
        return Response::error(request.id, -32602, "Missing tool parameters");
    };
    if !params.get().starts_with('{') {
        return Response::error(request.id, -32602, "Invalid tool parameters");
    }
    let Ok(params) = serde_json::from_str::<ToolCall>(params.get()) else {
        return Response::error(request.id, -32602, "Invalid tool parameters");
    };
    let result = match params.name.as_str() {
        "get_scope" => get_scope(root),
        "revoke" => revoke(root),
        _ => return Response::error(request.id, -32602, format!("Unknown tool: {}", params.name)),
    };
    match result {
        Ok(body) => Response::result(request.id, body),
        Err(error) => Response::error(request.id, -32603, format!("Internal error: {error}")),
    }
}

fn get_scope(root: Option<&Path>) -> Result<ResultBody, McpError> {
    let scope = match root {
        Some(root) => scope::read_scope(root, SystemTime::now())?,
        None => None,
    };
    text_result(&ScopeStatus::from(scope.as_ref()))
}

fn revoke(root: Option<&Path>) -> Result<ResultBody, McpError> {
    if let Some(root) = root {
        scope::revoke(root)?;
    }
    text_result(&RevokeResult { revoked: true })
}

fn text_result(value: &impl Serialize) -> Result<ResultBody, McpError> {
    let text = serde_json::to_string(value)?;
    Ok(ResultBody::Tool(catalog::ToolResult {
        content: [catalog::TextContent { kind: "text", text }],
    }))
}
