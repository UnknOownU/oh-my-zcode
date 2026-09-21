export interface BoundaryMatch {
    /** Stable form id, e.g. 'computed-call' — used for per-form dedupe. */
    form: string;
    /** Human label for the dispatch form, e.g. 'computed member call'. */
    label: string;
    /** One-line source snippet of the site (from the original, untrimmed text). */
    snippet: string;
    /** 1-based line within the scanned body's FILE (absolute, ready to print). */
    line: number;
    /**
     * Statically-visible dispatch key, when one exists: the string literal in
     * `handlers['save']`, the `:symbol` in ruby `send`, the type name in
     * `Send(new CreateCmd(...))`. Drives candidate lookup. Undefined when the
     * key is a runtime value (variable, computed expression).
     */
    key?: string;
    /** For typed-bus matches the key is a TYPE name (candidates ~ `${key}Handler`). */
    keyIsType?: boolean;
    /** Additional sites of the same form+key in this body beyond the reported one. */
    moreSites?: number;
}
/**
 * Blank the CONTENTS of string literals (quotes preserved, offsets preserved)
 * so dispatch-shaped prose — docs, error messages, template text — can't fire
 * a matcher. Run AFTER comment stripping (comments are already spaces).
 * Backslash escapes are honored; `'`/`"` strings end at a newline (treated as
 * unterminated, matching the comment stripper); backticks span lines, and
 * `${...}` interpolations inside them are blanked too — missing a dispatch
 * inside a template literal is acceptable, false-firing on prose is not.
 */
export declare function blankStringContents(text: string): string;
/**
 * Scan one symbol's body for dynamic-dispatch sites.
 *
 * @param body       the symbol's source text (sliced from the file)
 * @param language   Node.language of the symbol
 * @param fileStartLine 1-based line where `body` starts in its file — returned
 *                      line numbers are absolute file lines.
 */
export declare function scanDynamicDispatch(body: string, language: string, fileStartLine: number): BoundaryMatch[];
//# sourceMappingURL=dynamic-boundaries.d.ts.map