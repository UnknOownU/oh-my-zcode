use crate::{
    archive, artifact,
    assets::{self, Entry},
    manifests::{self, Artifact, Listing, Marketplace, Owner, Source},
    target::Target,
};
use clap::Args;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub(crate) type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
    #[error(transparent)]
    Binary(#[from] artifact::Error),
    #[error("invalid universal runtime for {target}: {source}")]
    UniversalBinary {
        target: &'static str,
        #[source]
        source: artifact::Error,
    },
    #[error("unsafe package path: {0}")]
    UnsafePath(PathBuf),
    #[error("unsupported release asset: {0}")]
    UnsupportedAsset(PathBuf),
    #[error("immutable distribution file already exists with different bytes: {0}")]
    Immutable(PathBuf),
    #[error("invalid native manifest: {0}")]
    Manifest(&'static str),
    #[error("base URL must be HTTPS with a host and no credentials, query or fragment")]
    BaseUrl,
}

#[derive(Debug, Args)]
pub(crate) struct Options {
    #[arg(long, value_enum)]
    target: Target,
    #[arg(long)]
    binary: PathBuf,
    #[arg(long, default_value = "plugin")]
    plugin_root: PathBuf,
    #[arg(long)]
    output: PathBuf,
    #[arg(long)]
    base_url: String,
}

pub(crate) fn run(options: &Options) -> Result<()> {
    let base = distribution_url(&options.base_url)?;
    let (plugin, zip) = build_archive(options)?;
    Publication {
        output: &options.output,
        segment: options.target.triple(),
        marketplace_name: format!("oh-my-zcode-{}", options.target.triple()),
        marketplace_description: "Oh My Zcode native platform distribution",
    }
    .write(&base, &plugin, zip)
}

fn build_archive(options: &Options) -> Result<(manifests::Plugin, Vec<u8>)> {
    let root = &options.plugin_root;
    let (plugin, mut entries) = manifests::bake(root, options.target)?;
    entries.extend(assets::collect(root)?);
    let binary_path = Path::new("bin").join(options.target.executable());
    entries.push(Entry::new(
        &binary_path,
        artifact::read(&options.binary, options.target)?,
        true,
    )?);
    Ok((plugin, archive::encode(entries)?))
}

pub(crate) struct Publication<'a> {
    pub(crate) output: &'a Path,
    pub(crate) segment: &'a str,
    pub(crate) marketplace_name: String,
    pub(crate) marketplace_description: &'static str,
}

impl Publication<'_> {
    pub(crate) fn write(
        self,
        base: &url::Url,
        plugin: &manifests::Plugin,
        zip: Vec<u8>,
    ) -> Result<()> {
        let files = self.files(base, plugin, zip)?;
        for (path, bytes) in &files {
            archive::ensure_unchanged(path, bytes)?;
        }
        for (path, bytes) in &files {
            archive::write_once(path, bytes)?;
        }
        println!("{}", self.output.join(self.segment).display());
        Ok(())
    }

    fn files(
        &self,
        base: &url::Url,
        plugin: &manifests::Plugin,
        zip: Vec<u8>,
    ) -> Result<[(PathBuf, Vec<u8>); 3]> {
        let digest = hex::encode(Sha256::digest(&zip));
        let path = format!("plugins/{}/{}/plugin.zip", plugin.name, plugin.version);
        let url = format!("{}{}/{}", base, self.segment, path);
        let details = PublishedArchive {
            url: &url,
            digest: &digest,
            path: &path,
            size: zip.len(),
        };
        let marketplace = self.marketplace(plugin, &details);
        let output = self.output.join(self.segment);
        Ok([
            (output.join(&path), zip),
            (
                output.join("SHA256SUMS"),
                format!("{digest}  {path}\n").into_bytes(),
            ),
            (
                output.join("marketplace.json"),
                serde_json::to_vec_pretty(&marketplace)?,
            ),
        ])
    }

    fn marketplace<'a>(
        &self,
        plugin: &'a manifests::Plugin,
        details: &PublishedArchive<'a>,
    ) -> Marketplace<'a> {
        Marketplace {
            name: self.marketplace_name.clone(),
            description: self.marketplace_description,
            owner: Owner {
                name: "UnknOownU",
                url: "https://github.com/UnknOownU",
            },
            plugins: [Listing {
                name: &plugin.name,
                version: &plugin.version,
                description: &plugin.description,
                source: Source {
                    origin: "url",
                    kind: "zip",
                    url: details.url,
                    sha256: details.digest,
                    path: &plugin.name,
                },
                artifact: Artifact {
                    path: details.path,
                    sha256: details.digest,
                    size: details.size,
                },
            }],
        }
    }
}

struct PublishedArchive<'a> {
    url: &'a str,
    digest: &'a str,
    path: &'a str,
    size: usize,
}

pub(crate) fn distribution_url(raw: &str) -> Result<url::Url> {
    let mut url = url::Url::parse(raw).map_err(|_| Error::BaseUrl)?;
    let has_credentials = !url.username().is_empty() || url.password().is_some();
    if url.scheme() != "https"
        || url.host_str().is_none()
        || has_credentials
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::BaseUrl);
    }
    if !url.path().ends_with('/') {
        url.set_path(&format!("{}/", url.path()));
    }
    Ok(url)
}
