"use strict";
/**
 * Hermes Agent target.
 *
 * Hermes reads MCP servers from `$HERMES_HOME/config.yaml` under the
 * top-level `mcp_servers` key, and exposes discovered MCP tools through
 * dynamic toolsets named `mcp-<server>`. We add:
 *
 *   mcp_servers.codegraph -> `codegraph serve --mcp`
 *   platform_toolsets.cli -> `mcp-codegraph`
 *
 * The second entry matters because Hermes CLI profiles often enable an
 * explicit `platform_toolsets.cli` list. Without `mcp-codegraph` in that
 * list, the MCP server can be configured and connected but its tools may
 * still be filtered out of normal CLI sessions.
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
exports.hermesTarget = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const shared_1 = require("./shared");
class HermesTarget {
    id = 'hermes';
    displayName = 'Hermes Agent';
    docsUrl = 'https://hermes-agent.nousresearch.com';
    supportsLocation(loc) {
        return loc === 'global';
    }
    detect(loc) {
        if (loc !== 'global') {
            return { installed: false, alreadyConfigured: false };
        }
        const file = configPath();
        const content = readText(file);
        const installed = fs.existsSync(hermesHome()) || fs.existsSync(file);
        return {
            installed,
            alreadyConfigured: hasCodeGraphMcpServer(content),
            configPath: file,
        };
    }
    install(loc, _opts) {
        if (loc !== 'global') {
            return {
                files: [],
                notes: ['Hermes Agent uses $HERMES_HOME/config.yaml; re-run with --location=global.'],
            };
        }
        return {
            files: [writeHermesConfig()],
            notes: ['Start a new Hermes session for MCP changes to take effect.'],
        };
    }
    uninstall(loc) {
        if (loc !== 'global')
            return { files: [] };
        const file = configPath();
        if (!fs.existsSync(file)) {
            return { files: [{ path: file, action: 'not-found' }] };
        }
        const before = readText(file);
        const after = removeCodeGraphToolset(removeCodeGraphMcpServer(before));
        if (after === before) {
            return { files: [{ path: file, action: 'not-found' }] };
        }
        (0, shared_1.atomicWriteFileSync)(file, ensureTrailingNewline(after));
        return { files: [{ path: file, action: 'removed' }] };
    }
    printConfig(loc) {
        if (loc !== 'global') {
            return '# Hermes Agent uses $HERMES_HOME/config.yaml; use --location=global.\n';
        }
        return [
            `# Add to ${configPath()}`,
            '',
            renderCodeGraphMcpBlock().join('\n'),
            '',
            'platform_toolsets:',
            '  cli:',
            '    - hermes-cli',
            '    - mcp-codegraph',
            '',
        ].join('\n');
    }
    describePaths(loc) {
        return loc === 'global' ? [configPath()] : [];
    }
}
function hermesHome() {
    return process.env.HERMES_HOME
        ? path.resolve(process.env.HERMES_HOME)
        : path.join(os.homedir(), '.hermes');
}
function configPath() {
    return path.join(hermesHome(), 'config.yaml');
}
function readText(file) {
    try {
        return fs.readFileSync(file, 'utf-8');
    }
    catch {
        return '';
    }
}
function writeHermesConfig() {
    const file = configPath();
    const existed = fs.existsSync(file);
    const before = readText(file);
    const afterMcp = upsertCodeGraphMcpServer(before);
    const after = upsertCodeGraphToolset(afterMcp);
    if (after === before) {
        return { path: file, action: 'unchanged' };
    }
    (0, shared_1.atomicWriteFileSync)(file, ensureTrailingNewline(after));
    return { path: file, action: existed ? 'updated' : 'created' };
}
function ensureTrailingNewline(text) {
    return text.endsWith('\n') ? text : text + '\n';
}
function splitLines(content) {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}
function joinLines(lines) {
    while (lines.length > 0 && lines[lines.length - 1] === '')
        lines.pop();
    return lines.join('\n') + '\n';
}
function topLevelRange(lines, key) {
    const start = lines.findIndex((line) => line.trim() === `${key}:`);
    if (start === -1)
        return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (line.trim() === '')
            continue;
        if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*(?:#.*)?$/.test(line)) {
            end = i;
            break;
        }
    }
    return { start, end };
}
function childRange(lines, parent, child) {
    const startPattern = new RegExp(`^  ${escapeRegExp(child)}:\\s*(?:#.*)?$`);
    let start = -1;
    for (let i = parent.start + 1; i < parent.end; i++) {
        if (startPattern.test(lines[i] ?? '')) {
            start = i;
            break;
        }
    }
    if (start === -1)
        return null;
    let end = parent.end;
    for (let i = start + 1; i < parent.end; i++) {
        const line = lines[i] ?? '';
        if (line.trim() === '')
            continue;
        if (/^  \S/.test(line)) {
            end = i;
            break;
        }
    }
    while (end > start + 1 && (lines[end - 1] ?? '').trim() === '') {
        end--;
    }
    return { start, end };
}
/**
 * Block-range for a 2-space-indented child whose value is a YAML block list.
 *
 * Unlike `childRange`, this handles PyYAML's default `default_flow_style=False`
 * serialization, where list items sit at the SAME indent as the parent key:
 *
 *     cli:
 *     - hermes-cli       # indent 2 — belongs to cli, not a sibling
 *     - browser
 *
 * `childRange`'s `^  \S` heuristic mistakes that first `  - hermes-cli` line
 * for the next sibling key and truncates the block, causing inserts to land
 * before the existing items at a different indent (issue #456). This helper
 * recognizes a `  - ` line as part of the block instead, and reports back
 * the actual indent used by existing items so the inserter matches it.
 */
function listChildBlock(lines, parent, child) {
    const startPattern = new RegExp(`^  ${escapeRegExp(child)}:\\s*(?:#.*)?$`);
    let start = -1;
    for (let i = parent.start + 1; i < parent.end; i++) {
        if (startPattern.test(lines[i] ?? '')) {
            start = i;
            break;
        }
    }
    if (start === -1)
        return null;
    let end = parent.end;
    for (let i = start + 1; i < parent.end; i++) {
        const line = lines[i] ?? '';
        if (line.trim() === '')
            continue;
        const indentMatch = line.match(/^( *)/);
        const indent = indentMatch?.[1]?.length ?? 0;
        if (indent >= 4)
            continue;
        if (indent === 2 && /^  - /.test(line))
            continue;
        end = i;
        break;
    }
    while (end > start + 1 && (lines[end - 1] ?? '').trim() === '') {
        end--;
    }
    let itemIndent = '    ';
    for (let i = start + 1; i < end; i++) {
        const m = (lines[i] ?? '').match(/^( +)- /);
        if (m && m[1]) {
            itemIndent = m[1];
            break;
        }
    }
    return { start, end, itemIndent };
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function renderCodeGraphMcpChild() {
    return [
        '  codegraph:',
        '    command: codegraph',
        '    args:',
        '      - serve',
        '      - --mcp',
        '    timeout: 120',
        '    connect_timeout: 60',
        '    enabled: true',
    ];
}
function renderCodeGraphMcpBlock() {
    return ['mcp_servers:', ...renderCodeGraphMcpChild()];
}
function hasCodeGraphMcpServer(content) {
    const lines = splitLines(content);
    const parent = topLevelRange(lines, 'mcp_servers');
    return !!parent && !!childRange(lines, parent, 'codegraph');
}
function upsertCodeGraphMcpServer(content) {
    const lines = splitLines(content);
    const parent = topLevelRange(lines, 'mcp_servers');
    const child = parent ? childRange(lines, parent, 'codegraph') : null;
    const replacement = renderCodeGraphMcpChild();
    if (!parent) {
        if (lines.length > 0 && lines[lines.length - 1] === '')
            lines.pop();
        if (lines.length > 0)
            lines.push('');
        lines.push(...renderCodeGraphMcpBlock());
        return joinLines(lines);
    }
    if (child) {
        const existing = lines.slice(child.start, child.end);
        if (arrayEqual(existing, replacement))
            return joinLines(lines);
        lines.splice(child.start, child.end - child.start, ...replacement);
        return joinLines(lines);
    }
    lines.splice(parent.end, 0, ...replacement);
    return joinLines(lines);
}
function removeCodeGraphMcpServer(content) {
    const lines = splitLines(content);
    const parent = topLevelRange(lines, 'mcp_servers');
    const child = parent ? childRange(lines, parent, 'codegraph') : null;
    if (!child)
        return content;
    lines.splice(child.start, child.end - child.start);
    return joinLines(lines);
}
function upsertCodeGraphToolset(content) {
    const lines = splitLines(content);
    const parent = topLevelRange(lines, 'platform_toolsets');
    const cli = parent ? listChildBlock(lines, parent, 'cli') : null;
    if (!parent) {
        if (lines.length > 0 && lines[lines.length - 1] === '')
            lines.pop();
        if (lines.length > 0)
            lines.push('');
        lines.push('platform_toolsets:', '  cli:', '    - hermes-cli', '    - mcp-codegraph');
        return joinLines(lines);
    }
    if (!cli) {
        lines.splice(parent.end, 0, '  cli:', '    - hermes-cli', '    - mcp-codegraph');
        return joinLines(lines);
    }
    const hasEntry = lines
        .slice(cli.start + 1, cli.end)
        .some((line) => line.trim() === '- mcp-codegraph');
    if (hasEntry)
        return joinLines(lines);
    lines.splice(cli.end, 0, `${cli.itemIndent}- mcp-codegraph`);
    return joinLines(lines);
}
function removeCodeGraphToolset(content) {
    const lines = splitLines(content);
    const parent = topLevelRange(lines, 'platform_toolsets');
    const cli = parent ? listChildBlock(lines, parent, 'cli') : null;
    if (!cli)
        return content;
    const hasEntry = lines
        .slice(cli.start + 1, cli.end)
        .some((line) => line.trim() === '- mcp-codegraph');
    if (!hasEntry)
        return content;
    const next = lines.filter((line, idx) => {
        if (idx <= cli.start || idx >= cli.end)
            return true;
        return line.trim() !== '- mcp-codegraph';
    });
    return joinLines(next);
}
function arrayEqual(a, b) {
    return a.length === b.length && a.every((value, idx) => value === b[idx]);
}
exports.hermesTarget = new HermesTarget();
//# sourceMappingURL=hermes.js.map