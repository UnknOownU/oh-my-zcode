//! Windows change timestamps, unavailable through stable `std::fs::Metadata`.
//!
//! The native test restores both bytes and mtime and checks that `ChangeTime` advances.
//! Miri cannot execute this Windows FFI; the feature names this native-only boundary.
#![allow(
    unsafe_code,
    reason = "One bounded Win32 metadata query behind a safe owning File API"
)]

use std::fs::OpenOptions;
use std::io;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use std::path::Path;

use windows_sys::Win32::Storage::FileSystem::{
    FILE_BASIC_INFO, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_DELETE, FILE_SHARE_READ,
    FILE_SHARE_WRITE, FileBasicInfo, GetFileInformationByHandleEx,
};

/// Read the metadata-change timestamp from the file actually opened at `path`.
///
/// The owned handle lives across the synchronous call. The initialized and aligned
/// output has exactly the layout and capacity required by `FileBasicInfo`.
pub fn change_time(path: &Path) -> io::Result<i64> {
    let file = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)?;
    let mut info = FILE_BASIC_INFO {
        CreationTime: 0,
        LastAccessTime: 0,
        LastWriteTime: 0,
        ChangeTime: 0,
        FileAttributes: 0,
    };
    let size = u32::try_from(size_of::<FILE_BASIC_INFO>()).map_err(io::Error::other)?;
    // SAFETY: File owns a valid live handle. FileBasicInfo writes at most `size`
    // bytes into this initialized, aligned FILE_BASIC_INFO; its exclusive pointer
    // stays valid for this synchronous call and does not escape the function.
    let succeeded = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileBasicInfo,
            (&raw mut info).cast(),
            size,
        )
    };
    if succeeded == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(info.ChangeTime)
    }
}
