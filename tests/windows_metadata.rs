#![cfg(windows)]
use std::fs::{self, File, FileTimes};
use std::io;
use std::thread;
use std::time::Duration;

use oh_my_zcode::windows_metadata::change_time;
use tempfile::tempdir;

#[test]
fn restoring_bytes_and_mtime_still_changes_native_revision() -> io::Result<()> {
    let root = tempdir()?;
    let path = root.path().join("artifact");
    fs::write(&path, b"before")?;
    let modified = fs::metadata(&path)?.modified()?;
    let before = change_time(&path)?;
    thread::sleep(Duration::from_millis(20));
    fs::write(&path, b"edited")?;
    fs::write(&path, b"before")?;
    File::options()
        .write(true)
        .open(&path)?
        .set_times(FileTimes::new().set_modified(modified))?;
    assert_eq!(fs::read(&path)?, b"before");
    assert_eq!(fs::metadata(&path)?.modified()?, modified);
    assert_ne!(change_time(&path)?, before);
    Ok(())
}

#[test]
fn missing_path_returns_an_error_and_directory_is_supported() -> io::Result<()> {
    let root = tempdir()?;
    assert!(change_time(&root.path().join("missing")).is_err());
    assert!(change_time(root.path()).is_ok());
    Ok(())
}
