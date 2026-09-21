use super::policy::Contract;
use serde::{Deserialize, Deserializer};
use serde_json::value::RawValue;

#[derive(Debug, Default)]
struct Present(Option<Box<RawValue>>);

impl<'de> Deserialize<'de> for Present {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Box::<RawValue>::deserialize(deserializer).map(|raw| Self(Some(raw)))
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct HostResult {
    exit_code: Present,
    #[serde(rename = "exitCode")]
    exit_code_camel: Present,
    error: Present,
    timed_out: Present,
    #[serde(rename = "timedOut")]
    timed_out_camel: Present,
    timeout: Present,
    interrupted: Present,
    signal: Present,
    #[serde(rename = "isError")]
    is_error_camel: Present,
    is_error: Present,
    stdout: Present,
    stderr: Present,
    output: Present,
}

/// Parsed host execution data retains invalid status aliases as a failed result.
#[derive(Debug)]
pub struct ExecutionResult {
    status: Result<i64, String>,
    output: String,
    interrupted: bool,
    error: bool,
    is_error: bool,
}

impl ExecutionResult {
    /// Parse the host response without treating a missing or malformed code as zero.
    #[must_use]
    pub fn from_raw(raw: &RawValue) -> Self {
        match serde_json::from_str::<HostResult>(raw.get()) {
            Ok(host) => Self::from_host(&host),
            Err(_) => Self::missing(),
        }
    }

    /// A tool event with no structured response cannot establish proof.
    #[must_use]
    pub fn missing() -> Self {
        Self {
            status: Err("Missing structured execution result".into()),
            output: String::new(),
            interrupted: false,
            error: false,
            is_error: false,
        }
    }

    fn from_host(host: &HostResult) -> Self {
        let output = [&host.stdout, &host.stderr, &host.output]
            .into_iter()
            .filter_map(|field| field.0.as_ref())
            .filter_map(|raw| serde_json::from_str::<String>(raw.get()).ok())
            .collect::<Vec<_>>()
            .join("\n");
        Self {
            status: status(&host.exit_code, &host.exit_code_camel),
            output,
            interrupted: [
                &host.timed_out,
                &host.timed_out_camel,
                &host.timeout,
                &host.interrupted,
                &host.signal,
            ]
            .into_iter()
            .any(truthy),
            error: truthy(&host.error),
            is_error: [&host.is_error, &host.is_error_camel]
                .into_iter()
                .any(|field| field.0.as_ref().is_some_and(|raw| raw.get() == "true")),
        }
    }

    pub(super) fn check(&self, contract: &Contract) -> Result<i64, String> {
        let code = self.status.clone()?;
        if self.error {
            return Err("Execution error".into());
        }
        if self.interrupted {
            return Err("Execution interrupted or timed out".into());
        }
        if code != i64::from(contract.expected_exit) || (code == 0 && self.is_error) {
            return Err("Unexpected execution result".into());
        }
        if !contract
            .output_includes
            .iter()
            .all(|literal| self.output.contains(literal))
        {
            return Err("Expected output absent".into());
        }
        Ok(code)
    }
}

fn status(first: &Present, second: &Present) -> Result<i64, String> {
    let codes = [&first.0, &second.0]
        .into_iter()
        .flatten()
        .map(|raw| {
            serde_json::from_str::<i64>(raw.get())
                .map_err(|_| "Missing numeric exit code".to_owned())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let first = codes.first().ok_or("Missing numeric exit code")?;
    if codes.iter().any(|code| code != first) {
        return Err("Conflicting exit codes".into());
    }
    Ok(*first)
}

fn truthy(field: &Present) -> bool {
    field
        .0
        .as_ref()
        .is_some_and(|raw| !matches!(raw.get(), "false" | "null" | "0" | "\"\""))
}
