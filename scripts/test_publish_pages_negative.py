#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pydantic==2.11.9", "typer==0.17.4"]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run --project scripts --locked python scripts/test_publish_pages_negative.py
# 3. Or run with Python 3.11+:
#      python scripts/test_publish_pages_negative.py
# ─────────────────

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

from test_publish_pages import BASE_URL, KINDS, SCRIPT, write_distribution_asset


class PublicationRejectionTests(unittest.TestCase):
    def assemble(self, releases: Path, site: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "assemble",
                "--releases",
                str(releases),
                "--output",
                str(site),
                "--base-url",
                BASE_URL,
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    def complete_release(self, root: Path, version: str = "3.0.1") -> Path:
        release = root / f"v{version}"
        for kind in KINDS:
            _ = write_distribution_asset(release, version, kind)
        return release

    def test_incomplete_stable_release_fails_before_output(self) -> None:
        # Given a v3 release missing its universal distribution asset.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = root / "releases" / "v3.0.1"
            for kind in KINDS[:-1]:
                _ = write_distribution_asset(release, "3.0.1", kind)

            # When the site assembly validates the release.
            site = root / "site"
            result = self.assemble(root / "releases", site)

            # Then publication fails without a partial deployable tree.
            self.assertNotEqual(0, result.returncode)
            self.assertIn("missing distribution assets", result.stderr)
            self.assertFalse(site.exists())

    def test_archive_traversal_is_rejected(self) -> None:
        # Given a complete release whose universal asset contains a traversal member.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = self.complete_release(root / "releases")
            _ = write_distribution_asset(
                release,
                "3.0.1",
                "universal",
                extra_members=(("../escape", b"owned"),),
            )

            # When assembly inspects member names before extraction.
            site = root / "site"
            result = self.assemble(root / "releases", site)

            # Then the unsafe member is rejected and nothing escapes.
            self.assertNotEqual(0, result.returncode)
            self.assertIn("unsafe archive member", result.stderr)
            self.assertFalse((root / "escape").exists())
            self.assertFalse(site.exists())

    def test_duplicate_archive_member_is_rejected(self) -> None:
        # Given a complete release with two marketplace entries in one asset.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = self.complete_release(root / "releases")
            asset = release / "oh-my-zcode-3.0.1-universal.zip"
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                with zipfile.ZipFile(asset, "a") as archive:
                    archive.writestr("marketplace.json", b"{}")

            # When assembly inspects the central directory.
            result = self.assemble(root / "releases", root / "site")

            # Then the duplicate name fails closed.
            self.assertNotEqual(0, result.returncode)
            self.assertIn("duplicate archive member", result.stderr)

    def test_checksum_mismatch_is_rejected(self) -> None:
        # Given a complete release whose universal checksum lies about the plugin bytes.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = self.complete_release(root / "releases")
            _ = write_distribution_asset(
                release,
                "3.0.1",
                "universal",
                checksum=f"{'0' * 64}  plugins/oh-my-zcode/3.0.1/plugin.zip\n",
            )

            # When assembly validates the bound checksum.
            result = self.assemble(root / "releases", root / "site")

            # Then publication fails on the binary mismatch.
            self.assertNotEqual(0, result.returncode)
            self.assertIn("checksum mismatch", result.stderr)

    def test_malformed_marketplace_is_rejected(self) -> None:
        # Given a complete release whose universal marketplace is not JSON.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = self.complete_release(root / "releases")
            _ = write_distribution_asset(
                release,
                "3.0.1",
                "universal",
                marketplace=b"not-json",
            )

            # When assembly parses the release metadata boundary.
            site = root / "site"
            result = self.assemble(root / "releases", site)

            # Then publication fails before creating any deployable output.
            self.assertNotEqual(0, result.returncode)
            self.assertIn("publication failed", result.stderr)
            self.assertFalse(site.exists())

    def test_nested_or_backslash_members_are_rejected(self) -> None:
        # Given a release asset in the old nested Windows archive shape.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            release = self.complete_release(root / "releases")
            asset = release / "oh-my-zcode-3.0.1-universal.zip"
            asset.unlink()
            with zipfile.ZipFile(asset, "w") as archive:
                member = zipfile.ZipInfo("placeholder")
                member.filename = "universal\\marketplace.json"
                archive.writestr(member, b"{}")

            # When assembly validates the member layout.
            result = self.assemble(root / "releases", root / "site")

            # Then the non-portable name is rejected explicitly.
            self.assertNotEqual(0, result.returncode)
            self.assertIn("backslash", result.stderr)


if __name__ == "__main__":
    _ = unittest.main()
