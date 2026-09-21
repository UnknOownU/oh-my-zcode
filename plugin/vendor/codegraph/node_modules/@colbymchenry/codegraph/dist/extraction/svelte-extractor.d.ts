import { ExtractionResult } from '../types';
/**
 * SvelteExtractor - Extracts code relationships from Svelte component files
 *
 * Svelte files are multi-language (script + template + style). Rather than
 * parsing the full Svelte grammar, we extract the <script> block content
 * and delegate it to the TypeScript/JavaScript TreeSitterExtractor.
 *
 * Also extracts function calls from template expressions (`{fn(...)}`) so
 * cross-file call edges are captured even when calls live in markup.
 *
 * Every .svelte file produces a component node (Svelte components are always importable).
 */
export declare class SvelteExtractor {
    private filePath;
    private source;
    private nodes;
    private edges;
    private unresolvedReferences;
    private errors;
    constructor(filePath: string, source: string);
    /**
     * Extract from Svelte source
     */
    extract(): ExtractionResult;
    /**
     * Create a component node for the .svelte file
     */
    private createComponentNode;
    /**
     * Extract <script> blocks from the Svelte source
     */
    private extractScriptBlocks;
    /**
     * Process a script block by delegating to TreeSitterExtractor
     */
    private processScriptBlock;
    /**
     * Extract function calls from Svelte template expressions.
     *
     * In Svelte, many function calls happen in markup (e.g., `class={cn(...)}`),
     * not inside `<script>` blocks. We scan the template portion for `{expression}`
     * blocks and extract call patterns from them.
     */
    private extractTemplateCalls;
    /**
     * Extract component usages from the Svelte template.
     *
     * PascalCase tags like <Modal>, <Button />, <DevServerPreview> represent
     * component instantiations — analogous to function calls in imperative code.
     * Capturing these creates graph edges from parent to child components and
     * gives codegraph_explore anchor points in the template markup.
     */
    private extractTemplateComponents;
}
//# sourceMappingURL=svelte-extractor.d.ts.map