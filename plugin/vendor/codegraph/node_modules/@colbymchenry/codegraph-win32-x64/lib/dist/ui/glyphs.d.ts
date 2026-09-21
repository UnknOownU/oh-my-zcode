/**
 * Glyph selection for CLI output.
 *
 * On Windows, console output is interpreted via the active output
 * codepage. PowerShell 5.1 and cmd.exe in legacy conhost default to
 * OEM codepages (CP437, CP936, ...), so UTF-8 bytes written to the
 * console render as mojibake (see #168). The shimmer worker is hit
 * hardest because it uses `fs.writeSync(1, ...)` (raw bytes, no
 * TTY-aware encoding conversion) to keep animation smooth while the
 * main thread is blocked in SQLite. To stay readable everywhere, we
 * fall back to ASCII glyphs whenever the terminal is not known to
 * handle UTF-8.
 *
 * The Windows branch must agree with @clack/prompts (which bundles
 * `is-unicode-supported`): clack draws the outer `┌ │ └` frame around
 * init/index/sync output, and if it decides Unicode while we decide
 * ASCII, one block mixes `│` and `|` rails (#398). The terminals the
 * list recognizes (Windows Terminal, VS Code, ConEmu/Cmder, Alacritty,
 * JetBrains, Terminus, CI log viewers) all run with a UTF-8-capable
 * output path, so the raw-byte shimmer writes render correctly there
 * too; unrecognized Windows consoles keep the safe ASCII fallback —
 * and clack falls back to ASCII in those as well, so output stays
 * consistent in both directions.
 *
 * Detection:
 *   - `CODEGRAPH_ASCII=1`  -> ASCII (escape hatch for any terminal)
 *   - `CODEGRAPH_UNICODE=1` -> Unicode (opt-in on any terminal)
 *   - Windows              -> mirror is-unicode-supported (see above)
 *   - Linux kernel console (`TERM=linux`) -> ASCII
 *   - Everything else      -> Unicode
 */
export declare function supportsUnicode(): boolean;
export interface Glyphs {
    ok: string;
    err: string;
    info: string;
    warn: string;
    spinner: string[];
    barFilled: string;
    barEmpty: string;
    rail: string;
    phaseDone: string;
    dash: string;
    hLine: string;
    treeBranch: string;
    treeLast: string;
    treePipe: string;
}
export declare const UNICODE_GLYPHS: Glyphs;
export declare const ASCII_GLYPHS: Glyphs;
export declare function getGlyphs(): Glyphs;
/**
 * Unicode support for the RAW console write path — `fs.writeSync(1, ...)`,
 * used only by the shimmer worker's transient animation frames. Raw bytes
 * bypass Node's TTY-aware conversion and get decoded by the ACTIVE CONSOLE
 * CODEPAGE on Windows; OEM codepages (CP437, CP936, ...) mojibake UTF-8
 * there even inside Windows Terminal, whose ConPTY still decodes app output
 * with the session codepage (#168). So the raw path stays ASCII on every
 * Windows terminal unless the user opts in via CODEGRAPH_UNICODE=1 —
 * independent of `supportsUnicode()`, which governs the codepage-immune
 * main-thread writes (`process.stdout` uses the wide-char console API).
 */
export declare function supportsUnicodeRawWrites(): boolean;
export declare function getRawWriteGlyphs(): Glyphs;
/** Reset the cached glyph set. Test-only; production code should call `getGlyphs()`. */
export declare function _resetGlyphsCache(): void;
//# sourceMappingURL=glyphs.d.ts.map