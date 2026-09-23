use std::{fs, path::Path};

use oh_my_zcode::validator::validate;
use serde_json::Value;
use tempfile::TempDir;

fn fixture() -> Result<TempDir, Box<dyn std::error::Error>> {
    let temp = TempDir::new()?;
    copy_tree(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("plugin"),
        temp.path(),
    )?;
    let report = validate(temp.path(), false)?;
    assert!(
        report.is_valid(),
        "unchanged fixture must validate: {report}"
    );
    Ok(temp)
}

fn copy_tree(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        if ["node_modules", ".oh-my-zcode"]
            .iter()
            .any(|skip| entry.file_name() == *skip)
        {
            continue;
        }
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &destination.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), destination.join(entry.file_name()))?;
        }
    }
    Ok(())
}

fn mutate_hooks(
    root: &Path,
    mutate: impl FnOnce(&mut Value),
) -> Result<(), Box<dyn std::error::Error>> {
    let path = root.join("hooks/hooks.json");
    let mut hooks: Value = serde_json::from_str(&fs::read_to_string(&path)?)?;
    mutate(&mut hooks);
    fs::write(path, serde_json::to_vec(&hooks)?)?;
    Ok(())
}

#[test]
fn rejects_each_missing_required_event() -> Result<(), Box<dyn std::error::Error>> {
    for event in [
        "SessionStart",
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "Stop",
    ] {
        let temp = fixture()?;
        mutate_hooks(temp.path(), |document| {
            document
                .get_mut("hooks")
                .and_then(Value::as_object_mut)
                .expect("hooks object")
                .remove(event);
        })?;
        let report = validate(temp.path(), false)?;
        assert!(!report.is_valid(), "missing {event} was accepted");
    }
    Ok(())
}

#[test]
fn rejects_each_misrouted_required_matcher() -> Result<(), Box<dyn std::error::Error>> {
    for pointer in [
        "/hooks/SessionStart/0",
        "/hooks/PreToolUse/0",
        "/hooks/PreToolUse/1",
        "/hooks/PostToolUse/0",
        "/hooks/PostToolUse/1",
        "/hooks/PostToolUseFailure/0",
        "/hooks/Stop/0",
    ] {
        let temp = fixture()?;
        mutate_hooks(temp.path(), |document| {
            document
                .pointer_mut(pointer)
                .and_then(Value::as_object_mut)
                .expect("hook group")
                .insert("matcher".to_owned(), Value::String("WebFetch".to_owned()));
        })?;
        let report = validate(temp.path(), false)?;
        assert!(
            !report.is_valid(),
            "misrouted matcher {pointer} was accepted"
        );
    }
    Ok(())
}

#[test]
fn rejects_missing_and_duplicate_native_handlers() -> Result<(), Box<dyn std::error::Error>> {
    for pointer in [
        "/hooks/SessionStart/0/hooks",
        "/hooks/PreToolUse/0/hooks",
        "/hooks/PreToolUse/1/hooks",
        "/hooks/PostToolUse/0/hooks",
        "/hooks/PostToolUse/1/hooks",
        "/hooks/PostToolUseFailure/0/hooks",
        "/hooks/Stop/0/hooks",
    ] {
        for duplicate in [false, true] {
            let temp = fixture()?;
            mutate_hooks(temp.path(), |document| {
                let hooks = document
                    .pointer_mut(pointer)
                    .and_then(Value::as_array_mut)
                    .expect("hooks list");
                if duplicate {
                    hooks.push(hooks.first().expect("required hook").clone());
                } else {
                    hooks.remove(0);
                }
            })?;
            let report = validate(temp.path(), false)?;
            assert!(
                !report.is_valid(),
                "{pointer}, duplicate={duplicate} was accepted"
            );
        }
    }
    Ok(())
}

#[test]
fn rejects_reordered_bash_preconditions() -> Result<(), Box<dyn std::error::Error>> {
    let temp = fixture()?;
    mutate_hooks(temp.path(), |document| {
        document
            .pointer_mut("/hooks/PreToolUse/0/hooks")
            .and_then(Value::as_array_mut)
            .expect("Bash preconditions")
            .reverse();
    })?;
    assert!(
        !validate(temp.path(), false)?.is_valid(),
        "proof_start before scope was accepted"
    );
    Ok(())
}

#[test]
fn rejects_missing_proof_start_handler() -> Result<(), Box<dyn std::error::Error>> {
    let temp = fixture()?;
    mutate_hooks(temp.path(), |document| {
        document
            .pointer_mut("/hooks/PreToolUse/0/hooks")
            .and_then(Value::as_array_mut)
            .expect("Bash preconditions")
            .pop();
    })?;
    assert!(
        !validate(temp.path(), false)?.is_valid(),
        "missing proof_start was accepted"
    );
    Ok(())
}

#[test]
fn rejects_duplicate_group_binding() -> Result<(), Box<dyn std::error::Error>> {
    let temp = fixture()?;
    mutate_hooks(temp.path(), |document| {
        let groups = document
            .pointer_mut("/hooks/PreToolUse")
            .and_then(Value::as_array_mut)
            .expect("PreToolUse groups");
        groups.push(groups.first().expect("Bash group").clone());
    })?;
    assert!(
        !validate(temp.path(), false)?.is_valid(),
        "duplicate Bash binding was accepted"
    );
    Ok(())
}
