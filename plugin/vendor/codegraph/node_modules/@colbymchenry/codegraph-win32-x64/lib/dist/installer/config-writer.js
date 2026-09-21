"use strict";
/**
 * Backwards-compat shim — original Claude-only writer functions.
 *
 * The installer now uses the multi-target architecture in
 * `./targets/`. This file is preserved so existing imports (the test
 * suite, downstream tooling) keep working unchanged. Each function
 * delegates to the Claude target. New code should import the target
 * registry from `./targets/registry` directly.
 *
 * @deprecated Use `targets/registry.ts` and the `AgentTarget`
 *   abstraction instead.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeMcpConfig = writeMcpConfig;
exports.writePermissions = writePermissions;
exports.hasMcpConfig = hasMcpConfig;
exports.hasPermissions = hasPermissions;
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const claude_1 = require("./targets/claude");
const shared_1 = require("./targets/shared");
/**
 * Each shim calls ONLY the named per-file helper — writeMcpConfig
 * writes only the MCP JSON, writePermissions only settings.json. The
 * full multi-file install lives in `claudeTarget.install()` which the
 * new orchestrator uses.
 *
 * There is no `writeClaudeMd` shim anymore: codegraph stopped writing a
 * CLAUDE.md instructions block (issue #529) now that the MCP server's
 * `initialize` instructions are the single source of truth.
 */
function writeMcpConfig(location) {
    (0, claude_1.writeMcpEntry)(location);
}
function writePermissions(location) {
    (0, claude_1.writePermissionsEntry)(location);
}
function hasMcpConfig(location) {
    // local scope lives in ./.mcp.json (project scope); global is the
    // user-scope ~/.claude.json. Mirrors the Claude target's paths.
    const file = location === 'global'
        ? path.join(os.homedir(), '.claude.json')
        : path.join(process.cwd(), '.mcp.json');
    const config = (0, shared_1.readJsonFile)(file);
    return !!config.mcpServers?.codegraph;
}
function hasPermissions(location) {
    const file = location === 'global'
        ? path.join(os.homedir(), '.claude', 'settings.json')
        : path.join(process.cwd(), '.claude', 'settings.json');
    const settings = (0, shared_1.readJsonFile)(file);
    const allow = settings.permissions?.allow;
    if (!Array.isArray(allow))
        return false;
    return allow.some((p) => p.startsWith('mcp__codegraph__'));
}
//# sourceMappingURL=config-writer.js.map