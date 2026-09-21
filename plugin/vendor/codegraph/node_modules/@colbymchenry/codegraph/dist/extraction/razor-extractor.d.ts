import { ExtractionResult } from '../types';
export declare class RazorExtractor {
    private filePath;
    private source;
    private nodes;
    private edges;
    private unresolvedReferences;
    private errors;
    constructor(filePath: string, source: string);
    extract(): ExtractionResult;
    private createComponentNode;
    /** Last `.`-segment (`App.ViewModels.RegisterModel` → `RegisterModel`). */
    private lastSegment;
    /**
     * Split a type expression into the capitalized type names it contains — base
     * type plus any generic arguments (`Bar<Foo, Baz>` → `Bar`, `Foo`, `Baz`),
     * each reduced to its last namespace segment. Lowercase/keyword tokens drop out.
     */
    private typeNames;
    private pushRef;
    private extractDirectives;
    private extractComponentTags;
    /**
     * Find the matching `}` for the `{` at `openIdx`, skipping string literals and
     * comments so a brace inside `"{"` / `// }` doesn't throw off the count.
     * Returns the index of the closing brace, or -1 if unbalanced.
     */
    private matchBrace;
    /** `@code { … }` / `@functions { … }` (Blazor) and `@{ … }` (Razor) C# blocks. */
    private extractCodeBlocks;
    /**
     * Delegate each `@code`/`@functions`/`@{` block's C# to the tree-sitter C#
     * extractor and attribute the block's external references (service/DTO calls,
     * `new X()`, type uses) to the component. The block is wrapped in a synthetic
     * class so tree-sitter parses the component's fields/methods in a class context
     * (a Blazor `@code` body compiles into the component's partial class). We keep
     * only the dependency references — coverage just needs the edges to external
     * types, not per-member nodes. Degrades gracefully if the C# grammar isn't loaded.
     */
    private processCodeBlocks;
}
//# sourceMappingURL=razor-extractor.d.ts.map