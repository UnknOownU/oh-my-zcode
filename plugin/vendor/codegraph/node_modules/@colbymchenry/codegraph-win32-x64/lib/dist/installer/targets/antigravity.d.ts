/**
 * Google Antigravity IDE target. Antigravity is Google's VS Code-derived
 * multi-agent IDE; the Gemini CLI is in the process of consolidating with
 * it under a single agent platform. Antigravity reads MCP server
 * definitions from a separate config file from the CLI.
 *
 * ## Config path: unified vs legacy
 *
 * Antigravity recently migrated to a **unified** MCP config path shared
 * across all Antigravity tools:
 *
 *   - **Unified** (post-migration, current): `~/.gemini/config/mcp_config.json`
 *     — signalled by the `~/.gemini/config/.migrated` marker file.
 *   - **Legacy** (pre-migration): `~/.gemini/antigravity/mcp_config.json`
 *     — what the github-mcp-server install guide still documents.
 *
 * We detect the marker at install time and write to the right path. On
 * uninstall we sweep BOTH — so a user who installed on the legacy path,
 * was then auto-migrated by Antigravity, and re-ran `codegraph install`
 * doesn't end up with stale codegraph entries in two files.
 *
 * ## Entry shape: no `type: stdio` field
 *
 * Antigravity rejects MCP entries that carry the `type: "stdio"` field
 * the rest of our targets use — the working entries it manages itself
 * (e.g. `code-review-graph`) omit it, and dropping it was load-bearing
 * to get codegraph to appear in the Customizations UI. We build the
 * entry locally instead of routing through `getMcpServerConfig()`.
 *
 * ## macOS GUI app PATH resolution
 *
 * Antigravity is a GUI Electron app. macOS gives Dock/Finder-launched
 * apps a stripped PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) — nvm-managed
 * tools live outside that, so a bare `codegraph` command fails to spawn
 * even when `which codegraph` resolves in the user's shell. We resolve
 * `codegraph` to its absolute path on macOS at install time. (Linux GUI
 * apps inherit user PATH; Windows uses `PATH` env directly — both are
 * fine with the bare command.)
 *
 * ## Shared instructions (no GEMINI.md from here)
 *
 * The IDE shares `~/.gemini/GEMINI.md` with Gemini CLI for instructions
 * — written by the `./gemini.ts` target. We deliberately don't touch it
 * here so uninstalling Antigravity without uninstalling Gemini CLI
 * leaves CLI instructions intact. Users who install only Antigravity
 * still get a working MCP integration; the prefer-codegraph-over-grep
 * guidance just won't be present unless they also install the gemini
 * target.
 *
 * ## Location
 *
 * `supportsLocation('local')` returns false — Antigravity has no
 * project-scoped config concept as of 2026-05.
 */
import { AgentTarget } from './types';
export declare const antigravityTarget: AgentTarget;
//# sourceMappingURL=antigravity.d.ts.map