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
/** A single alias pattern from `compilerOptions.paths`. */
export interface AliasPattern {
    /** The literal prefix before `*` (or the whole pattern if no `*`). */
    prefix: string;
    /** The literal suffix after `*` (almost always empty). */
    suffix: string;
    /** Whether the pattern contains a `*` wildcard. */
    hasWildcard: boolean;
    /**
     * Replacement templates. When `hasWildcard` is true, `*` in the
     * replacement is filled with the captured wildcard portion of the
     * import path. Stored relative to {@link AliasMap.baseUrl}.
     * tsconfig allows multiple targets per alias (priority order).
     */
    replacements: string[];
}
export interface AliasMap {
    /** Absolute path. The directory `compilerOptions.paths` is rooted at. */
    baseUrl: string;
    /**
     * Patterns ordered by specificity: longer prefix first, then literal-
     * before-wildcard, so the resolver tries the most-specific match.
     */
    patterns: AliasPattern[];
}
/**
 * Load aliases for `projectRoot`. Returns `null` when no tsconfig /
 * jsconfig is present or when the file has no usable `paths`.
 *
 * Cheap to call repeatedly — caching is the caller's job (the
 * resolver does it via {@link aliasCache}).
 */
export declare function loadProjectAliases(projectRoot: string): AliasMap | null;
/**
 * Resolve an import path through an {@link AliasMap}. Returns the list
 * of candidate filesystem paths (relative to `projectRoot`), in the
 * priority order defined by tsconfig (multiple replacements per alias
 * are tried in order). Returns `[]` when no alias matches.
 *
 * Callers still need to try each candidate with the language's
 * extension list — this function only does the alias rewrite.
 */
export declare function applyAliases(importPath: string, aliases: AliasMap, projectRoot: string): string[];
//# sourceMappingURL=path-aliases.d.ts.map