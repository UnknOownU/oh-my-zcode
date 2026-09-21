use super::{
    ProofError,
    snapshot::{Snapshot, path_name},
    snapshot_entries::Traversal,
};
use std::{
    collections::BTreeSet,
    ffi::OsStr,
    fs,
    io::Read,
    process::{Child, Command, ExitStatus, Stdio},
    time::Duration,
};
use wait_timeout::ChildExt;

pub(super) fn runtime(name: &OsStr) -> bool {
    [".git", ".oh-my-zcode"]
        .iter()
        .any(|candidate| name == *candidate)
}

pub(super) fn generated(name: &OsStr) -> bool {
    [
        "node_modules",
        ".venv",
        "venv",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        "coverage",
        "dist",
        "build",
        "target",
    ]
    .iter()
    .any(|candidate| name == *candidate)
}

pub(super) fn select(snapshot: &mut Snapshot) -> Result<String, ProofError> {
    if snapshot.root.join(".git").try_exists()? {
        select_git(snapshot)?;
        return Ok("git".into());
    }
    select_filesystem(snapshot)?;
    Ok("filesystem".into())
}

fn select_git(snapshot: &mut Snapshot) -> Result<(), ProofError> {
    for name in git_files(snapshot)? {
        if name.split('/').any(|part| runtime(OsStr::new(part))) {
            continue;
        }
        snapshot.visit(&snapshot.root.join(&name), &name, &Traversal::default())?;
    }
    Ok(())
}

fn select_filesystem(snapshot: &mut Snapshot) -> Result<(), ProofError> {
    let mut children = fs::read_dir(&snapshot.root)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(std::fs::DirEntry::file_name);
    for child in children {
        if runtime(&child.file_name()) || generated(&child.file_name()) {
            continue;
        }
        snapshot.visit(
            &child.path(),
            &path_name(std::path::Path::new(&child.file_name()))?,
            &Traversal::default(),
        )?;
    }
    Ok(())
}

fn git_files(snapshot: &Snapshot) -> Result<BTreeSet<String>, ProofError> {
    let mut command = Command::new("git");
    command
        .args(["-C"])
        .arg(&snapshot.root)
        .args([
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ProofError::Snapshot("Git stdout unavailable".into()))?;
    let reader = std::thread::spawn(move || {
        let mut output = Vec::new();
        stdout
            .take(4 * 1024 * 1024 + 1)
            .read_to_end(&mut output)
            .map(|_| output)
    });
    let status = wait_for_git(&mut child)?;
    let output = reader
        .join()
        .map_err(|_| ProofError::Snapshot("Git reader failed".into()))??;
    if !status.is_some_and(|status| status.success()) || output.len() > 4 * 1024 * 1024 {
        return Err(ProofError::Snapshot(
            "Cannot enumerate Git artifacts within bounds".into(),
        ));
    }
    parse_git_files(output)
}

fn wait_for_git(child: &mut Child) -> Result<Option<ExitStatus>, ProofError> {
    let status = child.wait_timeout(Duration::from_millis(1500))?;
    if status.is_none() {
        child.kill()?;
        child.wait()?;
    }
    Ok(status)
}

fn parse_git_files(output: Vec<u8>) -> Result<BTreeSet<String>, ProofError> {
    let output = String::from_utf8(output)
        .map_err(|_| ProofError::Snapshot("Git paths must be valid UTF-8".into()))?;
    Ok(output
        .split('\0')
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect())
}
