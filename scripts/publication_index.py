# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# ─── How to run ───
# Imported by: uv run scripts/publish_pages.py assemble --help
# ─────────────────
"""Render the small public download index from validated versions."""

from html import escape
from typing import Final

from publication_models import TARGETS, artifact_path

LABELS: Final = (
    "Windows x64",
    "macOS Intel",
    "macOS Apple Silicon",
    "Linux x64",
    "Linux ARM64",
)


def render_index(version: str, base: str) -> bytes:
    """Offer exact JSON import URLs, distinct from downloadable archives."""
    artifact = artifact_path(version)
    rows = "\n".join(
        f'<tr><th scope="row">{label}</th><td><a href="latest/{target}/marketplace.json">'
        + f"{escape(base)}latest/{target}/marketplace.json</a></td>"
        + f'<td><a href="{version}/{target}/{artifact}">Download plugin ZIP</a></td></tr>'
        for target, label in zip(TARGETS, LABELS, strict=True)
    )
    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>oh-my-zcode marketplace</title>
<style>body{{font-family:system-ui;max-width:64rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#202124}}
a{{color:#174ea6;overflow-wrap:anywhere}}td,th{{padding:.6rem;text-align:left;border-bottom:1px solid #ddd}}
table{{border-collapse:collapse;width:100%}}code{{background:#f4f4f4;padding:.15rem .3rem;overflow-wrap:anywhere}}
@media(max-width:40rem){{td,th{{display:block;padding:.3rem}}tr{{display:block;margin-bottom:1rem}}}}</style></head>
<body><h1>oh-my-zcode marketplace</h1>
<p>Current release: <strong>{version}</strong>. In ZCode, open <strong>Settings → Plugins → Create → Add marketplace</strong>
and paste this exact JSON URL:</p>
<p><a href="marketplace.json">{escape(base)}marketplace.json</a></p>
<p>The universal package supports Windows x64, macOS Intel and Apple Silicon, and Linux x64 and ARM64.
It requires <strong>Node.js 22+</strong> on PATH. No Rust compiler is required.</p>
<p>Install <strong>oh-my-zcode</strong> once from <strong>unknoownu</strong>, fully quit ZCode and relaunch it.
Remove an older copy before switching marketplaces to avoid duplicate installations.</p>
<h2>Native alternative without Node.js</h2><p>Choose your machine's JSON URL below.
Node.js may still be required by optional integrations.</p>
<table><caption>Native marketplace sources</caption><thead><tr><th>Platform</th><th>JSON URL to paste</th><th>Manual ZIP</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Manual download</h2><p><a href="{version}/universal/{artifact}">Download the universal plugin ZIP ({version})</a>.
A ZIP URL or this HTML page cannot be used as an Add marketplace source.
For a local install, create the marketplace wrapper described in the
<a href="https://github.com/UnknOownU/oh-my-zcode/blob/main/plugin/docs/distribution.md">installation guide</a>.</p>
<h2>Updates</h2><p>This correction keeps version 3.0.0. Uninstall an existing copy and install the corrected package once;
an equal version does not trigger an update. For future releases, refresh your marketplace in ZCode's Plugins settings and install the update offered by the host.
Then fully quit and relaunch ZCode and start a new session. The plugin's update notice does not install updates.</p>
</body></html>'''.encode()
