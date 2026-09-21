/**
 * Claude Code target. Writes:
 *
 *   - MCP server entry to `~/.claude.json` (global = user scope, loads
 *     in every project) or `./.mcp.json` (local = project scope, the
 *     file Claude Code actually reads for a single project). See the
 *     scope table at https://code.claude.com/docs/en/mcp.
 *   - Permissions to `~/.claude/settings.json` (global) or
 *     `./.claude/settings.json` (local), gated on `autoAllow`.
 *   - Instructions to `~/.claude/CLAUDE.md` (global) or
 *     `./.claude/CLAUDE.md` (local).
 *
 * Earlier versions wrote the local MCP entry to `./.claude.json` — a
 * file Claude Code never reads — so the server silently never loaded
 * until the user manually renamed it to `.mcp.json` (issue #207). We
 * now write `./.mcp.json` and migrate any stale `./.claude.json` entry
 * out of the way on install and uninstall.
 */
import { AgentTarget, Location, WriteResult } from './types';
/**
 * Per-file write helpers, exported so the legacy `config-writer.ts`
 * shim can call only the named operation (writeMcpConfig writes ONLY
 * the MCP entry, etc.) instead of `claudeTarget.install()` which
 * writes all three files. Without this split the shims silently
 * cause side effects callers don't expect.
 */
export declare function writeMcpEntry(loc: Location): WriteResult['files'][number];
/**
 * Remove stale codegraph auto-sync hooks (`mark-dirty` / `sync-if-dirty`) that a
 * pre-0.8 install wrote. Exported for direct unit-testing; reused by both
 * `install` (an upgrade self-heals) and `uninstall`.
 */
export declare function cleanupLegacyHooks(loc: Location): WriteResult['files'][number];
/**
 * Remove the front-load `UserPromptSubmit` hook this installer writes (see
 * writePromptHookEntry). Used by `uninstall`, and by `install` when the user
 * opts out, so the choice round-trips.
 */
export declare function removePromptHookEntry(loc: Location): WriteResult['files'][number];
export declare function writePermissionsEntry(loc: Location): WriteResult['files'][number];
/**
 * Write the front-load `UserPromptSubmit` hook into Claude `settings.json` —
 * a `command` hook that runs `codegraph prompt-hook`, which injects
 * codegraph_explore context for structural prompts so the agent reliably uses
 * the graph. Idempotent: if our command is already wired under UserPromptSubmit
 * the file is left byte-for-byte untouched and reported `unchanged`. Sibling
 * hooks (the user's own, or other events) are preserved. Opt-in — the installer
 * only calls this when the user accepts the prompt (default-yes).
 */
export declare function writePromptHookEntry(loc: Location): WriteResult['files'][number];
/**
 * Strip the marker-delimited CodeGraph block from CLAUDE.md if a prior
 * install wrote one. Codegraph no longer maintains an instructions file
 * (issue #529) — the MCP server's `initialize` instructions are the
 * single source of truth — so both install (self-heal on upgrade) and
 * uninstall call this. `removeMarkedSection` returns `not-found`/`kept`
 * when there's nothing to strip; the install caller drops those from
 * the report so a fresh install stays quiet.
 */
export declare function removeInstructionsEntry(loc: Location): WriteResult['files'][number];
export declare const claudeTarget: AgentTarget;
//# sourceMappingURL=claude.d.ts.map