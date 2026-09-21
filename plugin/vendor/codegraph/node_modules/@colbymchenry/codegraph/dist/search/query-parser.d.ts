/**
 * Field-qualified search query parser.
 *
 * Splits a raw query like
 *
 *     kind:function name:auth path:src/api authenticate
 *
 * into structured filters (kind=function, name="auth", path prefix
 * "src/api") plus the free-text portion ("authenticate") that goes
 * to FTS. Free-text and filters compose: filters narrow the result
 * set, FTS scores within the narrowed set.
 *
 * Recognised fields (case-insensitive, value is the rest until
 * whitespace):
 *
 *   kind:    one of function|method|class|interface|struct|...
 *   lang:    one of typescript|python|go|...   (alias: language:)
 *   path:    case-insensitive substring of file_path
 *   name:    case-insensitive substring of the symbol's name
 *
 * Unknown field prefixes (e.g. `foo:bar`) are passed through to FTS
 * as plain text — that's how someone searching for `TODO:` gets a
 * result instead of a parse error.
 *
 * Quoting:
 *   kind:function path:"src/some path/with spaces" → handled by stripping
 *   the surrounding double quotes from the value (single token only,
 *   no nested escapes).
 */
import type { NodeKind, Language } from '../types';
export interface ParsedQuery {
    /** Free-text portion to feed to FTS / LIKE. May be empty. */
    text: string;
    /** kind: filters (OR'd). Empty when none specified. */
    kinds: NodeKind[];
    /** lang:/language: filters (OR'd). Empty when none specified. */
    languages: Language[];
    /** path: filters (OR'd, case-insensitive substring of file_path). Empty when none. */
    pathFilters: string[];
    /** name: filters (OR'd, case-insensitive substring of node.name). */
    nameFilters: string[];
}
/**
 * Parse a raw query into structured filters + remaining text.
 * Always returns a value; never throws.
 */
export declare function parseQuery(raw: string): ParsedQuery;
/**
 * Damerau-Levenshtein-ish bounded edit distance. Returns `maxDist + 1`
 * as soon as the distance is known to exceed `maxDist`; that early-exit
 * makes the fuzzy fallback cheap even over tens of thousands of names.
 *
 * Pure DP, O(min(len(a), len(b))) memory. Compares case-folded inputs;
 * callers should pass `lowercase(name)` strings.
 */
export declare function boundedEditDistance(a: string, b: string, maxDist: number): number;
//# sourceMappingURL=query-parser.d.ts.map