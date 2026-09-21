use std::{fs, path::PathBuf};

use oh_my_zcode::validator::validate;
use serde_json::json;
use tempfile::TempDir;

fn fixture(source: &serde_json::Value) -> Result<(TempDir, PathBuf), Box<dyn std::error::Error>> {
    let temp = TempDir::new()?;
    let root = temp.path().join("oh-my-zcode");
    fs::create_dir_all(root.join(".zcode-plugin"))?;
    fs::write(
        root.join(".zcode-plugin/plugin.json"),
        r#"{
      "name":"oh-my-zcode", "version":"3.0.0", "description":"Test",
      "agents":"agents", "commands":"commands", "skills":"skills", "mcpServers":{}
    }"#,
    )?;
    let marketplace = json!({"plugins":[{"name":"oh-my-zcode","version":"3.0.0","source":source}]});
    fs::write(
        temp.path().join("marketplace.json"),
        serde_json::to_vec(&marketplace)?,
    )?;
    Ok((temp, root))
}

#[test]
fn remote_zip_marketplace_accepts_current_distribution_schema()
-> Result<(), Box<dyn std::error::Error>> {
    let (_temp, root) = fixture(&json!({"source":"url", "type":"zip",
        "url":"https://example.test/windows/plugin.zip", "sha256":"a".repeat(64), "path":"oh-my-zcode"}))?;
    let report = validate(&root, false)?;
    assert!(
        !report
            .errors
            .iter()
            .any(|error| error.contains("marketplace")),
        "{report}"
    );
    Ok(())
}

#[test]
fn remote_zip_marketplace_rejects_invalid_archive_digest() -> Result<(), Box<dyn std::error::Error>>
{
    let (_temp, root) = fixture(&json!({"source":"url", "type":"zip",
        "url":"https://example.test/windows/plugin.zip", "sha256":"not-a-digest", "path":"oh-my-zcode"}))?;
    let report = validate(&root, false)?;
    assert!(
        report.errors.iter().any(|error| error.contains("SHA-256")),
        "{report}"
    );
    Ok(())
}

#[test]
fn marketplace_rejects_manifest_version_drift() -> Result<(), Box<dyn std::error::Error>> {
    let (temp, root) = fixture(&json!("./oh-my-zcode"))?;
    let path = temp.path().join("marketplace.json");
    fs::write(&path, fs::read_to_string(&path)?.replace("3.0.0", "4.0.0"))?;
    let report = validate(&root, false)?;
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("marketplace version 4.0.0")),
        "{report}"
    );
    Ok(())
}

#[test]
fn remote_zip_marketplace_rejects_artifact_identity_mismatch()
-> Result<(), Box<dyn std::error::Error>> {
    let (temp, root) = fixture(&json!({"source":"url", "type":"zip",
        "url":"https://example.test/windows/plugin.zip", "sha256":"a".repeat(64), "path":"oh-my-zcode"}))?;
    let path = temp.path().join("marketplace.json");
    let mut marketplace: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path)?)?;
    let entry = marketplace
        .pointer_mut("/plugins/0")
        .and_then(serde_json::Value::as_object_mut)
        .ok_or("missing marketplace entry")?;
    entry.insert(
        "_artifact".to_owned(),
        json!({"path":"plugins/oh-my-zcode/3.0.0/plugin.zip", "sha256":"b".repeat(64), "size":50}),
    );
    fs::write(path, serde_json::to_vec(&marketplace)?)?;
    let report = validate(&root, false)?;
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("artifact digest")),
        "{report}"
    );
    Ok(())
}

#[test]
fn local_marketplace_rejects_missing_source_directory() -> Result<(), Box<dyn std::error::Error>> {
    let (_temp, root) = fixture(&json!("./not-this-plugin"))?;
    let report = validate(&root, false)?;
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("marketplace local source identity")),
        "{report}"
    );
    Ok(())
}

#[test]
fn local_marketplace_rejects_different_existing_directory() -> Result<(), Box<dyn std::error::Error>>
{
    let (temp, root) = fixture(&json!("./not-this-plugin"))?;
    fs::create_dir(temp.path().join("not-this-plugin"))?;
    let report = validate(&root, false)?;
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("marketplace local source identity")),
        "{report}"
    );
    Ok(())
}

#[test]
fn local_marketplace_accepts_canonical_source_identity() -> Result<(), Box<dyn std::error::Error>> {
    let (_temp, root) = fixture(&json!("./oh-my-zcode/../oh-my-zcode"))?;
    let report = validate(&root, false)?;
    assert!(
        !report
            .errors
            .iter()
            .any(|error| error.contains("marketplace")),
        "{report}"
    );
    Ok(())
}
