#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pydantic==2.11.9", "typer==0.17.4"]
# ///
# ─── How to run ───
# uv run --project scripts --locked python scripts/publish_pages.py --help
# uv run --project scripts --locked python scripts/test_publish_pages.py
# ─────────────────
"""Assemble Pages from immutable release assets, without rebuilding binaries."""

from __future__ import annotations

import tempfile
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Annotated, cast

import typer
from publication_archive import read_archive, validate_distribution, write_bundle
from publication_index import render_index
from publication_models import (
    KINDS,
    TARGETS,
    PublicationError,
    SiteFile,
    artifact_path,
    version_key,
)
from publication_models import (
    base_url as normalize_base,
)
from pydantic import ValidationError

app = typer.Typer(pretty_exceptions_enable=False)
option_factory = cast(Callable[[], object], typer.Option)
PathOption = Annotated[Path, option_factory()]
TextOption = Annotated[str, option_factory()]


def release_files(release: Path, version: str, base: str) -> tuple[SiteFile, ...]:
    """Require a complete stable release before constructing any site output."""
    assets = [(kind, release / f"oh-my-zcode-{version}-{kind}.zip") for kind in KINDS]
    missing = [path.name for _, path in assets if not path.is_file()]
    if missing:
        raise PublicationError(f"missing distribution assets: {', '.join(missing)}")
    files: list[SiteFile] = []
    for kind, path in assets:
        distribution = validate_distribution(read_archive(path), version, kind, base)
        files.extend(
            SiteFile(Path(kind) / item.path, item.content) for item in distribution
        )
    return tuple(files)


@app.command()
def assemble(releases: PathOption, output: PathOption, base_url: TextOption) -> None:
    """Validate all release assets, then atomically create the complete site."""
    base = normalize_base(base_url)
    versions = sorted(
        (path.name.removeprefix("v") for path in releases.iterdir() if path.is_dir()),
        key=version_key,
    )
    if not versions:
        raise PublicationError("a complete universal release is required")
    files: list[SiteFile] = []
    for version in versions:
        distribution = release_files(releases / f"v{version}", version, base)
        files.extend(
            SiteFile(Path(version) / item.path, item.content) for item in distribution
        )
    latest = versions[-1]
    by_path = {item.path.as_posix(): item.content for item in files}
    if f"{latest}/universal/marketplace.json" not in by_path:
        raise PublicationError("missing distribution assets: latest universal package")
    files.append(
        SiteFile(
            Path("marketplace.json"), by_path[f"{latest}/universal/marketplace.json"]
        )
    )
    for target in TARGETS:
        files.append(
            SiteFile(
                Path("latest") / target / "marketplace.json",
                by_path[f"{latest}/{target}/marketplace.json"],
            )
        )
    files.append(SiteFile(Path("index.html"), render_index(latest, base)))
    files.append(SiteFile(Path(".nojekyll"), b""))
    if output.exists():
        raise PublicationError(
            f"output already exists: {output}; use a fresh staging directory"
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="pages-stage-", dir=output.parent
    ) as temporary:
        staging = Path(temporary) / "site"
        for item in files:
            destination = staging / item.path
            destination.parent.mkdir(parents=True, exist_ok=True)
            _ = destination.write_bytes(item.content)
        _ = staging.rename(output)
    typer.echo(output)


@app.command()
def bundle(
    source: PathOption,
    version: TextOption,
    kind: TextOption,
    base_url: TextOption,
    output: PathOption,
) -> None:
    """Wrap one validated xtask distribution in a portable release ZIP."""
    if kind not in KINDS:
        raise PublicationError(f"unsupported distribution kind: {kind}")
    names = ("marketplace.json", "SHA256SUMS", artifact_path(version))
    files = tuple(SiteFile(Path(name), (source / name).read_bytes()) for name in names)
    _ = validate_distribution(files, version, kind, normalize_base(base_url))
    write_bundle(output, files)
    typer.echo(output)


if __name__ == "__main__":
    try:
        app()
    except (
        PublicationError,
        OSError,
        ValidationError,
        zipfile.BadZipFile,
        UnicodeError,
    ) as error:
        typer.echo(f"publication failed: {error}", err=True)
        raise SystemExit(1) from error
