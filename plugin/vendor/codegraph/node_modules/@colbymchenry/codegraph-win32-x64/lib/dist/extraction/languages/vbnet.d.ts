import type { LanguageExtractor } from '../tree-sitter-types';
/**
 * The vendored VB.NET grammar has no true end-of-file token (its `_eof` rule is
 * a literal-`$` placeholder that never matches real input), so a file whose
 * last line lacks a trailing newline ends every parse with a MISSING-newline
 * error on the final statement. Appending a newline is offset-preserving for
 * all existing content.
 */
export declare function ensureTrailingNewline(source: string): string;
export declare const vbnetExtractor: LanguageExtractor;
//# sourceMappingURL=vbnet.d.ts.map