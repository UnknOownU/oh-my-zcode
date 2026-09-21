import { ExtractionResult } from '../types';
/**
 * AstroExtractor - Extracts code relationships from Astro component files
 *
 * Astro files are multi-language: a TypeScript frontmatter block fenced by
 * `---` lines, a JSX-like HTML template, and optional <script>/<style> blocks.
 * Rather than parsing a full Astro grammar, we extract the frontmatter and
 * <script> contents and delegate them to the TypeScript TreeSitterExtractor
 * (Astro processes both as TypeScript by default — no `lang` attr needed).
 *
 * Also extracts function calls from template expressions (`{fn(...)}`) and
 * component usages (`<PascalCase>`) so cross-file edges are captured even
 * when the only reference lives in markup.
 *
 * Every .astro file produces a component node (Astro components are always
 * importable).
 */
export declare class AstroExtractor {
    private filePath;
    private source;
    private nodes;
    private edges;
    private unresolvedReferences;
    private errors;
    constructor(filePath: string, source: string);
    /**
     * Extract from Astro source
     */
    extract(): ExtractionResult;
    /**
     * Create a component node for the .astro file
     */
    private createComponentNode;
    /**
     * Extract the frontmatter block: the content between the opening `---`
     * fence (first non-blank line of the file) and the closing `---` fence.
     * An unclosed fence is treated as "no frontmatter" rather than swallowing
     * the whole template as TypeScript.
     *
     * Returns the content plus its 0-indexed start line, or null.
     */
    private extractFrontmatter;
    /**
     * Extract <script> blocks from the template portion
     */
    private extractScriptBlocks;
    /**
     * Process frontmatter / script content by delegating to TreeSitterExtractor.
     * Astro treats both as TypeScript by default.
     */
    private processScriptContent;
    /**
     * Line ranges (0-indexed, inclusive) the template scans must skip:
     * the frontmatter block and <script>/<style> blocks.
     */
    private getCoveredRanges;
    /**
     * Extract function calls from Astro template expressions.
     *
     * Astro templates embed JSX-like expressions (`{formatDate(post.date)}`,
     * `class:list={cn(...)}`), so calls frequently live in markup rather than
     * the frontmatter. We scan template lines for `{expression}` groups and
     * extract call patterns from them. A `{` group left open at end-of-line
     * (the pervasive `{posts.map((post) => (` pattern) contributes the calls
     * on its opening line.
     */
    private extractTemplateCalls;
    /**
     * Extract component usages from the Astro template.
     *
     * PascalCase tags like <Layout>, <PostCard /> represent component
     * instantiations — analogous to function calls in imperative code.
     * Lowercase tags are native HTML (Astro does not register kebab-case
     * components the way Vue does, so those are real custom elements and
     * are skipped).
     */
    private extractTemplateComponents;
}
//# sourceMappingURL=astro-extractor.d.ts.map