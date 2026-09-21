/**
 * Kiro CLI / IDE target. Writes:
 *
 *   - MCP server entry to `~/.kiro/settings/mcp.json` (global) or
 *     `./.kiro/settings/mcp.json` (local). Standard `mcpServers.codegraph`
 *     shape, same as Claude / Cursor / Gemini.
 *   - Instructions to `~/.kiro/steering/codegraph.md` (global) or
 *     `./.kiro/steering/codegraph.md` (local). Kiro's "steering" system
 *     loads every `*.md` file in the steering dir as agent context, so
 *     a dedicated `codegraph.md` is the natural surface — we own the
 *     whole file outright (no marker-based merging needed) and delete
 *     it on uninstall.
 *
 * No permissions concept — Kiro gates tool invocations through its own
 * UI prompts rather than an external allowlist. `autoAllow` is silently
 * ignored.
 *
 * Paths are identical on macOS / Linux / Windows because Kiro resolves
 * its config root from `os.homedir()` on all three (Windows `~` →
 * `%USERPROFILE%\.kiro`).
 *
 * Docs: https://kiro.dev/docs/cli/mcp/
 *       https://kiro.dev/docs/cli/steering/
 */
import { AgentTarget } from './types';
export declare const kiroTarget: AgentTarget;
//# sourceMappingURL=kiro.d.ts.map