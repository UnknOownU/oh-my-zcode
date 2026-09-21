import { Language } from './types';
/** Filename of the project-scoped config, resolved relative to the project root. */
export declare const PROJECT_CONFIG_FILENAME = "codegraph.json";
export interface ProjectConfig {
    /** Map of custom file extension (`.foo`) to a supported language id. */
    extensions?: Record<string, string>;
    /**
     * Gitignore-style patterns naming gitignored directories whose embedded git
     * repositories should be indexed anyway — the explicit opt-in to override
     * `.gitignore` for nested-repo discovery (#622, #699). Absent/empty (the
     * default) means `.gitignore` is fully respected: gitignored embedded repos
     * are never discovered or indexed (#970, #976).
     */
    includeIgnored?: string[];
    /**
     * Gitignore-style patterns for paths to keep OUT of the index — even when
     * they are git-TRACKED, which `.gitignore` cannot do (#999). The escape hatch
     * for a committed vendor/theme/SDK directory (e.g. a checked-in Metronic theme
     * under `static/`) that bloats the graph and slows indexing but isn't really
     * your code. Matched against project-root-relative paths, so a directory like
     * `"static/"`, a double-star vendor glob, or `"assets/theme"` all work.
     * Absent/empty (the default) excludes nothing beyond the built-in defaults
     * and your `.gitignore`.
     */
    exclude?: string[];
    /**
     * Gitignore-style patterns for first-party source to force INTO the index even
     * when `.gitignore` would drop it — the general whitelist `includeIgnored`
     * never was (that one only revives *embedded git repos* inside ignored dirs).
     * The case this exists for: a project under a second VCS (SVN, Perforce, …)
     * deliberately `.gitignore`s its own real source so it never lands in Git, yet
     * that source must still be indexed. Matched against project-root-relative
     * paths, so `"Tools/"`, a recursive `"Tools/**"` glob, or `"Local/typescript"`
     * all work.
     * Built-in default-ignored dirs (`node_modules`, `dist`, …), `.git`, and
     * CodeGraph's own data dir are never resurfaced; an explicit `exclude` still
     * wins. Absent/empty (the default) forces nothing in.
     */
    include?: string[];
}
/**
 * Load the validated extension overrides for a project, mtime-cached.
 *
 * Returns a map of `.ext` → supported language id. The result merges on top of
 * the built-in extension map at the point of use (see `detectLanguage` /
 * `isSourceFile`), with these user mappings taking precedence. Returns an empty
 * map when there is no `codegraph.json` (the zero-config default).
 */
export declare function loadExtensionOverrides(rootDir: string): Record<string, Language>;
/**
 * Load the validated `includeIgnored` patterns for a project, mtime-cached.
 *
 * These name gitignored directories whose embedded git repositories should be
 * indexed despite `.gitignore` (#622, #699). An empty result — the zero-config
 * default — means `.gitignore` is fully respected: gitignored embedded repos
 * are never discovered or indexed (#970, #976).
 */
export declare function loadIncludeIgnoredPatterns(rootDir: string): string[];
/**
 * Load the validated `exclude` patterns for a project, mtime-cached.
 *
 * These name paths to keep OUT of the index even when git-tracked — the escape
 * hatch for a committed vendor/theme/SDK directory `.gitignore` can't drop
 * (#999). An empty result — the zero-config default — excludes nothing beyond
 * the built-in defaults and the project's `.gitignore`.
 */
export declare function loadExcludePatterns(rootDir: string): string[];
/**
 * Load the validated `include` patterns for a project, mtime-cached.
 *
 * These name first-party source to force INTO the index even when `.gitignore`
 * would drop it — the whitelist for SVN/Perforce-only source a project
 * gitignores out of Git. An empty result — the zero-config default — forces
 * nothing in. Built-in default-ignored dirs, `.git`, and CodeGraph's data dir
 * are never resurfaced, and an explicit `exclude` still wins.
 */
export declare function loadIncludePatterns(rootDir: string): string[];
/** Test/maintenance hook: forget cached config (e.g. after rewriting it in a test). */
export declare function clearProjectConfigCache(): void;
/**
 * Add gitignore-style patterns to a project's `codegraph.json` `includeIgnored`
 * list, creating the file if absent and preserving every other key. Used by the
 * CLI to opt a "super-repo of gitignored child repos" (#1156) into the index on
 * the user's say-so. Returns the count of patterns actually ADDED (ones already
 * present are skipped, so a re-run is idempotent).
 *
 * A plain-JSON round-trip: a `codegraph.json` carrying comments (not valid JSON)
 * already fails to load with a warning, so rather than silently clobber such a
 * file this throws when an existing config won't parse — the caller falls back
 * to printing the manual snippet. Invalidates the config cache so a subsequent
 * index in the same process sees the new patterns.
 */
export declare function addIncludeIgnoredPatterns(rootDir: string, patterns: string[]): number;
//# sourceMappingURL=project-config.d.ts.map