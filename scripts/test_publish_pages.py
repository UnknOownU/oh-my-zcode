#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pydantic>=2,<3", "typer>=0.12,<1"]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run scripts/test_publish_pages.py
# 3. Or run with Python 3.11+:
#      python scripts/test_publish_pages.py
# ─────────────────

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

BASE_URL = "https://unknoownu.github.io/oh-my-zcode/"
TARGETS = (
    "x86_64-pc-windows-msvc",
    "x86_64-apple-darwin",
    "aarch64-apple-darwin",
    "x86_64-unknown-linux-musl",
    "aarch64-unknown-linux-musl",
)
KINDS = (*TARGETS, "universal")
SCRIPT = Path(__file__).with_name("publish_pages.py")


def marketplace_bytes(version: str, kind: str, plugin: bytes) -> bytes:
    digest = hashlib.sha256(plugin).hexdigest()
    artifact = f"plugins/oh-my-zcode/{version}/plugin.zip"
    document = {
        "name": "unknoownu" if kind == "universal" else f"oh-my-zcode-{kind}",
        "description": "test distribution",
        "owner": {"name": "UnknOownU", "url": "https://github.com/UnknOownU"},
        "plugins": [
            {
                "name": "oh-my-zcode",
                "version": version,
                "description": "test plugin",
                "source": {
                    "source": "url",
                    "type": "zip",
                    "url": f"{BASE_URL}{version}/{kind}/{artifact}",
                    "sha256": digest,
                    "path": "oh-my-zcode",
                },
                "_artifact": {"path": artifact, "sha256": digest, "size": len(plugin)},
            }
        ],
    }
    return (json.dumps(document, indent=2) + "\n").encode()


def write_distribution_asset(
    release: Path,
    version: str,
    kind: str,
    *,
    plugin: bytes | None = None,
    checksum: str | None = None,
    marketplace: bytes | None = None,
    extra_members: tuple[tuple[str, bytes], ...] = (),
) -> Path:
    archive = plugin or f"plugin-{version}-{kind}".encode()
    digest = hashlib.sha256(archive).hexdigest()
    artifact = f"plugins/oh-my-zcode/{version}/plugin.zip"
    asset = release / f"oh-my-zcode-{version}-{kind}.zip"
    asset.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(asset, "w", compression=zipfile.ZIP_DEFLATED) as outer:
        outer.writestr(
            "marketplace.json",
            marketplace or marketplace_bytes(version, kind, archive),
        )
        outer.writestr("SHA256SUMS", checksum or f"{digest}  {artifact}\n")
        outer.writestr(artifact, archive)
        for member, content in extra_members:
            outer.writestr(member, content)
    return asset


class PublishPagesTests(unittest.TestCase):
    def run_cli(
        self, *arguments: str, expected: int = 0
    ) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(expected, result.returncode, result.stdout + result.stderr)
        return result

    def test_complete_v300_release_has_exact_archives_and_json_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            releases = root / "releases"
            release = releases / "v3.0.0"
            for kind in KINDS:
                _ = write_distribution_asset(release, "3.0.0", kind)
            site = root / "site"
            _ = self.run_cli(
                "assemble",
                "--releases",
                str(releases),
                "--output",
                str(site),
                "--base-url",
                BASE_URL,
            )
            for kind in KINDS:
                artifact = (
                    site / "3.0.0" / kind / "plugins/oh-my-zcode/3.0.0/plugin.zip"
                )
                self.assertEqual(f"plugin-3.0.0-{kind}".encode(), artifact.read_bytes())
            self.assertEqual(
                marketplace_bytes("3.0.0", "universal", b"plugin-3.0.0-universal"),
                (site / "marketplace.json").read_bytes(),
            )
            for target in TARGETS:
                self.assertEqual(
                    (site / "3.0.0" / target / "marketplace.json").read_bytes(),
                    (site / "latest" / target / "marketplace.json").read_bytes(),
                )
            index = (site / "index.html").read_text(encoding="utf-8")
            self.assertIn('href="marketplace.json"', index)
            self.assertIn(
                'href="3.0.0/universal/plugins/oh-my-zcode/3.0.0/plugin.zip"', index
            )
            for target in TARGETS:
                self.assertIn(
                    f'href="3.0.0/{target}/plugins/oh-my-zcode/3.0.0/plugin.zip"',
                    index,
                )
            self.assertNotIn("Archived native releases", index)
            self.assertFalse((site / "3.0.1").exists())

    def test_bundle_has_portable_names_and_bound_checksum(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "universal"
            version = "3.0.0"
            kind = "universal"
            plugin = b"exact-universal-plugin-archive"
            artifact = f"plugins/oh-my-zcode/{version}/plugin.zip"
            digest = hashlib.sha256(plugin).hexdigest()
            marketplace = marketplace_bytes(version, kind, plugin)
            (source / artifact).parent.mkdir(parents=True)
            _ = (source / artifact).write_bytes(plugin)
            _ = (source / "marketplace.json").write_bytes(marketplace)
            _ = (source / "SHA256SUMS").write_bytes(f"{digest}  {artifact}\n".encode())
            bundle = root / "oh-my-zcode-3.0.0-universal.zip"

            _ = self.run_cli(
                "bundle",
                "--source",
                str(source),
                "--version",
                version,
                "--kind",
                kind,
                "--base-url",
                BASE_URL,
                "--output",
                str(bundle),
            )

            with zipfile.ZipFile(bundle) as archive:
                self.assertEqual(
                    ["SHA256SUMS", "marketplace.json", artifact], archive.namelist()
                )
                self.assertFalse(any("\\" in name for name in archive.namelist()))
                self.assertEqual(plugin, archive.read(artifact))
                self.assertEqual(marketplace, archive.read("marketplace.json"))
                self.assertEqual(
                    f"{digest}  {artifact}\n".encode(), archive.read("SHA256SUMS")
                )

    def test_multiple_complete_versions_are_retained(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            releases = root / "releases"
            for version in ("3.0.0", "3.0.1"):
                for kind in KINDS:
                    _ = write_distribution_asset(
                        releases / f"v{version}", version, kind
                    )
            site = root / "site"

            _ = self.run_cli(
                "assemble",
                "--releases",
                str(releases),
                "--output",
                str(site),
                "--base-url",
                BASE_URL,
            )

            self.assertTrue(
                (
                    site / "3.0.0/universal/plugins/oh-my-zcode/3.0.0/plugin.zip"
                ).is_file()
            )
            self.assertTrue(
                (
                    site / "3.0.1/universal/plugins/oh-my-zcode/3.0.1/plugin.zip"
                ).is_file()
            )
            self.assertEqual(
                marketplace_bytes("3.0.1", "universal", b"plugin-3.0.1-universal"),
                (site / "marketplace.json").read_bytes(),
            )


if __name__ == "__main__":
    _ = unittest.main()
