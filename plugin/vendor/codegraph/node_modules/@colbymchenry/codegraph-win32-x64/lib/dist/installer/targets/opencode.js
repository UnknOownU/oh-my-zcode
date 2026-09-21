"use strict";
/**
 * opencode target.
 *
 *   - MCP server entry to `~/.config/opencode/opencode.jsonc` (global,
 *     XDG-style on EVERY platform, Windows included — see below) or
 *     `./opencode.jsonc` (local). Falls back to `opencode.json` when a
 *     `.json` file already exists; defaults new installs to `.jsonc`
 *     because that's what opencode itself creates on first run.
 *
 *     opencode resolves its config dir with the `xdg-basedir` package
 *     (sst/opencode `packages/core/src/global.ts`): `XDG_CONFIG_HOME`
 *     if set, else `~/.config` — unconditionally, on all platforms. It
 *     never reads `%APPDATA%`; that layout belonged to the discontinued
 *     Go fork. We previously wrote there on Windows, so opencode never
 *     saw the entry (#535) — install/uninstall now also sweep a stale
 *     codegraph entry out of the legacy `%APPDATA%/opencode` location.
 *   - Instructions to `~/.config/opencode/AGENTS.md` (global) or
 *     `./AGENTS.md` (local). opencode reads AGENTS.md for agent
 *     instructions — same convention Codex CLI uses.
 *   - No permissions concept.
 *
 * Config shape uses opencode's wrapper:
 *   {
 *     "$schema": "https://opencode.ai/config.json",
 *     "mcp": { "codegraph": { "type": "local", "command": [...], "enabled": true } }
 *   }
 *
 * The shape differs from Claude/Cursor — opencode uses `mcp.<name>`
 * (not `mcpServers`), takes `command` as a string array combining
 * binary + args, and includes an explicit `enabled` flag.
 *
 * Reads + writes go through `jsonc-parser` so any `//` and `/* *\/`
 * comments the user has added to their `.jsonc` survive idempotent
 * re-runs.
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
exports.opencodeTarget = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const jsonc_parser_1 = require("jsonc-parser");
const shared_1 = require("./shared");
const instructions_template_1 = require("../instructions-template");
function globalConfigDir() {
    // XDG_CONFIG_HOME if set, else ~/.config — on every platform, matching
    // opencode's own `xdg-basedir` resolution (no Windows special case; #535).
    const xdg = process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim().length > 0
        ? process.env.XDG_CONFIG_HOME
        : path.join(os.homedir(), '.config');
    return path.join(xdg, 'opencode');
}
/**
 * Pre-#535 installs wrote the global entry to `%APPDATA%/opencode` — a dir
 * today's opencode never reads. Returns that legacy dir when it could hold
 * stale state (APPDATA set and resolving somewhere other than the real config
 * dir). Gated on the env var rather than `process.platform` so the cleanup
 * logic runs under the cross-platform test suite; on POSIX, APPDATA is unset
 * in real life and this is a no-op.
 */
function legacyWindowsConfigDir() {
    const appData = process.env.APPDATA;
    if (!appData || !appData.trim())
        return null;
    const legacy = path.join(appData, 'opencode');
    return path.resolve(legacy) === path.resolve(globalConfigDir()) ? null : legacy;
}
function configBaseDir(loc) {
    return loc === 'global' ? globalConfigDir() : process.cwd();
}
// Pick existing .jsonc, then .json, default to .jsonc for new files.
// opencode auto-creates .jsonc on first run, so that's the dominant
// real-world case and the sensible default for greenfield installs.
function configPath(loc) {
    const dir = configBaseDir(loc);
    const jsonc = path.join(dir, 'opencode.jsonc');
    const json = path.join(dir, 'opencode.json');
    if (fs.existsSync(jsonc))
        return jsonc;
    if (fs.existsSync(json))
        return json;
    return jsonc;
}
function instructionsPath(loc) {
    return path.join(configBaseDir(loc), 'AGENTS.md');
}
function readConfigText(file) {
    if (!fs.existsSync(file))
        return '';
    return fs.readFileSync(file, 'utf-8');
}
function parseConfig(text) {
    if (!text.trim())
        return {};
    const errors = [];
    const result = (0, jsonc_parser_1.parse)(text, errors, { allowTrailingComma: true });
    if (result == null || typeof result !== 'object' || Array.isArray(result)) {
        return {};
    }
    return result;
}
function getOpencodeServerEntry() {
    return {
        type: 'local',
        command: ['codegraph', 'serve', '--mcp'],
        enabled: true,
    };
}
const FORMATTING = { tabSize: 2, insertSpaces: true, eol: '\n' };
class OpencodeTarget {
    id = 'opencode';
    displayName = 'opencode';
    docsUrl = 'https://opencode.ai/docs/config';
    supportsLocation(_loc) {
        return true;
    }
    detect(loc) {
        const file = configPath(loc);
        const config = parseConfig(readConfigText(file));
        const alreadyConfigured = !!config.mcp?.codegraph;
        // Global: the XDG dir is what current opencode creates on first run; the
        // legacy %APPDATA% dir still counts as "opencode present" so a re-install
        // can sweep the stale pre-#535 entry out of it.
        const legacy = legacyWindowsConfigDir();
        const installed = loc === 'global'
            ? fs.existsSync(globalConfigDir()) || (!!legacy && fs.existsSync(legacy))
            : fs.existsSync(file);
        return { installed, alreadyConfigured, configPath: file };
    }
    install(loc, _opts) {
        const files = [];
        files.push(writeMcpEntry(loc));
        // AGENTS.md gets the short marker-fenced CodeGraph block (#704):
        // subagents and non-MCP harnesses read AGENTS.md but never the MCP
        // initialize instructions. Upsert self-heals a stale pre-#529 block.
        files.push((0, shared_1.upsertInstructionsEntry)(instructionsPath(loc)));
        // Self-heal a pre-#535 install that wrote to %APPDATA%/opencode —
        // opencode never reads it, so anything of ours there is stale.
        if (loc === 'global')
            files.push(...cleanupLegacyWindowsState());
        return { files };
    }
    uninstall(loc) {
        const files = [];
        files.push(removeMcpEntryAt(configPath(loc)));
        files.push(removeInstructionsEntry(loc));
        if (loc === 'global')
            files.push(...cleanupLegacyWindowsState());
        return { files };
    }
    printConfig(loc) {
        const target = configPath(loc);
        const snippet = JSON.stringify({
            $schema: 'https://opencode.ai/config.json',
            mcp: { codegraph: getOpencodeServerEntry() },
        }, null, 2);
        return `# Add to ${target}\n\n${snippet}\n`;
    }
    describePaths(loc) {
        return [configPath(loc), instructionsPath(loc)];
    }
}
function writeMcpEntry(loc) {
    const file = configPath(loc);
    const existed = fs.existsSync(file);
    let text = readConfigText(file);
    // Seed a minimal opencode config when the file is brand-new so
    // the result is a complete, schema-tagged file (not just a bare
    // `{ "mcp": {...} }`).
    if (!text.trim()) {
        text = '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
    }
    const config = parseConfig(text);
    const before = config.mcp?.codegraph;
    const after = getOpencodeServerEntry();
    if ((0, shared_1.jsonDeepEqual)(before, after)) {
        return { path: file, action: 'unchanged' };
    }
    // Add $schema if the user's existing file is missing it.
    if (!config.$schema) {
        const schemaEdits = (0, jsonc_parser_1.modify)(text, ['$schema'], 'https://opencode.ai/config.json', {
            formattingOptions: FORMATTING,
        });
        text = (0, jsonc_parser_1.applyEdits)(text, schemaEdits);
    }
    // Surgical edit — preserves comments, formatting, and order of
    // every key we don't touch.
    const edits = (0, jsonc_parser_1.modify)(text, ['mcp', 'codegraph'], after, {
        formattingOptions: FORMATTING,
    });
    const updated = (0, jsonc_parser_1.applyEdits)(text, edits);
    (0, shared_1.atomicWriteFileSync)(file, updated);
    return { path: file, action: existed ? 'updated' : 'created' };
}
/**
 * Surgically drop `mcp.codegraph` from one config file. Leaves sibling
 * servers, comments, and formatting untouched; drops an emptied `mcp`
 * wrapper too. Shared by uninstall and the legacy-%APPDATA% sweep.
 */
function removeMcpEntryAt(file) {
    if (!fs.existsSync(file))
        return { path: file, action: 'not-found' };
    const text = readConfigText(file);
    const config = parseConfig(text);
    if (!config.mcp?.codegraph)
        return { path: file, action: 'not-found' };
    let edits = (0, jsonc_parser_1.modify)(text, ['mcp', 'codegraph'], undefined, {
        formattingOptions: FORMATTING,
    });
    let updated = (0, jsonc_parser_1.applyEdits)(text, edits);
    // If `mcp` is now an empty object, drop the wrapper too.
    const afterParsed = parseConfig(updated);
    if (afterParsed.mcp && typeof afterParsed.mcp === 'object' &&
        Object.keys(afterParsed.mcp).length === 0) {
        edits = (0, jsonc_parser_1.modify)(updated, ['mcp'], undefined, { formattingOptions: FORMATTING });
        updated = (0, jsonc_parser_1.applyEdits)(updated, edits);
    }
    (0, shared_1.atomicWriteFileSync)(file, updated);
    return { path: file, action: 'removed' };
}
/**
 * Remove whatever a pre-#535 install left in `%APPDATA%/opencode` — an MCP
 * entry opencode never reads, plus our marker-fenced AGENTS.md block. Returns
 * only files actually changed, so install output stays quiet when there is
 * nothing to heal. Never touches anything else in the legacy dir: a user may
 * genuinely keep other tools' state under %APPDATA%.
 */
function cleanupLegacyWindowsState() {
    const dir = legacyWindowsConfigDir();
    if (!dir || !fs.existsSync(dir))
        return [];
    const out = [];
    for (const name of ['opencode.jsonc', 'opencode.json']) {
        const res = removeMcpEntryAt(path.join(dir, name));
        if (res.action === 'removed')
            out.push(res);
    }
    const agents = path.join(dir, 'AGENTS.md');
    const action = (0, shared_1.removeMarkedSection)(agents, instructions_template_1.CODEGRAPH_SECTION_START, instructions_template_1.CODEGRAPH_SECTION_END);
    if (action === 'removed')
        out.push({ path: agents, action });
    return out;
}
/**
 * Strip the marker-delimited CodeGraph block from AGENTS.md if a prior
 * install wrote one. Used by both install (self-heal on upgrade) and
 * uninstall — see issue #529.
 */
function removeInstructionsEntry(loc) {
    const file = instructionsPath(loc);
    const action = (0, shared_1.removeMarkedSection)(file, instructions_template_1.CODEGRAPH_SECTION_START, instructions_template_1.CODEGRAPH_SECTION_END);
    return { path: file, action };
}
exports.opencodeTarget = new OpencodeTarget();
//# sourceMappingURL=opencode.js.map