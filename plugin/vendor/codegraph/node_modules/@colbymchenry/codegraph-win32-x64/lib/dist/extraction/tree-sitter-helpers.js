"use strict";
/**
 * Tree-sitter Shared Helpers
 *
 * Utility functions used by the core TreeSitterExtractor and per-language extractors.
 * Extracted to a leaf module to avoid circular imports between tree-sitter.ts and languages/.
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
exports.generateNodeId = generateNodeId;
exports.getNodeText = getNodeText;
exports.getChildByField = getChildByField;
exports.getPrecedingDocstring = getPrecedingDocstring;
const crypto = __importStar(require("crypto"));
/**
 * Generate a unique node ID
 *
 * Uses a 32-character (128-bit) hash to avoid collisions when indexing
 * large codebases with many files containing similar symbols.
 */
function generateNodeId(filePath, kind, name, line) {
    const hash = crypto
        .createHash('sha256')
        .update(`${filePath}:${kind}:${name}:${line}`)
        .digest('hex')
        .substring(0, 32);
    return `${kind}:${hash}`;
}
/**
 * Extract text from a syntax node
 */
function getNodeText(node, source) {
    return source.substring(node.startIndex, node.endIndex);
}
/**
 * Find a child node by field name
 */
function getChildByField(node, fieldName) {
    return node.childForFieldName(fieldName);
}
/**
 * Node types that *wrap* a declaration so a leading comment is a sibling of the
 * wrapper, not of the emitted (inner) declaration node. CodeGraph emits the
 * inner node, so before looking for its preceding comment we climb out through
 * these. Examples: `export class X {}` (export_statement), `@dec\ndef f()`
 * (decorated_definition), `const f = () => {}` (lexical_declaration →
 * variable_declarator). Each wraps exactly one declaration, so climbing can't
 * mis-attribute a comment to a sibling. (#780)
 */
const DOCSTRING_WRAPPER_TYPES = new Set([
    'export_statement', // JS/TS: export class/function/const ...
    'decorated_definition', // Python: @decorator over def/class
    'lexical_declaration', // JS/TS: const/let x = () => {}
    'variable_declaration', // JS/TS: var x = ...
    'variable_declarator', // JS/TS: the `x = () => {}` inside the declaration
    'ambient_declaration', // TS: declare ...
]);
/**
 * Strip comment-syntax markers from a raw comment so the stored docstring is
 * just the prose. Covers the marker styles across every supported language:
 * C-family line and block comments and their doc variants, Rust/Swift/Kotlin
 * triple-slash and bang doc lines, hash lines (Python/Ruby/shell), Lua/Luau
 * line and long-bracket comments, and Pascal brace and paren-star comments.
 * (#780)
 *
 * Paired block delimiters are stripped only when the comment OPENS with one,
 * so a line comment that merely happens to END with a closing delimiter is
 * never truncated. The per-line markers are anchored at line start, so
 * they're safe to apply to any comment.
 */
function cleanCommentMarkers(comment) {
    let c = comment.trim();
    if (c.startsWith('/*'))
        c = c.replace(/^\/\*+!?/, '').replace(/\*+\/$/, '');
    else if (c.startsWith('--['))
        c = c.replace(/^--\[=*\[/, '').replace(/\]=*\]$/, '');
    else if (c.startsWith('(*'))
        c = c.replace(/^\(\*/, '').replace(/\*\)$/, '');
    else if (c.startsWith('{'))
        c = c.replace(/^\{/, '').replace(/\}$/, '');
    return c
        .replace(/^\/\/[/!]?\s?/gm, '') // // , and Rust/Swift doc lines /// //!
        .replace(/^--\s?/gm, '') //        Lua/Luau line comments
        .replace(/^#\s?/gm, '') //         Python/Ruby/shell line comments
        .replace(/^%+\s?/gm, '') //        Erlang line comments (% / %% / %%%)
        .replace(/^\s*\*\s?/gm, '') //     block-comment continuation (* foo)
        .trim();
}
/**
 * Get the docstring/comment preceding a node
 */
function getPrecedingDocstring(node, source) {
    // Climb out of any wrapper(s) so a comment preceding the WHOLE construct
    // (export-, decorator-, or const-arrow-wrapped) is reachable as a sibling.
    // The emitted node's own `previousNamedSibling` is empty (export/const) or a
    // decorator (Python) in those cases, so without this the docstring was
    // dropped. (#780)
    let anchor = node;
    while (anchor.parent && DOCSTRING_WRAPPER_TYPES.has(anchor.parent.type)) {
        anchor = anchor.parent;
    }
    let sibling = anchor.previousNamedSibling;
    const comments = [];
    while (sibling) {
        if (sibling.type === 'comment' ||
            sibling.type === 'line_comment' ||
            sibling.type === 'block_comment' ||
            sibling.type === 'documentation_comment') {
            comments.unshift(getNodeText(sibling, source));
            sibling = sibling.previousNamedSibling;
        }
        else {
            break;
        }
    }
    if (comments.length === 0)
        return undefined;
    // Strip each comment's syntax markers (language-aware), then join.
    return comments.map(cleanCommentMarkers).join('\n').trim();
}
//# sourceMappingURL=tree-sitter-helpers.js.map