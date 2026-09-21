/**
 * Search Query Utilities
 *
 * Shared module for search term extraction and scoring.
 */
import { Node } from '../types';
/** Normalize a name to a comparable token: lowercase, alphanumerics only. */
export declare function normalizeNameToken(raw: string): string;
/**
 * Tokens that name the PROJECT as a whole — its `go.mod` module, `package.json`
 * name, or repo root directory — rather than any specific symbol. A user
 * naturally puts the project name in a query as context ("MyApp backend
 * routes"), but it carries no discriminative signal: when it's also a substring
 * of a symbol or path on one stack (a `MyAppFrontend/` dir, a `MyAppApp` class)
 * it lexically inflates that stack and buries the rest (#720).
 *
 * Returned normalized (lowercase, alphanumerics only) so a query word can be
 * compared by its normalized form. Only names ≥5 chars are kept — short ones
 * (`api`, `app`, `core`, `web`) collide with real query terms too often to
 * safely down-weight.
 */
export declare function deriveProjectNameTokens(projectRoot: string): Set<string>;
/**
 * Common stop words to filter from search queries.
 * Includes generic English + code-specific noise words.
 */
export declare const STOP_WORDS: Set<string>;
/**
 * Generate stem variants of a search term by removing common English suffixes.
 * Used for FTS query expansion so "caching" also finds "cache", "eviction" finds "evict", etc.
 * Stems are used as PREFIX matches in FTS, so they don't need to be perfect English words.
 */
export declare function getStemVariants(term: string): string[];
/**
 * Extract meaningful search terms from a natural language query.
 * Splits camelCase, PascalCase, snake_case, SCREAMING_SNAKE, and dot.notation
 * into individual tokens before filtering.
 *
 * Preserves original compound identifiers (e.g., "scrapeLoop") alongside
 * their split parts so that FTS can match both the full symbol name and
 * individual words within it.
 *
 * Also generates stem variants (e.g., "caching"→"cache", "eviction"→"evict")
 * so FTS prefix matching can find related code symbols.
 */
export declare function extractSearchTerms(query: string, options?: {
    stems?: boolean;
}): string[];
/**
 * Score path relevance to a query
 * Higher score = more relevant path
 */
export declare function scorePathRelevance(filePath: string, query: string, projectNameTokens?: Set<string>): number;
/**
 * Check if a file path looks like a test file
 */
export declare function isTestFile(filePath: string): boolean;
/**
 * Bonus when a node's name matches the search query.
 * Exact matches get the largest boost; prefix matches get smaller boosts.
 * Multi-word queries also check individual term matches against the name.
 */
export declare function nameMatchBonus(nodeName: string, query: string): number;
/**
 * Kind-based bonus for search ranking
 * Functions and classes are typically more relevant than variables/imports
 */
export declare function kindBonus(kind: Node['kind']): number;
/**
 * Whether a query token looks like a code identifier the user deliberately typed
 * (camelCase / PascalCase-with-internal-caps / snake_case / has a digit) rather
 * than a plain dictionary word ("flat", "object", "screen").
 *
 * Used to decide whether an EXACT name match earns the "the user named this
 * symbol" exemption from single-term dampening. A common English word that
 * happens to exact-match an unrelated symbol — the query "flat object" matching
 * a constant named `FLAT` — must NOT get that exemption, or the +exact-name
 * bonus floats it to the top of a prose query on its own.
 *
 * Classifies the token AS THE USER TYPED IT, not the matched symbol's name:
 * "flat" (lowercase, descriptive) is non-distinctive even though it matches
 * `FLAT`. A leading-capital-only word ("Screen", "Zustand") is also treated as
 * a plain word — sentence-start capitalization and proper nouns aren't reliable
 * identifier signals.
 */
export declare function isDistinctiveIdentifier(token: string): boolean;
//# sourceMappingURL=query-utils.d.ts.map