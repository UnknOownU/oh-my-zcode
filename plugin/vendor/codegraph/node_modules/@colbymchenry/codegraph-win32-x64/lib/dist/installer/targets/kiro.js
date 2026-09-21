"use strict";
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
exports.kiroTarget = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const shared_1 = require("./shared");
function configDir(loc) {
    return loc === 'global'
        ? path.join(os.homedir(), '.kiro')
        : path.join(process.cwd(), '.kiro');
}
function mcpJsonPath(loc) {
    return path.join(configDir(loc), 'settings', 'mcp.json');
}
function steeringPath(loc) {
    return path.join(configDir(loc), 'steering', 'codegraph.md');
}
class KiroTarget {
    id = 'kiro';
    displayName = 'Kiro';
    docsUrl = 'https://kiro.dev/docs/cli/mcp/';
    supportsLocation(_loc) {
        return true;
    }
    detect(loc) {
        const file = mcpJsonPath(loc);
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
        // The steering doc is no longer written — the codegraph usage
        // guidance ships in the MCP server's `initialize` response (issue
        // #529). Delete a `codegraph.md` a previous install created so an
        // upgrade self-heals.
        const steeringCleanup = removeSteeringEntry(loc);
        if (steeringCleanup.action === 'removed')
            files.push(steeringCleanup);
        return {
            files,
            // The IDE-only enable-MCP step is load-bearing: Kiro IDE ships
            // with MCP support disabled by default, so even a valid
            // `~/.kiro/settings/mcp.json` at the documented path is ignored
            // until the user flips the toggle. Kiro CLI reads the same file
            // without a gate, so we call out which audience this applies to.
            notes: [
                'Restart Kiro for MCP changes to take effect.',
                'Kiro IDE: also enable MCP in Settings (search "MCP" → "Enabled"). Kiro CLI users can skip this step.',
            ],
        };
    }
    uninstall(loc) {
        const files = [];
        const file = mcpJsonPath(loc);
        const config = (0, shared_1.readJsonFile)(file);
        if (config.mcpServers?.codegraph) {
            delete config.mcpServers.codegraph;
            if (Object.keys(config.mcpServers).length === 0) {
                delete config.mcpServers;
            }
            (0, shared_1.writeJsonFile)(file, config);
            files.push({ path: file, action: 'removed' });
        }
        else {
            files.push({ path: file, action: 'not-found' });
        }
        files.push(removeSteeringEntry(loc));
        return { files };
    }
    printConfig(loc) {
        const target = mcpJsonPath(loc);
        const snippet = JSON.stringify({ mcpServers: { codegraph: (0, shared_1.getMcpServerConfig)() } }, null, 2);
        return `# Add to ${target}\n\n${snippet}\n`;
    }
    describePaths(loc) {
        return [mcpJsonPath(loc), steeringPath(loc)];
    }
}
function writeMcpEntry(loc) {
    const file = mcpJsonPath(loc);
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
 * Delete the steering file we own. If a user has hand-edited the file
 * out of recognition we still remove it — codegraph.md is a name we
 * claim, and a partial install leaving the file behind is worse than
 * a clean delete. Used by both install (self-heal on upgrade — see
 * issue #529) and uninstall.
 */
function removeSteeringEntry(loc) {
    const file = steeringPath(loc);
    if (!fs.existsSync(file))
        return { path: file, action: 'not-found' };
    try {
        fs.unlinkSync(file);
    }
    catch { /* ignore */ }
    return { path: file, action: 'removed' };
}
exports.kiroTarget = new KiroTarget();
//# sourceMappingURL=kiro.js.map