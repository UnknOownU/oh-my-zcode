use crate::{
    assets::Entry,
    package::{Error, Result},
};
use std::{
    fs,
    io::{Cursor, Write},
    path::Path,
};
use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

pub(crate) fn encode(mut entries: Vec<Entry>) -> Result<Vec<u8>> {
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
    for entry in entries {
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .last_modified_time(zip::DateTime::default())
            .unix_permissions(entry.mode);
        archive.start_file(entry.name, options)?;
        archive.write_all(&entry.bytes)?;
    }
    Ok(archive.finish()?.into_inner())
}

pub(crate) fn ensure_unchanged(path: &Path, bytes: &[u8]) -> Result<()> {
    match fs::read(path) {
        Ok(existing) if existing == bytes => Ok(()),
        Ok(_) => Err(Error::Immutable(path.to_path_buf())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub(crate) fn write_once(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| Error::UnsafePath(path.to_path_buf()))?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    match temporary.persist_noclobber(path) {
        Ok(_) => Ok(()),
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
            ensure_unchanged(path, bytes)
        }
        Err(error) => Err(error.error.into()),
    }
}
