use crate::{
    archive, artifact,
    assets::{self, Entry},
    manifests,
    package::{self, Error, Publication, Result},
    target::Target,
};
use clap::Args;
use std::path::{Path, PathBuf};

#[derive(Debug, Args)]
pub(crate) struct Options {
    #[arg(long)]
    binaries: PathBuf,
    #[arg(long, default_value = "plugin")]
    plugin_root: PathBuf,
    #[arg(long)]
    output: PathBuf,
    #[arg(long)]
    base_url: String,
}

pub(crate) fn run(options: &Options) -> Result<()> {
    let base = package::distribution_url(&options.base_url)?;
    let (plugin, zip) = build_archive(options)?;
    Publication {
        output: &options.output,
        segment: "universal",
        marketplace_name: "unknoownu".to_owned(),
        marketplace_description: "Oh My Zcode universal distribution",
    }
    .write(&base, &plugin, zip)
}

fn build_archive(options: &Options) -> Result<(manifests::Plugin, Vec<u8>)> {
    let (plugin, mut entries) = manifests::universal(&options.plugin_root)?;
    entries.extend(assets::collect(&options.plugin_root)?);
    entries.push(assets::launcher(&options.plugin_root)?);
    for target in Target::ALL {
        entries.push(runtime_entry(&options.binaries, target)?);
    }
    Ok((plugin, archive::encode(entries)?))
}

fn runtime_entry(root: &Path, target: Target) -> Result<Entry> {
    let source = root.join(target.triple()).join(target.executable());
    let destination = Path::new("bin")
        .join(target.triple())
        .join(target.executable());
    let bytes = artifact::read(&source, target).map_err(|source| Error::UniversalBinary {
        target: target.triple(),
        source,
    })?;
    Entry::new(&destination, bytes, true)
}
