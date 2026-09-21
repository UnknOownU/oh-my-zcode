"use strict";
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
exports.geminiTarget = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const shared_1 = require("./shared");
const instructions_template_1 = require("../instructions-template");
function configDir(loc) {
    return loc === 'global'
        ? path.join(os.homedir(), '.gemini')
        : path.join(process.cwd(), '.gemini');
}
function settingsJsonPath(loc) {
    return path.join(configDir(loc), 'settings.json');
}
function instructionsPath(loc) {
    // Global GEMINI.md lives under ~/.gemini/; project-local GEMINI.md
    // lives at the project root (NOT under .gemini/), matching how
    // Gemini CLI's hierarchical context loader searches.
    return loc === 'global'
        ? path.join(configDir('global'), 'GEMINI.md')
        : path.join(process.cwd(), 'GEMINI.md');
}
class GeminiTarget {
    id = 'gemini';
    displayName = 'Gemini CLI';
    docsUrl = 'https://geminicli.com/docs/tools/mcp-server/';
    supportsLocation(_loc) {
        return true;
    }
    detect(loc) {
        const file = settingsJsonPath(loc);
        const config = (0, shared_1.readJsonFile)(file);
        const alreadyConfigured = !!config.mcpServers?.codegraph;
        const installed = loc === 'global'
            ? fs.existsSync(configDir('global')) || fs.existsSync(file)
            : fs.existsSync(file) || fs.existsSync(configDir('local'));
        return { installed, alreadyConfigured, configPath: file };
    }
    install(loc, _opts) {
        const files = [];
        files.push(writeMcpEntry(loc));
        // GEMINI.md gets the short marker-fenced CodeGraph block (#704):
        // subagents and non-MCP harnesses read GEMINI.md but never the MCP
        // initialize instructions. Upsert self-heals a stale pre-#529 block.
        files.push((0, shared_1.upsertInstructionsEntry)(instructionsPath(loc)));
        return { files };
    }
    uninstall(loc) {
        const files = [];
        const file = settingsJsonPath(loc);
        const config = (0, shared_1.readJsonFile)(file);
        if (config.mcpServers?.codegraph) {
            delete config.mcpServers.codegraph;
            if (Object.keys(config.mcpServers).length === 0) {
                delete config.mcpServers;
            }
            // If the file is now an empty `{}` we still leave it — other
            // (top-level) Gemini settings the user might add later can
            // share the file; deleting it would be surprising.
            (0, shared_1.writeJsonFile)(file, config);
            files.push({ path: file, action: 'removed' });
        }
        else {
            files.push({ path: file, action: 'not-found' });
        }
        files.push(removeInstructionsEntry(loc));
        return { files };
    }
    printConfig(loc) {
        const target = settingsJsonPath(loc);
        const snippet = JSON.stringify({ mcpServers: { codegraph: (0, shared_1.getMcpServerConfig)() } }, null, 2);
        return `# Add to ${target}\n\n${snippet}\n`;
    }
    describePaths(loc) {
        return [settingsJsonPath(loc), instructionsPath(loc)];
    }
}
function writeMcpEntry(loc) {
    const file = settingsJsonPath(loc);
    const dir = path.dirname(file);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    const existing = (0, shared_1.readJsonFile)(file);
    const before = existing.mcpServers?.codegraph;
    const after = (0, shared_1.getMcpServerConfig)();
    if ((0, shared_1.jsonDeepEqual)(before, after)) {
        return { path: file, action: 'unchanged' };
    }
    const action = before ? 'updated' : (fs.existsSync(file) ? 'updated' : 'created');
    if (!existing.mcpServers)
        existing.mcpServers = {};
    existing.mcpServers.codegraph = after;
    (0, shared_1.writeJsonFile)(file, existing);
    return { path: file, action };
}
/**
 * Strip the marker-delimited CodeGraph block from GEMINI.md if a prior
 * install wrote one. Used by both install (self-heal on upgrade) and
 * uninstall — see issue #529.
 */
function removeInstructionsEntry(loc) {
    const file = instructionsPath(loc);
    const action = (0, shared_1.removeMarkedSection)(file, instructions_template_1.CODEGRAPH_SECTION_START, instructions_template_1.CODEGRAPH_SECTION_END);
    return { path: file, action };
}
exports.geminiTarget = new GeminiTarget();
//# sourceMappingURL=gemini.js.map