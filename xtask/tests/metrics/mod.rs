use super::*;

fn space(name: &str, cyclomatic: f64, cognitive: f64, children: Vec<Space>) -> Space {
    Space {
        name: Some(name.to_owned()),
        kind: "function".to_owned(),
        start_line: 1,
        spaces: children,
        metrics: Metrics {
            cyclomatic: Aggregate { sum: cyclomatic },
            cognitive: Aggregate { sum: cognitive },
            loc: Lines { ploc: 4.0 },
        },
    }
}

#[test]
fn nested_functions_keep_their_own_branch_and_cognitive_counts() {
    let inner = space("inner", 7.0, 3.0, Vec::new());
    let child = space("child", 9.0, 5.0, vec![inner]);
    let parent = space("parent", 13.0, 10.0, vec![child]);
    let mut records = Vec::new();
    functions(&parent, &mut records);
    let counts: Vec<_> = records
        .iter()
        .map(|record| (record.name.as_str(), record.cyclomatic, record.cognitive))
        .collect();
    assert_eq!(
        counts,
        [
            ("parent", 4.0, 5.0),
            ("child", 2.0, 2.0),
            ("inner", 7.0, 3.0)
        ]
    );
}

#[test]
fn incomplete_analyzer_output_is_rejected() {
    for input in [
        r#"{"kind":"unit","name":null,"start_line":1,"spaces":[]}"#,
        r#"{"kind":"unit","name":null,"start_line":1,"spaces":[],"metrics":{"cyclomatic":{"sum":1},"cognitive":{"sum":0},"loc":{}}}"#,
        r#"{"kind":"unit","name":null,"start_line":1,"spaces":[],"metrics":{"cyclomatic":{},"cognitive":{"sum":0},"loc":{"ploc":1}}}"#,
    ] {
        assert!(serde_json::from_str::<Space>(input).is_err());
    }
}

fn fixture() -> Result<(tempfile::TempDir, FileReport), MetricsError> {
    let root = tempfile::tempdir()?;
    fs::create_dir(root.path().join("src"))?;
    fs::create_dir_all(root.path().join("xtask/src"))?;
    let path = root.path().join("src/main.rs");
    let content = b"fn main() {}";
    fs::write(&path, content)?;
    let file = FileReport {
        path: path.to_string_lossy().replace(char::from(92), "/"),
        sha256: format!("{:x}", Sha256::digest(content)),
        code_lines: 1.0,
        functions: Vec::new(),
    };
    Ok((root, file))
}

#[test]
fn changed_source_invalidates_previously_computed_metrics() -> Result<(), MetricsError> {
    let (root, report) = fixture()?;
    verify_sources(root.path(), std::slice::from_ref(&report))?;
    fs::write(&report.path, "fn main() { if true {} }")?;
    assert!(matches!(
        verify_sources(root.path(), &[report]),
        Err(MetricsError::Analyzer(message)) if message.starts_with("Source changed")
    ));
    Ok(())
}

#[test]
fn added_or_removed_sources_invalidate_metric_inventory() -> Result<(), MetricsError> {
    let (root, report) = fixture()?;
    verify_sources(root.path(), std::slice::from_ref(&report))?;
    let added = root.path().join("xtask/src/new.rs");
    fs::write(&added, "fn new() {}")?;
    assert!(matches!(
        verify_sources(root.path(), std::slice::from_ref(&report)),
        Err(MetricsError::Analyzer(message)) if message.contains("inventory changed")
    ));
    fs::remove_file(added)?;
    fs::remove_file(&report.path)?;
    assert!(matches!(
        verify_sources(root.path(), &[report]),
        Err(MetricsError::Analyzer(message)) if message.contains("inventory changed")
    ));
    Ok(())
}
