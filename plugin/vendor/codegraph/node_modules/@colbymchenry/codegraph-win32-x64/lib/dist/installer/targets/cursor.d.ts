/**
 * Cursor target.
 *
 *   - MCP server entry to `~/.cursor/mcp.json` (global) or
 *     `./.cursor/mcp.json` (local). Same `{mcpServers: {...}}` shape
 *     as Claude.
 *   - Instructions to `./.cursor/rules/codegraph.mdc` (project-local
 *     ONLY). Cursor's rules system is a project-scoped surface;
 *     global cursor rules aren't a stable convention as of 2026-05.
 *     For `--location=global`, only mcp.json is written.
 *
 * ## Why we hardcode `--path` for Cursor
 *
 * Cursor launches MCP-server subprocesses with a working directory
 * that ISN'T the workspace root AND doesn't pass `rootUri` /
 * `workspaceFolders` in the MCP initialize call. The codegraph MCP
 * server's `process.cwd()` fallback therefore misses the workspace's
 * `.codegraph/` and reports "not initialized" on every tool call.
 *
 * So we inject `--path` into the args ourselves:
 *
 *   - `local`  install: absolute path (we know it at install time).
 *   - `global` install: `${workspaceFolder}` — Cursor expands this to
 *     the open workspace's root, giving us per-workspace behavior
 *     from a single global config.
 *
 * Codex and Claude do not need this — they launch MCP servers with
 * `cwd = workspace` and pass `rootUri`, respectively.
 *
 * No permissions concept — Cursor doesn't have an auto-allow list
 * the installer can populate. `autoAllow` is silently ignored.
 */
import { AgentTarget } from './types';
export declare const cursorTarget: AgentTarget;
//# sourceMappingURL=cursor.d.ts.map