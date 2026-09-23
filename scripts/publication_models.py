# /// script
# requires-python = ">=3.11"
# dependencies = ["pydantic==2.11.9"]
# ///
# ─── How to run ───
# Imported by: uv run --project scripts --locked python scripts/publish_pages.py --help
# ─────────────────
"""Typed boundaries for immutable distribution metadata."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar, Final, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

TARGETS: Final = (
    "x86_64-pc-windows-msvc",
    "x86_64-apple-darwin",
    "aarch64-apple-darwin",
    "x86_64-unknown-linux-musl",
    "aarch64-unknown-linux-musl",
)
KINDS: Final = (*TARGETS, "universal")


class PublicationError(Exception):
    """A publication boundary failed; no site should be deployed."""


class Metadata(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(
        frozen=True, extra="allow", strict=True
    )


class Source(Metadata):
    source: Literal["url"]
    type: Literal["zip"]
    url: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    path: Literal["oh-my-zcode"]


class Artifact(Metadata):
    path: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    size: int = Field(ge=0)


class Plugin(Metadata):
    name: Literal["oh-my-zcode"]
    version: str
    source: Source
    artifact: Artifact = Field(alias="_artifact")


class Marketplace(Metadata):
    name: str
    plugins: tuple[Plugin, ...] = Field(min_length=1, max_length=1)


@dataclass(frozen=True, slots=True)
class SiteFile:
    path: Path
    content: bytes


def version_key(version: str) -> tuple[int, ...]:
    """Accept stable release versions only, before using them as paths."""
    if not re.fullmatch(
        r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)", version
    ):
        raise PublicationError(f"invalid stable version: {version}")
    return tuple(int(part) for part in version.split("."))


def base_url(raw: str) -> str:
    parsed = urlsplit(raw)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise PublicationError(
            "base URL must be HTTPS without credentials, query or fragment"
        )
    return raw.rstrip("/") + "/"


def artifact_path(version: str) -> str:
    _ = version_key(version)
    return f"plugins/oh-my-zcode/{version}/plugin.zip"
