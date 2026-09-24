use crate::package::{Error, Result};
use std::{
    fs,
    path::{Component, Path},
};

#[derive(Debug)]
pub(crate) struct Entry {
    pub(crate) name: String,
    pub(crate) bytes: Vec<u8>,
    pub(crate) mode: u32,
}

impl Entry {
    pub(crate) fn new(relative: &Path, bytes: Vec<u8>, executable: bool) -> Result<Self> {
        let components = relative
            .components()
            .map(|part| match part {
                Component::Normal(name) => name.to_str().filter(|name| !name.contains(['\\', ':'])),
                _ => None,
            })
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| Error::UnsafePath(relative.to_path_buf()))?;
        if components.is_empty() {
            return Err(Error::UnsafePath(relative.to_path_buf()));
        }
        Ok(Self {
            name: format!("oh-my-zcode/{}", components.join("/")),
            bytes,
            mode: if executable { 0o755 } else { 0o644 },
        })
    }
}

pub(crate) fn collect(root: &Path) -> Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for directory in ["agents", "commands", "skills", "docs"] {
        collect_tree(root, &root.join(directory), &mut entries)?;
    }
    for file in [
        "README.md",
        "README_CN.md",
        "README_FR.md",
        "vendor/codegraph/package.json",
        "vendor/codegraph/package-lock.json",
    ] {
        entries.push(read_entry(root, &root.join(file))?);
    }
    let license = root.join("LICENSE");
    let license = if license.is_file() {
        license
    } else {
        root.parent()
            .ok_or_else(|| Error::UnsafePath(root.to_path_buf()))?
            .join("LICENSE")
    };
    reject_link(&license)?;
    entries.push(Entry::new(Path::new("LICENSE"), fs::read(license)?, false)?);
    Ok(entries)
}

pub(crate) fn launcher(root: &Path) -> Result<Entry> {
    let path = root.join("bin/launch.mjs");
    if !reject_link(&path)?.is_file() {
        return Err(Error::UnsafePath(path));
    }
    Entry::new(Path::new("bin/launch.mjs"), fs::read(path)?, false)
}

fn collect_tree(root: &Path, directory: &Path, entries: &mut Vec<Entry>) -> Result<()> {
    reject_link(directory)?;
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        let metadata = reject_link(&path)?;
        if metadata.is_dir() {
            collect_tree(root, &path, entries)?;
        } else {
            entries.push(read_entry(root, &path)?);
        }
    }
    Ok(())
}

fn read_entry(root: &Path, path: &Path) -> Result<Entry> {
    if !reject_link(path)?.is_file() {
        return Err(Error::UnsafePath(path.to_path_buf()));
    }
    let extension = path.extension().and_then(|part| part.to_str());
    if !matches!(
        extension,
        Some("md" | "json" | "png" | "svg" | "jpg" | "webp" | "txt")
    ) {
        return Err(Error::UnsupportedAsset(path.to_path_buf()));
    }
    let relative = path
        .strip_prefix(root)
        .map_err(|_| Error::UnsafePath(path.to_path_buf()))?;
    Entry::new(relative, fs::read(path)?, false)
}

pub(crate) fn reject_link(path: &Path) -> Result<fs::Metadata> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.is_symlink() {
        return Err(Error::UnsafePath(path.to_path_buf()));
    }
    Ok(metadata)
}
