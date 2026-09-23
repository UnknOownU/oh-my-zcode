# /// script
# requires-python = ">=3.11"
# dependencies = ["pydantic==2.11.9"]
# ///
# ─── How to run ───
# Imported by: uv run --project scripts --locked python scripts/publish_pages.py --help
# ─────────────────
"""Read distribution ZIPs without extracting untrusted member paths."""

from __future__ import annotations

import hashlib
import stat
import zipfile
from pathlib import Path, PurePosixPath
from typing import Final

from publication_models import Marketplace, PublicationError, SiteFile, artifact_path

MAX_BYTES: Final = 512 * 1024 * 1024


def read_archive(path: Path) -> tuple[SiteFile, ...]:
    """Reject unsafe, duplicate or oversized members before reading payloads."""
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        if (
            len(members) > 100
            or sum(member.file_size for member in members) > MAX_BYTES
        ):
            raise PublicationError(f"oversized distribution archive: {path}")
        seen: set[str] = set()
        for member in members:
            name = member.orig_filename
            if "\\" in name:
                raise PublicationError(f"backslash in archive member: {name}")
            parts = PurePosixPath(name).parts
            if (
                not parts
                or name.startswith("/")
                or ":" in name
                or any(part in (".", "..", "") for part in name.split("/"))
                or stat.S_ISLNK(member.external_attr >> 16)
            ):
                raise PublicationError(f"unsafe archive member: {name}")
            if name.casefold() in seen:
                raise PublicationError(f"duplicate archive member: {name}")
            seen.add(name.casefold())
        return tuple(
            SiteFile(Path(member.filename), archive.read(member)) for member in members
        )


def validate_distribution(
    files: tuple[SiteFile, ...],
    version: str,
    kind: str,
    base: str,
) -> tuple[SiteFile, ...]:
    """Bind one marketplace to its exact ZIP, size, checksum and public URL."""
    payloads = {item.path.as_posix(): item.content for item in files}
    artifact = artifact_path(version)
    if set(payloads) != {"marketplace.json", "SHA256SUMS", artifact}:
        raise PublicationError(f"invalid distribution member layout: {version}/{kind}")
    market = Marketplace.model_validate_json(payloads["marketplace.json"])
    plugin = market.plugins[0]
    zip_bytes = payloads[artifact]
    digest = hashlib.sha256(zip_bytes).hexdigest()
    if (
        plugin.source.sha256 != digest
        or plugin.artifact.sha256 != digest
        or payloads["SHA256SUMS"].decode().strip() != f"{digest}  {artifact}"
    ):
        raise PublicationError(f"checksum mismatch: {version}/{kind}")
    if (
        plugin.version != version
        or plugin.artifact.path != artifact
        or plugin.artifact.size != len(zip_bytes)
        or plugin.source.url != f"{base}{version}/{kind}/{artifact}"
    ):
        raise PublicationError(f"metadata mismatch: {version}/{kind}")
    expected_name = "unknoownu" if kind == "universal" else f"oh-my-zcode-{kind}"
    if market.name != expected_name:
        raise PublicationError(f"marketplace identity mismatch: {version}/{kind}")
    return files


def write_bundle(output: Path, files: tuple[SiteFile, ...]) -> None:
    """Create a portable bundle once; never replace an existing release asset."""
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(files, key=lambda item: item.path.as_posix()):
            info = zipfile.ZipInfo(
                item.path.as_posix(), date_time=(1980, 1, 1, 0, 0, 0)
            )
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, item.content)
