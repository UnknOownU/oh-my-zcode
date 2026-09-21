use crate::target::Target;
use object::{
    Architecture, BinaryFormat, File, Object, ObjectKind,
    read::elf::{Dyn, ProgramHeader},
};
use std::{fs, path::Path};

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("unrecognized native executable: {0}")]
    Parse(#[from] object::Error),
    #[error("runtime must be a regular file, not a link")]
    NotFile,
    #[error("native executable format/architecture does not match target {0}")]
    Target(&'static str),
    #[error(
        "Linux musl distribution requires a static executable without an ELF interpreter or shared-library dependencies"
    )]
    DynamicLinux,
}

pub(crate) fn read(path: &Path, target: Target) -> Result<Vec<u8>, Error> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.is_symlink() {
        return Err(Error::NotFile);
    }
    let bytes = fs::read(path)?;
    let file = File::parse(bytes.as_slice())?;
    require_target(&file, target)?;
    if let File::Elf64(elf) = &file {
        require_static_linux(elf)?;
    }
    Ok(bytes)
}

fn require_target(file: &File<'_>, target: Target) -> Result<(), Error> {
    let expected = expected(target);
    let identity = (file.format(), file.architecture());
    let executable = matches!(
        (file.format(), file.kind()),
        (_, ObjectKind::Executable) | (BinaryFormat::Elf, ObjectKind::Dynamic)
    );
    if identity != expected || !executable || file.entry() == 0 {
        return Err(Error::Target(target.triple()));
    }
    Ok(())
}

const fn expected(target: Target) -> (BinaryFormat, Architecture) {
    match target {
        Target::WindowsX64 => (BinaryFormat::Pe, Architecture::X86_64),
        Target::MacosX64 => (BinaryFormat::MachO, Architecture::X86_64),
        Target::MacosArm64 => (BinaryFormat::MachO, Architecture::Aarch64),
        Target::LinuxX64 => (BinaryFormat::Elf, Architecture::X86_64),
        Target::LinuxArm64 => (BinaryFormat::Elf, Architecture::Aarch64),
    }
}

fn require_static_linux(file: &object::read::elf::ElfFile64<'_>) -> Result<(), Error> {
    for segment in file.elf_program_headers() {
        if segment.p_type(file.endian()) == object::elf::PT_INTERP {
            return Err(Error::DynamicLinux);
        }
        if let Some(entries) = segment.dynamic(file.endian(), file.data())?
            && entries
                .iter()
                .any(|entry| entry.d_tag(file.endian()) == object::elf::DT_NEEDED)
        {
            return Err(Error::DynamicLinux);
        }
    }
    Ok(())
}
