"use strict";
/**
 * Agent target abstraction for the installer.
 *
 * Each MCP-capable agent (Claude Code, Cursor, Codex CLI, opencode, ...)
 * implements this interface so the installer orchestrator can write the
 * right MCP-server config + instructions file + permissions for that
 * agent without baking client-specific paths into core code. Adding a
 * new agent = one new file in `targets/` + one entry in `registry.ts`.
 *
 * Closes the Claude-locked installer issue (upstream #137). The
 * runtime MCP server is already agent-agnostic; this brings the
 * installer to the same surface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map