import { ExtractionResult } from '../types';
/**
 * VueExtractor - Extracts code relationships from Vue Single-File Component files
 *
 * Vue SFCs are multi-language (script + template + style). Rather than
 * parsing the full Vue grammar, we extract the <script> block content
 * and delegate it to the TypeScript/JavaScript TreeSitterExtractor.
 *
 * Every .vue file produces a component node (Vue components are always importable).
 */
export declare class VueExtractor {
    private filePath;
    private source;
    private nodes;
    private edges;
    private unresolvedReferences;
    private errors;
    constructor(filePath: string, source: string);
    /**
     * Extract from Vue source
     */
    extract(): ExtractionResult;
    /**
     * Create a component node for the .vue file
     */
    private createComponentNode;
    /**
     * Extract <script> and <script setup> blocks from the Vue source
     */
    private extractScriptBlocks;
    /**
     * Process a script block by delegating to TreeSitterExtractor
     */
    private processScriptBlock;
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
    private extractTemplateComponents;
}
//# sourceMappingURL=vue-extractor.d.ts.map