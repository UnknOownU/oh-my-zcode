/**
 * Per-language comment stripper for framework route extractors.
 *
 * Replaces comment characters and string-literal contents that hide
 * routing-shaped text with spaces (NOT removal) so that source offsets
 * are preserved. This means `match.index` from a regex run on the
 * stripped output still maps to the same line in the original source.
 *
 * Example:
 *   Input:  "x = 1  # path('/fake/', V)\n real = 2"
 *   Output: "x = 1                       \n real = 2"
 *
 * Why strip strings/docstrings as well as comments? Python module/class
 * docstrings are a common source of false positives — they often contain
 * `path('/example/', View)` examples in usage docs. We treat triple-quoted
 * strings the same as comments. Single-line strings stay intact (a `#`
 * inside a Python string is NOT a comment).
 *
 * Scope: this is a pragmatic, regex-supporting helper, not a full parser.
 * It does NOT try to detect JS regex literals, Python f-string expressions,
 * or shell-style heredocs. Those edge cases are not load-bearing for the
 * `path(...)`, `Route::get(...)`, `app.get(...)` style patterns that
 * framework extractors scan for.
 */
export type CommentLang = 'python' | 'javascript' | 'typescript' | 'php' | 'ruby' | 'java' | 'csharp' | 'swift' | 'go' | 'rust' | 'c' | 'cpp' | 'erlang';
export declare function stripCommentsForRegex(content: string, lang: CommentLang): string;
//# sourceMappingURL=strip-comments.d.ts.map