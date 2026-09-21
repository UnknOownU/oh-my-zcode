use serde::{Deserialize, Serialize};
use std::fmt;
use url::Url;

#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub(super) struct SourceIdentity(String);

#[derive(Debug, thiserror::Error)]
pub enum IdentityError {
    #[error("invalid source URL: {0}")]
    Url(#[from] url::ParseError),
    #[error("source URL must use HTTP(S)")]
    Scheme,
}

impl SourceIdentity {
    pub(super) fn parse(raw: &str) -> Result<Self, IdentityError> {
        let mut url = Url::parse(raw)?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err(IdentityError::Scheme);
        }
        url.set_fragment(None);
        Ok(Self(url.into()))
    }
}

impl TryFrom<String> for SourceIdentity {
    type Error = IdentityError;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<SourceIdentity> for String {
    fn from(value: SourceIdentity) -> Self {
        value.0
    }
}

impl fmt::Display for SourceIdentity {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}
