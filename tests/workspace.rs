use std::fs;
use std::io;

use oh_my_zcode::workspace::{
    canonical_path, resolve_evidence_root, resolve_read_root, session_key,
};
use proptest::prelude::*;
use tempfile::tempdir;

#[test]
fn nested_package_reads_nearest_marker_but_bootstraps_at_repository() -> io::Result<()> {
    let temporary = tempdir()?;
    let root = temporary.path();
    let child = root.join("packages").join("component");
    fs::create_dir_all(child.join("src"))?;
    fs::write(root.join(".git"), "gitdir: elsewhere")?;
    fs::write(child.join("Cargo.toml"), "")?;
    assert_eq!(resolve_read_root(&child)?, Some(canonical_path(&child)?));
    assert_eq!(resolve_evidence_root(&child)?, canonical_path(root)?);
    fs::create_dir(root.join(".oh-my-zcode"))?;
    assert_eq!(resolve_read_root(&child)?, Some(canonical_path(root)?));
    assert_eq!(resolve_evidence_root(&child)?, canonical_path(root)?);
    Ok(())
}

#[test]
fn nearest_state_is_an_explicit_workspace_boundary() -> io::Result<()> {
    let temporary = tempdir()?;
    let child = temporary.path().join("nested");
    fs::create_dir_all(child.join(".oh-my-zcode"))?;
    fs::create_dir(temporary.path().join(".oh-my-zcode"))?;
    assert_eq!(resolve_read_root(&child)?, Some(canonical_path(&child)?));
    assert_eq!(resolve_evidence_root(&child)?, canonical_path(&child)?);
    Ok(())
}

#[test]
fn missing_directory_fails_instead_of_guessing_a_root() -> io::Result<()> {
    let temporary = tempdir()?;
    assert!(resolve_read_root(&temporary.path().join("absent")).is_err());
    assert!(resolve_evidence_root(&temporary.path().join("absent")).is_err());
    Ok(())
}

#[test]
fn session_filename_is_ascii_and_never_contains_path_separators() {
    assert_eq!(session_key(r"session/é\space:id"), "session___space_id");
}

proptest! {
    #[test]
    fn session_paths_never_gain_directories(session in ".*") {
        let key = session_key(&session);
        prop_assert!(key.chars().all(|value| value.is_ascii_alphanumeric() || matches!(value, '_' | '.' | '-')));
    }
}
