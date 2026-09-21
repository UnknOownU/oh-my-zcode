# Distribution and installation

The **3.0.0** plugin ships as a ZIP containing its native runtime and declarative assets. Users do not need Rust or a compiler. Hooks and the scope MCP server run the same bundled executable.

| Machine | Target |
|---|---|
| Windows x64 | `x86_64-pc-windows-msvc` |
| macOS Intel | `x86_64-apple-darwin` |
| macOS Apple Silicon | `aarch64-apple-darwin` |
| Linux x64 | `x86_64-unknown-linux-musl` |
| Linux ARM64 | `aarch64-unknown-linux-musl` |

Each platform has its own `marketplace.json` and ZIP. All identify the plugin as `oh-my-zcode`, version `3.0.0`. Choose the marketplace for your operating system and architecture; ZCode's documented manifest format does not select an executable architecture automatically.

## Install

1. Download the distribution for your machine or obtain its HTTPS marketplace URL from the publisher.
2. In ZCode, open **Settings → Plugins → Create → Add marketplace** and add that platform's marketplace URL. For a local installation, extract `plugin.zip` and add the extracted `oh-my-zcode` folder as a local plugin.
3. Install `oh-my-zcode`, restart ZCode so its MCP declarations reload, and start a new session so hooks reload.

The repository checkout contains source code. Installing it directly is not the supported end-user distribution path. Release archives are produced and checked by CI; availability depends on the publisher making those artifacts accessible.

The marketplace records a SHA-256 checksum of its ZIP, and ZCode's verified ZIP installation checks that digest before extraction. Keep versioned archives immutable. The packager refuses to replace an existing archive with different bytes.

## Optional external servers

The gates and scope MCP server require no Node runtime. Other MCP servers remain separate tools:

- **Codegraph** requires Node and npm. From the installed plugin directory, run `npm --prefix vendor/codegraph ci --omit=dev --no-audit --no-fund`, then restart ZCode. Its dependency lockfile selects the package version and npm selects its platform dependency. No first-party hook runs npm or downloads tools.
- **Semgrep** requires the `semgrep` command on `PATH`.
- **OSV Scanner** requires the `osv-scanner` command on `PATH`.
- **grep.app** uses an external HTTP server.

An unavailable optional server does not prevent the bundled gates or scope server from running.

## Update notice

At session start the native binary compares the installed version against the published marketplace (one anonymous GET of the public `marketplace.json`, 2s cap, `curl` on PATH — no payload, no identifier). When a newer version exists, one line is appended to the injected doctrine: `UPDATE oh-my-zcode: <latest> available (installed <v>)`. Everything fails open: offline, missing curl, malformed manifest or an unparseable version produce silence, never an error.

The check is rate-limited to one attempt per 24h. Its state lives in `~/.zcode/cli/plugins/data/oh-my-zcode@unknoownu/update-check.json`; setting `"disabled": true` there is the kill switch. `OH_MY_ZCODE_UPDATE_URL` (a `file://` URL works for tests) and `OH_MY_ZCODE_UPDATE_STATE` are environment overrides. The plugin root is derived from the binary's own location (`<root>/bin/`); `ZCODE_PLUGIN_ROOT` overrides it.

The package format follows the [official ZCode verified ZIP distribution contract](https://github.com/zai-org/zcode-plugins/blob/cf739288297533abaa5eec9561bd1cb96e328532/docs/distribution.md).
