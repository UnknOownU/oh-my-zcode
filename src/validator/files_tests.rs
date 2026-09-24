use std::fs;

use tempfile::tempdir;

use super::{ValidationReport, check_encoding};

#[test]
fn binary_images_are_ignored_but_invalid_text_is_reported() {
    let directory = tempdir().expect("temporary plugin tree");
    let image = directory.path().join("logo.png");
    let text = directory.path().join("notes.md");
    fs::write(&image, [0x89, b'P', b'N', b'G', 0xff]).expect("write binary image");
    fs::write(&text, [0xff]).expect("write invalid text");

    let mut report = ValidationReport::default();
    check_encoding(directory.path(), &mut report);

    let text_prefix = format!("{}:", text.display());
    assert_eq!(report.errors.len(), 1);
    assert!(
        report
            .errors
            .first()
            .is_some_and(|error| error.starts_with(&text_prefix)),
        "expected the invalid text file to remain an encoding error: {:?}",
        report.errors
    );
}
