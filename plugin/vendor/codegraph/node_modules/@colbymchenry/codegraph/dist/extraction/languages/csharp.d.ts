import type { LanguageExtractor } from '../tree-sitter-types';
/**
 * Blank C# conditional-compilation directive lines (`#if` / `#elif` / `#else` /
 * `#endif`) before parsing. The vendored tree-sitter-c-sharp grammar mis-parses
 * a `#if` that appears *inside an enum member list* — the canonical
 * multi-targeting shape:
 *
 *   enum ReadType {
 *   #if HAVE_DATE_TIME_OFFSET
 *       ReadAsDateTimeOffset,
 *   #endif
 *       ReadAsDouble,
 *   }
 *
 * It emits an ERROR that, for a nested enum, detaches the *enclosing class's*
 * member list, so most of the class's methods drop out of the index. Removing
 * the directive lines (keeping the guarded code) sidesteps it. Both branches of
 * an `#if/#else` are kept — the same behaviour the previous grammar produced,
 * and the right default for a code graph (index every symbol regardless of
 * build flags). Replacement preserves byte offsets (directive text → spaces,
 * newlines kept) so every symbol's line/column stays exact. (#237)
 */
export declare function blankCsharpPreprocessorDirectives(source: string): string;
export declare const csharpExtractor: LanguageExtractor;
//# sourceMappingURL=csharp.d.ts.map