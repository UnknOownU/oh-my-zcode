/**
 * Helpers shared across `AgentTarget` implementations.
 *
 * Lifted from the original `config-writer.ts` so each target can
 * compose them without inheritance. Kept deliberately small — the
 * targets are different enough (JSON vs TOML vs Markdown, varying
 * idempotency markers) that a base class would force the awkward
 * shape onto everyone.
 */
/**
 * The MCP-server config block codegraph injects. Same shape across
 * all JSON-shaped agent configs (Claude, Cursor, opencode), only the
 * surrounding wrapper differs. Codex (TOML) builds its own block.
 */
export declare function getMcpServerConfig(): {
    type: string;
    command: string;
    args: string[];
};
/**
 * Permissions list for Claude `settings.json`. Other targets that
 * have a permissions concept can compose this list directly.
 *
 * One server-scoped wildcard rather than a per-tool list. By default only
 * `codegraph_explore` is even LISTED to the agent (see DEFAULT_MCP_TOOLS in
 * mcp/tools.ts), so in practice explore is the only tool this auto-approves —
 * but the wildcard means that if a user re-enables another tool via
 * CODEGRAPH_MCP_TOOLS, it's already pre-approved (no permission prompt, no
 * hand-editing settings.json), and future tools are covered too. Claude only
 * honors globs after a literal `mcp__<server>__` prefix, so this exact string
 * is the way to allow-all for one server; a bare `mcp__codegraph` or `*` is
 * ignored. The allowlist gates PROMPTING, not visibility, so a superset here
 * never makes a hidden tool appear.
 */
export declare function getCodeGraphPermissions(): string[];
/**
 * Read a JSON file, returning `{}` when missing or unparseable.
 *
 * Unparseable files are backed up to `<path>.backup` BEFORE we return
 * `{}` — so an idempotent re-run never silently deletes a user's
 * existing config that happened to break JSON parse temporarily.
 */
export declare function readJsonFile(filePath: string): Record<string, any>;
/**
 * Write a file atomically: write to `<path>.tmp.<pid>`, then rename.
 *
 * Prevents corruption if the process crashes mid-write. The temp
 * file is cleaned up on rename failure.
 */
export declare function atomicWriteFileSync(filePath: string, content: string): void;
/**
 * Atomic JSON write. Trailing newline matches the convention every
 * existing target had — preserves diff-friendly file shape.
 */
export declare function writeJsonFile(filePath: string, data: Record<string, any>): void;
/**
 * Compare two JSON values for deep equality, ignoring key order.
 *
 * Used for idempotency: when the on-disk config already exactly
 * matches what we'd write, return action=`unchanged` instead of
 * re-writing (and emitting a confusing "Updated" log line).
 */
export declare function jsonDeepEqual(a: unknown, b: unknown): boolean;
/**
 * Replace or append a marker-delimited section in a markdown-ish file.
 *
 * Used by Claude / Codex for the `<!-- CODEGRAPH_START --> ... <!--
 * CODEGRAPH_END -->` block. Preserves all content outside the
 * markers verbatim.
 *
 * Returns `created` when the file didn't exist; `updated` when
 * markers were found and content swapped; `appended` when markers
 * weren't found and section was added at end. `unchanged` when the
 * existing block already matches `body`.
 */
export declare function replaceOrAppendMarkedSection(filePath: string, body: string, startMarker: string, endMarker: string): 'created' | 'updated' | 'appended' | 'unchanged';
/**
 * Upsert the CodeGraph instructions block into an agent instructions
 * file (CLAUDE.md / AGENTS.md / GEMINI.md). The one write shared by
 * every target: self-heals a stale pre-#529 long block (markers match →
 * replaced by the current short one), appends after existing user
 * content otherwise, and reports `unchanged` on byte-equal re-runs so
 * install stays idempotent. See `instructions-template.ts` for why this
 * block exists (#704: subagents + non-MCP harnesses never see the MCP
 * initialize instructions).
 */
export declare function upsertInstructionsEntry(file: string): {
    path: string;
    action: 'created' | 'updated' | 'unchanged';
};
/**
 * Inverse of `replaceOrAppendMarkedSection`. Strips the marker
 * block from `filePath` if present. If the file becomes empty after
 * removal, deletes the file entirely (matches the existing Claude
 * uninstall behavior).
 *
 * Returns `removed` when content was stripped, `not-found` when
 * the markers weren't present, `kept` when the file didn't exist.
 */
export declare function removeMarkedSection(filePath: string, startMarker: string, endMarker: string): 'removed' | 'not-found' | 'kept';
//# sourceMappingURL=shared.d.ts.map