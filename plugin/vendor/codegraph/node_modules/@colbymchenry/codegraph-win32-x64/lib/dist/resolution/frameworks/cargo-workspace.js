"use strict";
/**
 * Cargo Workspace Resolver Helper
 *
 * Parses a project's root Cargo.toml and member crate manifests to
 * build a crate-name -> member-directory map. Used by the Rust
 * resolver to resolve `use crate_name::...` references that point
 * into workspace member crates.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCargoWorkspaceCrateMap = getCargoWorkspaceCrateMap;
const picomatch_1 = __importDefault(require("picomatch"));
const GLOB_CHARS = /[*?[\]{}!]/;
const SKIP_DIRS = new Set(['target', 'node_modules', '.git', 'dist', 'build']);
const MAX_GLOB_WALK_DEPTH = 5;
function getSection(content, sectionName) {
    const lines = content.split('\n');
    let inSection = false;
    const sectionLines = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!inSection) {
            if (trimmed === `[${sectionName}]`) {
                inSection = true;
            }
            continue;
        }
        if (/^\[[^\]]+\]$/.test(trimmed)) {
            break;
        }
        sectionLines.push(line);
    }
    if (!inSection)
        return null;
    return sectionLines.join('\n');
}
function extractQuotedValues(valueList) {
    const values = [];
    let quote = null;
    let escaped = false;
    let current = '';
    for (const ch of valueList) {
        if (!quote) {
            if (ch === '"' || ch === "'") {
                quote = ch;
                current = '';
            }
            continue;
        }
        if (escaped) {
            current += ch;
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === quote) {
            values.push(current.trim());
            quote = null;
            current = '';
            continue;
        }
        current += ch;
    }
    return values.filter(Boolean);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getArrayValue(section, key) {
    const keyRegex = new RegExp(`\\b${escapeRegExp(key)}\\b\\s*=`, 'm');
    const keyMatch = keyRegex.exec(section);
    if (!keyMatch)
        return null;
    let i = keyMatch.index + keyMatch[0].length;
    while (i < section.length && /\s/.test(section.charAt(i)))
        i++;
    if (section.charAt(i) !== '[')
        return null;
    i++;
    let inQuote = null;
    let escaped = false;
    let depth = 1;
    const start = i;
    while (i < section.length) {
        const ch = section.charAt(i);
        if (inQuote) {
            if (escaped) {
                escaped = false;
            }
            else if (ch === '\\') {
                escaped = true;
            }
            else if (ch === inQuote) {
                inQuote = null;
            }
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inQuote = ch;
            i++;
            continue;
        }
        if (ch === '[') {
            depth++;
            i++;
            continue;
        }
        if (ch === ']') {
            depth--;
            if (depth === 0) {
                return section.slice(start, i);
            }
            i++;
            continue;
        }
        i++;
    }
    return null;
}
function parseWorkspaceMembers(cargoToml) {
    const workspaceSection = getSection(cargoToml, 'workspace');
    if (!workspaceSection)
        return [];
    const membersValue = getArrayValue(workspaceSection, 'members');
    if (!membersValue)
        return [];
    return extractQuotedValues(membersValue);
}
function parsePackageName(cargoToml) {
    const packageSection = getSection(cargoToml, 'package');
    if (!packageSection)
        return null;
    const packageNameMatch = packageSection.match(/name\s*=\s*["']([^"'\n]+)["']/);
    return packageNameMatch?.[1]?.trim() ?? null;
}
function addCrateAlias(map, crateName, memberPath) {
    const normalized = crateName.replace(/-/g, '_');
    map.set(crateName, memberPath);
    if (normalized !== crateName) {
        map.set(normalized, memberPath);
    }
}
function cleanPath(memberPath) {
    return memberPath.replace(/\\/g, '/').replace(/\/$/, '');
}
function expandGlobMember(member, context) {
    if (!context.listDirectories)
        return [];
    const firstGlobIdx = member.search(GLOB_CHARS);
    const staticPrefix = member
        .slice(0, firstGlobIdx)
        .replace(/[^/]*$/, '')
        .replace(/\/$/, '');
    const matcher = (0, picomatch_1.default)(member, { dot: false });
    const matches = [];
    const seen = new Set();
    function walk(dir, depth) {
        if (depth > MAX_GLOB_WALK_DEPTH)
            return;
        const children = context.listDirectories(dir);
        for (const child of children) {
            if (SKIP_DIRS.has(child) || child.startsWith('.'))
                continue;
            const rel = dir === '.' ? child : `${dir}/${child}`;
            if (matcher(rel) && !seen.has(rel)) {
                seen.add(rel);
                matches.push(rel);
            }
            walk(rel, depth + 1);
        }
    }
    walk(staticPrefix || '.', 0);
    return matches;
}
function expandMembers(members, context) {
    const expanded = [];
    const seen = new Set();
    for (const member of members) {
        const candidates = GLOB_CHARS.test(member)
            ? expandGlobMember(member, context)
            : [member];
        for (const candidate of candidates) {
            const cleaned = cleanPath(candidate);
            if (seen.has(cleaned))
                continue;
            seen.add(cleaned);
            expanded.push(cleaned);
        }
    }
    return expanded;
}
/**
 * Build a map from crate-name aliases to workspace member directory paths.
 * Example: "mytool-core" and "mytool_core" -> "crates/mytool-core"
 *
 * Supports glob members (e.g. `members = ["crates/*"]`) via picomatch
 * when the context exposes `listDirectories`.
 */
function getCargoWorkspaceCrateMap(context) {
    const result = new Map();
    const rootCargoToml = context.readFile('Cargo.toml');
    if (!rootCargoToml)
        return result;
    const rawMembers = parseWorkspaceMembers(rootCargoToml);
    const members = expandMembers(rawMembers, context);
    for (const memberPath of members) {
        const memberCargoPath = `${memberPath}/Cargo.toml`;
        const memberCargoToml = context.readFile(memberCargoPath);
        if (!memberCargoToml)
            continue;
        const packageName = parsePackageName(memberCargoToml);
        if (!packageName)
            continue;
        addCrateAlias(result, packageName, memberPath);
    }
    return result;
}
//# sourceMappingURL=cargo-workspace.js.map