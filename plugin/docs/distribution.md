# Distribution and installation

## Recommended: the native marketplace for your machine

Version **3.0.0** publishes one marketplace per platform. Each package runs the Rust binary directly — **no Node.js, compiler, or npm install is required** for the hooks and the scope server. In **ZCode → Settings → Plugins → Create → Add marketplace**, paste the JSON URL matching the machine that runs ZCode — choose exactly one:

| Machine | Marketplace JSON URL |
|---|---|
| Windows x64 | <https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-pc-windows-msvc/marketplace.json> |
| macOS Apple Silicon (M1–M4) | <https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-apple-darwin/marketplace.json> |
| macOS Intel | <https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-apple-darwin/marketplace.json> |
| Linux x64 | <https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-unknown-linux-musl/marketplace.json> |
| Linux ARM64 | <https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-unknown-linux-musl/marketplace.json> |

On a Mac, **Apple menu → About This Mac** identifies the chip: an "Apple M1/M2/M3/M4" chip is Apple Silicon (row 2); a listing like "Intel Core…" is Intel (row 3). Other operating systems and architectures, including native Windows ARM64, are not supported.

Open the added marketplace, install **oh-my-zcode**, completely quit and relaunch ZCode, then start a **new session**. On macOS, use **ZCode → Quit ZCode** or **⌘Q**. On Windows, quit from the tray menu if closing the window leaves the app running.

If another copy is present, follow [updates and reinstalling](#updates-and-reinstalling) first. The live **3.0.0** marketplaces above are still named `oh-my-zcode-<target>`. Starting with the **next release**, every native marketplace and the universal marketplace use the publisher name **`unknoownu`**, matching the repository's development marketplace. Platform selection remains in the URL, not the marketplace name.

ZCode keys marketplaces by `name` in `known_marketplaces.json`: adding another source named `unknoownu` replaces that entry rather than adding a separate marketplace. The installed plugin identity stays `oh-my-zcode@unknoownu` across these sources. Keep exactly one source appropriate for your machine; older target-named or local marketplaces remain separate identities and can still leave duplicate installations.

The [download page](https://unknoownu.github.io/oh-my-zcode/) is a page for people. **Add marketplace needs a URL ending in `marketplace.json`**, not that HTML page, a directory URL, a GitHub release page, or a ZIP URL. An error starting with `Unexpected token '<'` means the supplied URL returned HTML instead of JSON.

## The universal package — one URL for every machine, from the next release

The universal package bundles five precompiled Rust executables behind a small launcher that selects the one for the running machine. It requires **Node.js 22 or newer** on `PATH` (`node --version`); no Rust toolchain or npm install is needed. It publishes with the **next release**, when it becomes the recommended install and adds the single marketplace URL `https://unknoownu.github.io/oh-my-zcode/marketplace.json` — which does not resolve today.

That URL and the stable `https://unknoownu.github.io/oh-my-zcode/latest/<target>/marketplace.json` aliases do **not** resolve on the published site today — use the versioned native URLs in the table above now. The universal launcher selects the architecture of the running Node process; use native Node to run natively on Apple Silicon.

## Manual installation and ZIP recovery

Download the **plugin ZIP** from the [download page](https://unknoownu.github.io/oh-my-zcode/), for the universal package or your native platform, and extract it. Its root must contain:

```text
oh-my-zcode/
  .zcode-plugin/plugin.json
  agents/
  commands/
  skills/
  hooks/hooks.json
  bin/
```

On macOS, **⌘⇧.** shows hidden folders such as `.zcode-plugin` in Finder. GitHub Release distribution ZIPs contain `marketplace.json`, `SHA256SUMS`, and a nested `plugins/oh-my-zcode/3.0.0/plugin.zip`. Extract that inner ZIP to obtain the plugin folder shown above. The download page links directly to the inner ZIP.

For a local marketplace, put the extracted `oh-my-zcode` folder beside a new `marketplace.json`, inside a folder such as `oh-my-zcode-local/`:

```json
{
  "name": "oh-my-zcode-local",
  "description": "Local Oh My Zcode installation",
  "owner": { "name": "UnknOownU" },
  "plugins": [{
    "name": "oh-my-zcode",
    "source": "./oh-my-zcode",
    "version": "3.0.0",
    "description": "Evidence-gated ZCode pipeline"
  }]
}
```

Use the version in the extracted `.zcode-plugin/plugin.json` if installing another release. In **Add marketplace**, select the enclosing `oh-my-zcode-local` folder containing this JSON, then install the listed plugin. The inner plugin folder alone is not a marketplace. Local installations need manual replacement for future updates.

Do not paste a ZIP URL into Add marketplace. If ZCode reports `git clone ...zip.git`, it has interpreted the input as a repository. Return to the JSON URL above. The repository checkout is for development; it does not contain the built native binaries.

## Updates and reinstalling

**Routine updates from a stable HTTPS marketplace:** refresh/update the existing marketplace in Plugins settings, update the installed plugin when a newer version is offered, then completely quit and relaunch ZCode and start a new session. Keep the same marketplace identity. The plugin's update notice does not download or install anything.

**Moving from an old identity or reinstalling a same-version package:** changing a marketplace name does not migrate an installed plugin, and an equal version does not trigger an update. When the next release becomes available, move from `oh-my-zcode@oh-my-zcode-<target>` (or a local identity) to `oh-my-zcode@unknoownu` with a clean reinstall:

1. Identify the existing `betterzcode` or `oh-my-zcode` installation and its marketplace in Plugins settings. Uninstall the old plugin before installing the replacement. If two copies exist, remove the unwanted one there.
2. Remove an obsolete marketplace only after uninstalling its plugin. Today, use the versioned native JSON URL for your platform above. From the next release, choose the stable universal JSON URL or the stable native JSON URL for your platform if you want to keep the no-Node package; both register as `unknoownu`.
3. Install one copy, fully restart ZCode, and start a new session. Confirm `/ohmy-plan`, `/ohmy-swarm`, and `/ohmy-research` are available and that the session received the pipeline doctrine.

After moving to `unknoownu`, switching between native and universal URLs replaces the registered source without creating another plugin identity; it does not replace already installed package files. Reinstall when switching package forms at the same version.

Uninstalling does not require deleting your project's `.oh-my-zcode/` evidence or plans. Do not delete it during duplicate cleanup. When diagnosing installation, inspect ZCode's `installed_plugins.json` and its recorded installation path rather than assuming every marketplace uses the `unknoownu` cache directory.

The official ZAI marketplace can offer this plugin only after its maintainers accept and publish it. A submitted pull request alone does not make it available there.

## Optional external servers

Native packages run the gates and scope server without Node; the universal package requires Node 22+ for its launcher. Other MCP servers remain separate tools:

- **Codegraph** requires Node and npm. From the installed plugin directory, run `npm --prefix vendor/codegraph ci --omit=dev --no-audit --no-fund`, then restart ZCode. Its dependency lockfile selects the package version and npm selects its platform dependency. No first-party hook runs npm or downloads tools.
- **Semgrep** requires the `semgrep` command on `PATH`.
- **OSV Scanner** requires the `osv-scanner` command on `PATH`.
- **grep.app** uses an external HTTP server.

An unavailable optional server does not prevent the bundled gates or scope server from running. The universal launcher's Node requirement is separate from these optional servers.

## Update notice

At session start the native binary compares the installed version against the [published marketplace](https://unknoownu.github.io/oh-my-zcode/marketplace.json) (that endpoint activates with the next release; today the request fails open and startup is unaffected): one anonymous GET, two-second timeout, `curl` on PATH, no project files, payload, or identifier. A newer version adds `UPDATE oh-my-zcode: <latest> available (installed <v>)` to the doctrine. Offline access, missing curl, or an invalid response does not prevent session startup.

The check writes its state to `~/.zcode/cli/plugins/data/oh-my-zcode@unknoownu/update-check.json` and runs at most once per 24 hours. Set `"disabled": true` in that JSON file to disable it. `OH_MY_ZCODE_UPDATE_URL` and `OH_MY_ZCODE_UPDATE_STATE` are test/configuration overrides. The universal launcher sets `ZCODE_PLUGIN_ROOT` to the actual installed root before starting the nested Rust executable.

The launcher runs only bundled local binaries. On macOS/Linux it restores the selected binary's owner-execute permission when an extractor has removed it. Permission failures are reported. It does not download binaries or elevate privileges.

The marketplace binds every ZIP to its SHA-256 checksum, which ZCode verifies before extraction. This repair replaces the current **3.0.0** distributions and removes the obsolete publication format. There is no compatibility layer or automatic migration of older installations.

The package format follows the [official ZCode verified ZIP distribution contract](https://github.com/zai-org/zcode-plugins/blob/cf739288297533abaa5eec9561bd1cb96e328532/docs/distribution.md).
