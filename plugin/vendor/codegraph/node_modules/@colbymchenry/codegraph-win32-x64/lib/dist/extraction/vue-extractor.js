"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VueExtractor = void 0;
const tree_sitter_helpers_1 = require("./tree-sitter-helpers");
const tree_sitter_1 = require("./tree-sitter");
const grammars_1 = require("./grammars");
/**
 * Vue built-in components — skipped so a `<Transition>` / `<KeepAlive>` in the
 * template doesn't become a phantom reference to a user component. Checked
 * AFTER kebab→Pascal conversion, so `<keep-alive>` is caught here too.
 */
const VUE_BUILTIN_COMPONENTS = new Set([
    'Transition',
    'TransitionGroup',
    'KeepAlive',
    'Suspense',
    'Teleport',
    'Component',
    'Slot',
]);
/** `my-component` → `MyComponent` (Vue allows either form in templates). */
function kebabToPascal(name) {
    return name
        .split('-')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
        .join('');
}
/**
 * VueExtractor - Extracts code relationships from Vue Single-File Component files
 *
 * Vue SFCs are multi-language (script + template + style). Rather than
 * parsing the full Vue grammar, we extract the <script> block content
 * and delegate it to the TypeScript/JavaScript TreeSitterExtractor.
 *
 * Every .vue file produces a component node (Vue components are always importable).
 */
class VueExtractor {
    filePath;
    source;
    nodes = [];
    edges = [];
    unresolvedReferences = [];
    errors = [];
    constructor(filePath, source) {
        this.filePath = filePath;
        this.source = source;
    }
    /**
     * Extract from Vue source
     */
    extract() {
        const startTime = Date.now();
        try {
            // Create component node for the .vue file itself
            const componentNode = this.createComponentNode();
            // Extract and process script blocks
            const scriptBlocks = this.extractScriptBlocks();
            for (const block of scriptBlocks) {
                this.processScriptBlock(block, componentNode.id);
            }
            // Extract component usages from the <template> (<ComponentName>).
            // Without this, a Vue component used only in another component's
            // markup (incl. through a barrel import) is invisible to callers /
            // impact (#629 follow-up).
            this.extractTemplateComponents(componentNode.id);
        }
        catch (error) {
            this.errors.push({
                message: `Vue extraction error: ${error instanceof Error ? error.message : String(error)}`,
                severity: 'error',
            });
        }
        return {
            nodes: this.nodes,
            edges: this.edges,
            unresolvedReferences: this.unresolvedReferences,
            errors: this.errors,
            durationMs: Date.now() - startTime,
        };
    }
    /**
     * Create a component node for the .vue file
     */
    createComponentNode() {
        const lines = this.source.split('\n');
        const fileName = this.filePath.split(/[/\\]/).pop() || this.filePath;
        const componentName = fileName.replace(/\.vue$/, '');
        const id = (0, tree_sitter_helpers_1.generateNodeId)(this.filePath, 'component', componentName, 1);
        const node = {
            id,
            kind: 'component',
            name: componentName,
            qualifiedName: `${this.filePath}::${componentName}`,
            filePath: this.filePath,
            language: 'vue',
            startLine: 1,
            endLine: lines.length,
            startColumn: 0,
            endColumn: lines[lines.length - 1]?.length || 0,
            isExported: true, // Vue components are always importable
            updatedAt: Date.now(),
        };
        this.nodes.push(node);
        return node;
    }
    /**
     * Extract <script> and <script setup> blocks from the Vue source
     */
    extractScriptBlocks() {
        const blocks = [];
        const scriptRegex = /<script(\s[^>]*)?>(?<content>[\s\S]*?)<\/script>/g;
        let match;
        while ((match = scriptRegex.exec(this.source)) !== null) {
            const attrs = match[1] || '';
            const content = match.groups?.content || match[2] || '';
            // Detect TypeScript from lang attribute
            const isTypeScript = /lang\s*=\s*["'](ts|typescript)["']/.test(attrs);
            // Detect <script setup>
            const isSetup = /\bsetup\b/.test(attrs);
            // Calculate the 0-indexed line where the content begins. The content
            // starts right after the opening tag's `>` — its leading `\n` is part
            // of the content, so relative line 1 sits ON the tag's closing line
            // (adding 1 here double-counted the embedded newline and shifted every
            // script-block symbol down a line).
            const beforeScript = this.source.substring(0, match.index);
            const scriptTagLine = (beforeScript.match(/\n/g) || []).length;
            const openingTag = match[0].substring(0, match[0].indexOf('>') + 1);
            const openingTagLines = (openingTag.match(/\n/g) || []).length;
            const contentStartLine = scriptTagLine + openingTagLines; // 0-indexed line
            blocks.push({
                content,
                startLine: contentStartLine,
                isSetup,
                isTypeScript,
            });
        }
        return blocks;
    }
    /**
     * Process a script block by delegating to TreeSitterExtractor
     */
    processScriptBlock(block, componentNodeId) {
        const scriptLanguage = block.isTypeScript ? 'typescript' : 'javascript';
        // Check if the script language parser is available
        if (!(0, grammars_1.isLanguageSupported)(scriptLanguage)) {
            this.errors.push({
                message: `Parser for ${scriptLanguage} not available, cannot parse Vue script block`,
                severity: 'warning',
            });
            return;
        }
        // Delegate to TreeSitterExtractor
        const extractor = new tree_sitter_1.TreeSitterExtractor(this.filePath, block.content, scriptLanguage);
        const result = extractor.extract();
        // Offset line numbers from script block back to .vue file positions
        for (const node of result.nodes) {
            node.startLine += block.startLine;
            node.endLine += block.startLine;
            node.language = 'vue'; // Mark as vue, not TS/JS
            this.nodes.push(node);
            // Add containment edge from component to this node
            this.edges.push({
                source: componentNodeId,
                target: node.id,
                kind: 'contains',
            });
        }
        // Offset edges (they reference line numbers)
        for (const edge of result.edges) {
            if (edge.line) {
                edge.line += block.startLine;
            }
            this.edges.push(edge);
        }
        // Offset unresolved references
        for (const ref of result.unresolvedReferences) {
            ref.line += block.startLine;
            ref.filePath = this.filePath;
            ref.language = 'vue';
            this.unresolvedReferences.push(ref);
        }
        // Carry over errors
        for (const error of result.errors) {
            if (error.line) {
                error.line += block.startLine;
            }
            this.errors.push(error);
        }
    }
    /**
     * Extract component usages from the Vue `<template>`.
     *
     * PascalCase tags (`<Modal>`, `<Button />`) and kebab-case tags
     * (`<my-button>`) both represent component instantiations — analogous to
     * function calls in imperative code. Capturing them creates parent→child
     * component edges and lets `callers` / `impact` see a component that is
     * only ever used in markup. Vue's extractor previously parsed only the
     * `<script>` block, so these usages produced no edge at all (#629).
     *
     * HTML elements (lowercase, no hyphen) and Vue built-ins are skipped.
     * Unmatched names create no edge during resolution, so converting
     * kebab-case is safe even for native custom elements.
     */
    extractTemplateComponents(componentNodeId) {
        // Ranges covered by <script> / <style> blocks — skip them so script
        // identifiers and CSS selectors aren't mistaken for template tags. This
        // also correctly handles nested <template> tags (v-if / slots), which a
        // single non-greedy <template>…</template> match would mis-bound.
        const coveredRanges = [];
        const blockRegex = /<(script|style)(\s[^>]*)?>[\s\S]*?<\/\1>/g;
        let blockMatch;
        while ((blockMatch = blockRegex.exec(this.source)) !== null) {
            const startLine = (this.source.substring(0, blockMatch.index).match(/\n/g) || []).length;
            const endLine = startLine + (blockMatch[0].match(/\n/g) || []).length;
            coveredRanges.push([startLine, endLine]);
        }
        const lines = this.source.split('\n');
        // Opening / self-closing tags (closing `</Foo>` starts with `</`, so the
        // leading `<` followed by a name letter won't match it).
        const tagRegex = /<([A-Za-z][A-Za-z0-9_-]*)\b/g;
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            if (coveredRanges.some(([start, end]) => lineIdx >= start && lineIdx <= end))
                continue;
            const line = lines[lineIdx];
            let match;
            while ((match = tagRegex.exec(line)) !== null) {
                const raw = match[1];
                let componentName;
                if (/^[A-Z]/.test(raw)) {
                    componentName = raw; // PascalCase component
                }
                else if (raw.includes('-')) {
                    componentName = kebabToPascal(raw); // kebab-case component
                }
                else {
                    continue; // lowercase, no hyphen → native HTML element
                }
                if (VUE_BUILTIN_COMPONENTS.has(componentName))
                    continue;
                this.unresolvedReferences.push({
                    fromNodeId: componentNodeId,
                    referenceName: componentName,
                    referenceKind: 'references',
                    line: lineIdx + 1, // 1-indexed
                    column: match.index + 1,
                    filePath: this.filePath,
                    language: 'vue',
                });
            }
        }
    }
}
exports.VueExtractor = VueExtractor;
//# sourceMappingURL=vue-extractor.js.map