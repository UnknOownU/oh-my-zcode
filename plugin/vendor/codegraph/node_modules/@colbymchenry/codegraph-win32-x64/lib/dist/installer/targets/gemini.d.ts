/**
 * Gemini CLI target (also covers the rebranded "Antigravity CLI" —
 * Google is in the middle of unifying its CLI tools under
 * Antigravity, and the new CLI continues to read `~/.gemini/settings.json`
 * + project-local `.gemini/settings.json`). Writes:
 *
 *   - MCP server entry to `~/.gemini/settings.json` (global) or
 *     `./.gemini/settings.json` (local) under the standard
 *     `mcpServers.codegraph` key. Same shape as Claude / Cursor.
 *   - Instructions to `~/.gemini/GEMINI.md` (global) or `./GEMINI.md`
 *     (local — Gemini reads the project root file directly, not
 *     under `.gemini/`).
 *
 * No permissions concept — Gemini CLI gates tool invocations through
 * the `trust` field per server, not an external allowlist. We leave
 * `trust` unset so the user controls confirmation prompts.
 *
 * The Antigravity IDE shares `~/.gemini/GEMINI.md` for instructions
 * but uses a separate MCP config file (`~/.gemini/antigravity/mcp_config.json`)
 * — see `./antigravity.ts`. Both targets writing to GEMINI.md is
 * safe: the marker-based section replacement makes the second write
 * a byte-identical no-op.
 */
import { AgentTarget } from './types';
export declare const geminiTarget: AgentTarget;
//# sourceMappingURL=gemini.d.ts.map