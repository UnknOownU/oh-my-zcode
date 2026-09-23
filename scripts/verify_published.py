#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Verify the public v3.0.0 marketplace JSON and ZIP checksums."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections.abc import Mapping
from http.client import HTTPResponse
from typing import TypeAlias, cast
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

TARGETS = (
    "x86_64-pc-windows-msvc",
    "x86_64-apple-darwin",
    "aarch64-apple-darwin",
    "x86_64-unknown-linux-musl",
    "aarch64-unknown-linux-musl",
)
JsonValue: TypeAlias = (
    None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
)


def fetch(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "oh-my-zcode-release-verifier/3.0.0"})
    with cast(HTTPResponse, urlopen(request, timeout=30)) as response:
        if response.status != 200:
            raise ValueError(f"{url} returned HTTP {response.status}")
        payload = response.read()
    return payload


def object_mapping(value: object, url: str) -> Mapping[str, object]:
    if not isinstance(value, dict) or not all(
        isinstance(key, str) for key in cast(dict[object, object], value)
    ):
        raise ValueError(f"{url} is not a JSON object")
    return cast(Mapping[str, object], value)


def plugin(document: bytes, url: str) -> Mapping[str, object]:
    parsed = cast(object, json.loads(document))
    root = object_mapping(parsed, url)
    plugins = root.get("plugins")
    plugin_list = cast(list[object], plugins) if isinstance(plugins, list) else []
    if (
        len(plugin_list) != 1
        or not isinstance(plugin_list[0], dict)
    ):
        raise ValueError(f"{url} must contain exactly one plugin")
    return object_mapping(cast(object, plugin_list[0]), url)


def text(mapping: Mapping[str, object], key: str, url: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{url} has invalid {key}")
    return value


def verify_distribution(
    marketplace_url: str, base: str, expected_version: str, expected_kind: str
) -> None:
    entry = plugin(fetch(marketplace_url), marketplace_url)
    version = text(entry, "version", marketplace_url)
    if version != expected_version:
        raise ValueError(f"{marketplace_url} advertises {version}, expected {expected_version}")
    source = object_mapping(entry.get("source"), marketplace_url)
    artifact = object_mapping(entry.get("_artifact"), marketplace_url)
    source_url = text(source, "url", marketplace_url)
    artifact_path = text(artifact, "path", marketplace_url)
    expected_source = urljoin(base, f"{expected_version}/{expected_kind}/{artifact_path}")
    if source_url != expected_source:
        raise ValueError(f"{marketplace_url} points to {source_url}, expected {expected_source}")
    expected_sha = text(artifact, "sha256", marketplace_url)
    if text(source, "sha256", marketplace_url) != expected_sha:
        raise ValueError(f"{marketplace_url} has mismatched source and artifact checksums")
    payload = fetch(source_url)
    actual_sha = hashlib.sha256(payload).hexdigest()
    if actual_sha != expected_sha:
        raise ValueError(f"{source_url} checksum {actual_sha} != {expected_sha}")
    expected_size = artifact.get("size")
    if not isinstance(expected_size, int) or isinstance(expected_size, bool):
        raise TypeError(f"{marketplace_url} has invalid size")
    if expected_size != len(payload):
        raise ValueError(f"{source_url} size {len(payload)} != {expected_size}")


def main() -> int:
    parser = argparse.ArgumentParser()
    _ = parser.add_argument("--base-url", required=True)
    _ = parser.add_argument("--version", default="3.0.0")
    arguments = parser.parse_args()
    base_url = cast(str, arguments.base_url)
    version = cast(str, arguments.version)
    base = base_url.rstrip("/") + "/"
    parsed = urlsplit(base)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("--base-url must be an HTTPS URL without credentials")
    verify_distribution(
        urljoin(base, "marketplace.json"), base, version, "universal"
    )
    for target in TARGETS:
        verify_distribution(
            urljoin(base, f"latest/{target}/marketplace.json"),
            base,
            version,
            target,
        )
    message = f"verified {version} marketplace JSON and ZIP checksums for {len(TARGETS) + 1} distributions"
    print(message)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"publication verification failed: {error}")
        raise SystemExit(1) from error
