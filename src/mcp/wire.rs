use serde::{Deserialize, Deserializer, Serialize};
use serde_json::value::RawValue;

#[derive(Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub(super) enum RequestId {
    Signed(i64),
    Unsigned(u64),
    Text(String),
}

#[derive(Debug, Deserialize)]
pub(super) struct Request {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default, deserialize_with = "present")]
    pub id: Option<RequestId>,
    #[serde(default, deserialize_with = "present")]
    pub params: Option<Box<RawValue>>,
}

fn present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

impl Request {
    pub(super) fn has_object_params(&self) -> bool {
        self.params
            .as_ref()
            .is_none_or(|params| params.get().starts_with('{'))
    }
}

pub(super) enum Incoming {
    Request(Request),
    Notification,
    Invalid(i32, &'static str),
}

pub(super) fn parse(line: &str) -> Incoming {
    let raw: Box<RawValue> = match serde_json::from_str(line) {
        Ok(raw) => raw,
        Err(_) => return Incoming::Invalid(-32700, "Parse error"),
    };
    if !raw.get().starts_with('{') {
        return Incoming::Invalid(-32600, "Invalid Request");
    }
    let Ok(request) = serde_json::from_str::<Request>(raw.get()) else {
        return Incoming::Invalid(-32600, "Invalid Request");
    };
    if request.jsonrpc != "2.0" {
        return Incoming::Invalid(-32600, "Invalid Request");
    }
    if request.id.is_none() {
        return Incoming::Notification;
    }
    Incoming::Request(request)
}

#[derive(Debug, Serialize)]
pub(super) struct Response<T> {
    pub jsonrpc: &'static str,
    pub id: Option<RequestId>,
    #[serde(flatten)]
    pub outcome: Outcome<T>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum Outcome<T> {
    Result(T),
    Error(RpcError),
}

#[derive(Debug, Serialize)]
pub(super) struct RpcError {
    pub code: i32,
    pub message: String,
}

impl<T> Response<T> {
    pub(super) const fn result(id: Option<RequestId>, result: T) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            outcome: Outcome::Result(result),
        }
    }
    pub(super) fn error(id: Option<RequestId>, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            outcome: Outcome::Error(RpcError {
                code,
                message: message.into(),
            }),
        }
    }
}
