/**
 * opencode target.
 *
 *   - MCP server entry to `~/.config/opencode/opencode.jsonc` (global,
 *     XDG-style on EVERY platform, Windows included — see below) or
 *     `./opencode.jsonc` (local). Falls back to `opencode.json` when a
 *     `.json` file already exists; defaults new installs to `.jsonc`
 *     because that's what opencode itself creates on first run.
 *
 *     opencode resolves its config dir with the `xdg-basedir` package
 *     (sst/opencode `packages/core/src/global.ts`): `XDG_CONFIG_HOME`
 *     if set, else `~/.config` — unconditionally, on all platforms. It
 *     never reads `%APPDATA%`; that layout belonged to the discontinued
 *     Go fork. We previously wrote there on Windows, so opencode never
 *     saw the entry (#535) — install/uninstall now also sweep a stale
 *     codegraph entry out of the legacy `%APPDATA%/opencode` location.
 *   - Instructions to `~/.config/opencode/AGENTS.md` (global) or
 *     `./AGENTS.md` (local). opencode reads AGENTS.md for agent
 *     instructions — same convention Codex CLI uses.
 *   - No permissions concept.
 *
 * Config shape uses opencode's wrapper:
 *   {
 *     "$schema": "https://opencode.ai/config.json",
 *     "mcp": { "codegraph": { "type": "local", "command": [...], "enabled": true } }
 *   }
 *
 * The shape differs from Claude/Cursor — opencode uses `mcp.<name>`
 * (not `mcpServers`), takes `command` as a string array combining
 * binary + args, and includes an explicit `enabled` flag.
 *
 * Reads + writes go through `jsonc-parser` so any `//` and `/* *\/`
 * comments the user has added to their `.jsonc` survive idempotent
 * re-runs.
 */
import { AgentTarget } from './types';
export declare const opencodeTarget: AgentTarget;
//# sourceMappingURL=opencode.d.ts.map