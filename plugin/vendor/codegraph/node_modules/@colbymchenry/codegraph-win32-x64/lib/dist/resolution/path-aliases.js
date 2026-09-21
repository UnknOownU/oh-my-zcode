"use strict";
/**
 * Project-level import-path alias loading.
 *
 * Reads `compilerOptions.paths` from `tsconfig.json` / `jsconfig.json`
 * at the project root and converts the patterns into a form the
 * import-resolver can consult.
 *
 * This is the single biggest blocker to accurate resolution on modern
 * JS/TS codebases: aliases like `@/components/Foo` (Next, Nuxt, Nest,
 * Vite scaffolds) point into a `paths` map the resolver previously
 * ignored — every import through an alias was treated as unresolvable
 * unless it happened to match the small hard-coded fallback list.
 *
 * Scope deliberately small for v1:
 *   - reads tsconfig.json, then jsconfig.json
 *   - honours top-level `compilerOptions.baseUrl` and `compilerOptions.paths`
 *   - supports `*` wildcard (the only TS-supported wildcard)
 *   - does NOT follow `extends` chains yet (most projects don't need it)
 *   - does NOT read Vite/webpack/Rollup configs (separate follow-up)
 *
 * The file is parsed as JSON-with-comments-tolerant — tsconfigs in the
 * wild routinely contain `//` and `/* *\/` comments and trailing
 * commas, which JSON.parse rejects. We strip those before parsing.
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
exports.loadProjectAliases = loadProjectAliases;
exports.applyAliases = applyAliases;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const errors_1 = require("../errors");
/**
 * Strip JSONC comments + trailing commas so a tsconfig with the usual
 * VS Code-style annotations parses cleanly. Walks the source as a
 * tiny state machine that tracks string context — the previous
 * regex-only version corrupted any URL inside a string value
 * (`"baseUrl": "https://cdn.example.com"` had everything after `//`
 * truncated).
 */
function stripJsonc(src) {
    let out = '';
    let i = 0;
    let inString = false;
    while (i < src.length) {
        const ch = src[i];
        if (inString) {
            out += ch;
            if (ch === '\\' && i + 1 < src.length) {
                out += src[i + 1];
                i += 2;
                continue;
            }
            if (ch === '"')
                inString = false;
            i++;
            continue;
        }
        if (ch === '"') {
            inString = true;
            out += ch;
            i++;
            continue;
        }
        if (ch === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n')
                i++;
            continue;
        }
        if (ch === '/' && src[i + 1] === '*') {
            i += 2;
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/'))
                i++;
            i += 2;
            continue;
        }
        out += ch;
        i++;
    }
    // Trailing commas before } or ] — outside strings, so safe to
    // run on the comment-stripped output.
    return out.replace(/,(\s*[}\]])/g, '$1');
}
function readTsconfigLike(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(stripJsonc(raw));
        return parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch (err) {
        (0, errors_1.logDebug)('path-aliases: failed to parse', { filePath, err: String(err) });
        return null;
    }
}
function splitWildcard(pattern) {
    const star = pattern.indexOf('*');
    if (star === -1)
        return { prefix: pattern, suffix: '', hasWildcard: false };
    return {
        prefix: pattern.slice(0, star),
        suffix: pattern.slice(star + 1),
        hasWildcard: true,
    };
}
/**
 * Load aliases for `projectRoot`. Returns `null` when no tsconfig /
 * jsconfig is present or when the file has no usable `paths`.
 *
 * Cheap to call repeatedly — caching is the caller's job (the
 * resolver does it via {@link aliasCache}).
 */
function loadProjectAliases(projectRoot) {
    const candidates = ['tsconfig.json', 'jsconfig.json'];
    let raw = null;
    let usedFile = null;
    for (const name of candidates) {
        const p = path.join(projectRoot, name);
        if (fs.existsSync(p)) {
            raw = readTsconfigLike(p);
            if (raw) {
                usedFile = name;
                break;
            }
        }
    }
    if (!raw)
        return null;
    const co = raw.compilerOptions ?? {};
    const baseUrlRel = co.baseUrl ?? '.';
    const baseUrl = path.resolve(projectRoot, baseUrlRel);
    const paths = co.paths;
    if (!paths || typeof paths !== 'object') {
        // baseUrl alone isn't an "alias" per se; with no paths we'd just
        // be redirecting the whole tree. Skip — the existing resolver
        // already handles relative imports.
        return null;
    }
    const patterns = [];
    for (const [pattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets) || targets.length === 0)
            continue;
        const filtered = targets.filter((t) => typeof t === 'string');
        if (filtered.length === 0)
            continue;
        const { prefix, suffix, hasWildcard } = splitWildcard(pattern);
        patterns.push({ prefix, suffix, hasWildcard, replacements: filtered });
    }
    if (patterns.length === 0)
        return null;
    // Specificity sort: longer prefix first; literal patterns before
    // wildcard patterns of the same prefix length. TypeScript itself
    // uses a similar "most specific match wins" rule.
    patterns.sort((a, b) => {
        if (a.prefix.length !== b.prefix.length)
            return b.prefix.length - a.prefix.length;
        if (a.hasWildcard !== b.hasWildcard)
            return a.hasWildcard ? 1 : -1;
        return 0;
    });
    (0, errors_1.logDebug)('path-aliases loaded', {
        file: usedFile,
        baseUrl,
        patternCount: patterns.length,
    });
    return { baseUrl, patterns };
}
/**
 * Resolve an import path through an {@link AliasMap}. Returns the list
 * of candidate filesystem paths (relative to `projectRoot`), in the
 * priority order defined by tsconfig (multiple replacements per alias
 * are tried in order). Returns `[]` when no alias matches.
 *
 * Callers still need to try each candidate with the language's
 * extension list — this function only does the alias rewrite.
 */
function applyAliases(importPath, aliases, projectRoot) {
    for (const pat of aliases.patterns) {
        if (!importPath.startsWith(pat.prefix))
            continue;
        if (pat.suffix && !importPath.endsWith(pat.suffix))
            continue;
        let captured = '';
        if (pat.hasWildcard) {
            captured = importPath.slice(pat.prefix.length, importPath.length - pat.suffix.length);
        }
        else if (importPath !== pat.prefix) {
            // Literal pattern must match exactly.
            continue;
        }
        const out = [];
        for (const target of pat.replacements) {
            const filled = pat.hasWildcard ? target.replace('*', captured) : target;
            // baseUrl is absolute; produce a path relative to projectRoot
            const absolute = path.resolve(aliases.baseUrl, filled);
            const relative = path.relative(projectRoot, absolute);
            // Skip if the rewrite escapes the project root (unsafe + can't
            // be looked up via the file index anyway).
            if (relative.startsWith('..'))
                continue;
            out.push(relative.replace(/\\/g, '/'));
        }
        return out;
    }
    return [];
}
//# sourceMappingURL=path-aliases.js.map