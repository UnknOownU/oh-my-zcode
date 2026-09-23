use crate::{smoke_protocol, target::Target};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
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

pub(crate) fn run(path: &Path, target: Target, universal: bool) -> Result<()> {
    let bytes = fs::read(path)?;
    let digest = hex::encode(Sha256::digest(&bytes));
    let temporary = tempfile::tempdir()?;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
    inspect_entries(&mut archive)?;
    if universal {
        inspect_universal_entries(&archive)?;
    }
    let extraction = temporary.path().join("archive with spaces");
    fs::create_dir(&extraction)?;
    archive.extract(&extraction)?;
    let plugin = extraction.join("oh-my-zcode");
    let runtime = Runtime::for_package(&plugin, target, universal);
    exercise_runtime(&runtime, &plugin)?;
    println!("PASS sha256={digest} archive={}", path.display());
    Ok(())
}

#[derive(Debug)]
struct Runtime {
    program: PathBuf,
    launcher: Option<PathBuf>,
}

impl Runtime {
    fn for_package(plugin: &Path, target: Target, universal: bool) -> Self {
        if universal {
            Self::universal(plugin)
        } else {
            Self::native(plugin, target)
        }
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        if let Some(launcher) = &self.launcher {
            command.arg(launcher);
        }
        command
    }

    fn native(plugin: &Path, target: Target) -> Self {
        Self {
            program: plugin.join("bin").join(target.executable()),
            launcher: None,
        }
    }

    fn universal(plugin: &Path) -> Self {
        Self {
            program: PathBuf::from("node"),
            launcher: Some(plugin.join("bin/launch.mjs")),
        }
    }
}

fn exercise_runtime(runtime: &Runtime, plugin: &Path) -> Result<()> {
    let version = execute(runtime, &["--version"], b"")?;
    let expected = format!("oh-my-zcode {}\n", env!("CARGO_PKG_VERSION"));
    if version != expected.as_bytes() {
        return Err(Error::Contract("unexpected binary version"));
    }
    smoke_protocol::hook(&execute(runtime, &["hook", "session_start"], b"{}")?)?;
    let requests = b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}\n";
    smoke_protocol::mcp(&execute(runtime, &["scope-mcp"], requests)?)?;
    let plugin_path = plugin
        .to_str()
        .ok_or(Error::Contract("non-UTF8 package path"))?;
    execute(runtime, &["validate", plugin_path, "--packaged"], b"")?;
    Ok(())
}

fn inspect_universal_entries(archive: &zip::ZipArchive<Cursor<Vec<u8>>>) -> Result<()> {
    let names: BTreeSet<_> = archive.file_names().collect();
    if !names.contains("oh-my-zcode/bin/launch.mjs") {
        return Err(Error::Contract("universal archive is missing its launcher"));
    }
    for target in Target::ALL {
        let path = format!(
            "oh-my-zcode/bin/{}/{}",
            target.triple(),
            target.executable()
        );
        if !names.contains(path.as_str()) {
            return Err(Error::Contract(
                "universal archive is missing a native runtime",
            ));
        }
    }
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

fn execute(runtime: &Runtime, arguments: &[&str], stdin: &[u8]) -> Result<Vec<u8>> {
    let mut child = runtime
        .command()
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
