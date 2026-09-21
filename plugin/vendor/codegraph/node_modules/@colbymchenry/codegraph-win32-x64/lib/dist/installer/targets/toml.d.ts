/**
 * Tiny TOML helpers — just enough to inject / replace / remove a
 * single dotted-key table block (`[mcp_servers.codegraph]`) inside an
 * existing `~/.codex/config.toml`. We deliberately do NOT try to be a
 * general TOML parser/serializer; that would mean pulling in a
 * dependency (~50KB) for ~6 lines of output.
 *
 * Strategy: treat the file as text. Find the `[mcp_servers.codegraph]`
 * header line, splice it (and the lines that follow it until the next
 * `[...]` header or EOF) in or out. Everything outside that block is
 * preserved verbatim, byte-for-byte.
 *
 * Limitations (acceptable for our narrow use):
 *   - Only handles top-level table headers; not array-of-tables or
 *     subtables nested inside `[mcp_servers]` itself (we always write
 *     the full dotted key `[mcp_servers.codegraph]`).
 *   - Doesn't validate sibling TOML — if the file is malformed
 *     elsewhere, our injection won't fix it but won't make it worse.
 *   - Quotes string values with double quotes; escapes `\` and `"`.
 */
/**
 * Serialize a record into the body lines of a TOML table. Values
 * supported: string, string[]. Other types throw — the codex MCP
 * config only needs these two.
 */
export declare function serializeTomlTableBody(values: Record<string, string | string[]>): string;
/**
 * Build a full table block: header line + body. Suitable for direct
 * insertion into a TOML file.
 */
export declare function buildTomlTable(header: string, values: Record<string, string | string[]>): string;
/**
 * Insert or replace a top-level dotted-key TOML table block in the
 * given file content. Preserves all other content verbatim.
 *
 * Returns `'inserted'` when the table was newly added, `'replaced'`
 * when an existing one was rewritten, `'unchanged'` when the
 * existing block already matches `block` byte-for-byte.
 */
export declare function upsertTomlTable(fileContent: string, header: string, block: string): {
    content: string;
    action: 'inserted' | 'replaced' | 'unchanged';
};
/**
 * Remove a top-level dotted-key TOML table block. Returns the
 * possibly-empty new content + an action flag.
 */
export declare function removeTomlTable(fileContent: string, header: string): {
    content: string;
    action: 'removed' | 'not-found';
};
//# sourceMappingURL=toml.d.ts.map