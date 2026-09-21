use crate::{smoke_protocol, target::Target};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Write},
    path::Path,
    process::{Command, Stdio},
    time::Duration,
};
use wait_timeout::ChildExt;

pub(crate) type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
    #[error("package smoke failed: {0}")]
    Contract(&'static str),
    #[error("packaged process failed ({command}): {stderr}")]
    Process { command: String, stderr: String },
}

pub(crate) fn run(path: &Path, target: Target) -> Result<()> {
    let bytes = fs::read(path)?;
    let digest = hex::encode(Sha256::digest(&bytes));
    let temporary = tempfile::tempdir()?;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
    inspect_entries(&mut archive)?;
    archive.extract(temporary.path())?;
    let plugin = temporary.path().join("oh-my-zcode");
    let binary = plugin.join("bin").join(target.executable());
    exercise_runtime(&binary, &plugin)?;
    println!("PASS sha256={digest} archive={}", path.display());
    Ok(())
}

fn exercise_runtime(binary: &Path, plugin: &Path) -> Result<()> {
    let version = execute(binary, &["--version"], b"")?;
    if version != b"oh-my-zcode 3.0.0\n" {
        return Err(Error::Contract("unexpected binary version"));
    }
    smoke_protocol::hook(&execute(binary, &["hook", "session_start"], b"{}")?)?;
    let requests = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}\n";
    smoke_protocol::mcp(&execute(binary, &["scope-mcp"], requests)?)?;
    let plugin_path = plugin
        .to_str()
        .ok_or(Error::Contract("non-UTF8 package path"))?;
    execute(binary, &["validate", plugin_path, "--packaged"], b"")?;
    Ok(())
}

fn inspect_entries(archive: &mut zip::ZipArchive<Cursor<Vec<u8>>>) -> Result<()> {
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let path = entry
            .enclosed_name()
            .ok_or(Error::Contract("unsafe archive path"))?;
        if !path.starts_with("oh-my-zcode") || entry.is_symlink() {
            return Err(Error::Contract("archive entry outside plugin or symlink"));
        }
    }
    Ok(())
}

fn execute(binary: &Path, arguments: &[&str], stdin: &[u8]) -> Result<Vec<u8>> {
    let mut child = Command::new(binary)
        .args(arguments)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .ok_or(Error::Contract("stdin pipe unavailable"))?
        .write_all(stdin)?;
    if child.wait_timeout(Duration::from_secs(20))?.is_none() {
        child.kill()?;
        child.wait()?;
        return Err(Error::Contract("packaged process exceeded 20 seconds"));
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(Error::Process {
            command: arguments.join(" "),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }
    Ok(output.stdout)
}
