"use strict";
/**
 * OpenAI Codex CLI target.
 *
 *   - MCP server entry to `~/.codex/config.toml` as the dotted-key
 *     table `[mcp_servers.codegraph]`. TOML — not JSON — handled by
 *     the narrow serializer in `./toml.ts`.
 *   - Instructions to `~/.codex/AGENTS.md`.
 *
 * Codex CLI as of 2026-05 has no project-local config concept —
 * everything lives under `~/.codex/`. `supportsLocation('local')`
 * returns false; the orchestrator skips Codex when the user picks
 * the local install location.
 *
 * No permissions concept.
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
exports.codexTarget = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const shared_1 = require("./shared");
const instructions_template_1 = require("../instructions-template");
const toml_1 = require("./toml");
const TOML_HEADER = 'mcp_servers.codegraph';
function configDir() {
    return path.join(os.homedir(), '.codex');
}
function tomlConfigPath() {
    return path.join(configDir(), 'config.toml');
}
function instructionsPath() {
    return path.join(configDir(), 'AGENTS.md');
}
class CodexTarget {
    id = 'codex';
    displayName = 'Codex CLI';
    docsUrl = 'https://github.com/openai/codex';
    supportsLocation(loc) {
        return loc === 'global';
    }
    detect(loc) {
        if (loc !== 'global') {
            return { installed: false, alreadyConfigured: false };
        }
        const tomlPath = tomlConfigPath();
        let alreadyConfigured = false;
        if (fs.existsSync(tomlPath)) {
            try {
                const content = fs.readFileSync(tomlPath, 'utf-8');
                alreadyConfigured = content.includes(`[${TOML_HEADER}]`);
            }
            catch { /* ignore */ }
        }
        const installed = fs.existsSync(configDir());
        return { installed, alreadyConfigured, configPath: tomlPath };
    }
    install(loc, _opts) {
        if (loc !== 'global') {
            return {
                files: [],
                notes: ['Codex CLI has no project-local config — re-run with --location=global to install.'],
            };
        }
        const files = [];
        files.push(writeMcpEntry());
        // AGENTS.md gets the short marker-fenced CodeGraph block (#704):
        // subagents and non-MCP harnesses read AGENTS.md but never the MCP
        // initialize instructions. Upsert self-heals a stale pre-#529 block.
        files.push((0, shared_1.upsertInstructionsEntry)(instructionsPath()));
        return { files };
    }
    uninstall(loc) {
        if (loc !== 'global')
            return { files: [] };
        const files = [];
        const tomlPath = tomlConfigPath();
        if (fs.existsSync(tomlPath)) {
            const content = fs.readFileSync(tomlPath, 'utf-8');
            const { content: nextContent, action } = (0, toml_1.removeTomlTable)(content, TOML_HEADER);
            if (action === 'removed') {
                if (nextContent.trim() === '') {
                    try {
                        fs.unlinkSync(tomlPath);
                    }
                    catch { /* ignore */ }
                }
                else {
                    (0, shared_1.atomicWriteFileSync)(tomlPath, nextContent.trimEnd() + '\n');
                }
                files.push({ path: tomlPath, action: 'removed' });
            }
            else {
                files.push({ path: tomlPath, action: 'not-found' });
            }
        }
        else {
            files.push({ path: tomlPath, action: 'not-found' });
        }
        files.push(removeInstructionsEntry());
        return { files };
    }
    printConfig(loc) {
        if (loc !== 'global') {
            return '# Codex CLI has no project-local config — use --location=global.\n';
        }
        const block = buildCodegraphBlock();
        return `# Add to ${tomlConfigPath()}\n\n${block}\n`;
    }
    describePaths(loc) {
        if (loc !== 'global')
            return [];
        return [tomlConfigPath(), instructionsPath()];
    }
}
function buildCodegraphBlock() {
    const mcp = (0, shared_1.getMcpServerConfig)();
    return (0, toml_1.buildTomlTable)(TOML_HEADER, {
        command: mcp.command,
        args: mcp.args,
    });
}
function writeMcpEntry() {
    const file = tomlConfigPath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    const block = buildCodegraphBlock();
    // Single read — `existing === ''` derives both "is the file empty
    // or absent" and "what was its content," avoiding a TOCTOU window
    // between two `fs.existsSync` calls.
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    const created = existing.length === 0;
    const { content: nextContent, action } = (0, toml_1.upsertTomlTable)(existing, TOML_HEADER, block);
    if (action === 'unchanged') {
        return { path: file, action: 'unchanged' };
    }
    (0, shared_1.atomicWriteFileSync)(file, nextContent);
    return { path: file, action: created ? 'created' : 'updated' };
}
/**
 * Strip the marker-delimited CodeGraph block from `~/.codex/AGENTS.md`
 * if a prior install wrote one. Used by both install (self-heal on
 * upgrade) and uninstall — see issue #529.
 */
function removeInstructionsEntry() {
    const file = instructionsPath();
    const action = (0, shared_1.removeMarkedSection)(file, instructions_template_1.CODEGRAPH_SECTION_START, instructions_template_1.CODEGRAPH_SECTION_END);
    return { path: file, action };
}
exports.codexTarget = new CodexTarget();
//# sourceMappingURL=codex.js.map