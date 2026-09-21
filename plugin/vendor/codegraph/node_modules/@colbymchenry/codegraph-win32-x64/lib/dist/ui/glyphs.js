"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASCII_GLYPHS = exports.UNICODE_GLYPHS = void 0;
exports.supportsUnicode = supportsUnicode;
exports.getGlyphs = getGlyphs;
exports.supportsUnicodeRawWrites = supportsUnicodeRawWrites;
exports.getRawWriteGlyphs = getRawWriteGlyphs;
exports._resetGlyphsCache = _resetGlyphsCache;
function supportsUnicode() {
    if (process.env.CODEGRAPH_ASCII === '1')
        return false;
    if (process.env.CODEGRAPH_UNICODE === '1')
        return true;
    if (process.platform === 'win32') {
        const env = process.env;
        return Boolean(env.CI ||
            env.WT_SESSION || // Windows Terminal
            env.TERMINUS_SUBLIME ||
            env.ConEmuTask === '{cmd::Cmder}' || // ConEmu and cmder
            env.TERM_PROGRAM === 'Terminus-Sublime' ||
            env.TERM_PROGRAM === 'vscode' ||
            env.TERM === 'xterm-256color' ||
            env.TERM === 'alacritty' ||
            env.TERMINAL_EMULATOR === 'JetBrains-JediTerm');
    }
    return process.env.TERM !== 'linux';
}
exports.UNICODE_GLYPHS = {
    ok: '✓',
    err: '✗',
    info: 'ℹ',
    warn: '⚠',
    spinner: ['·', '✢', '✳', '✶', '✻', '✽'],
    barFilled: '█',
    barEmpty: '░',
    rail: '│',
    phaseDone: '◆',
    dash: '—',
    hLine: '─',
    treeBranch: '├── ',
    treeLast: '└── ',
    treePipe: '│   ',
};
exports.ASCII_GLYPHS = {
    ok: '[OK]',
    err: '[ERR]',
    info: '[i]',
    warn: '[!]',
    spinner: ['.', '*', '+', 'x', 'o', 'O'],
    barFilled: '#',
    barEmpty: '-',
    rail: '|',
    phaseDone: '*',
    dash: '-',
    hLine: '-',
    treeBranch: '|-- ',
    treeLast: '`-- ',
    treePipe: '|   ',
};
let cached = null;
function getGlyphs() {
    if (cached === null) {
        cached = supportsUnicode() ? exports.UNICODE_GLYPHS : exports.ASCII_GLYPHS;
    }
    return cached;
}
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
function supportsUnicodeRawWrites() {
    if (process.env.CODEGRAPH_ASCII === '1')
        return false;
    if (process.env.CODEGRAPH_UNICODE === '1')
        return true;
    if (process.platform === 'win32')
        return false;
    return process.env.TERM !== 'linux';
}
function getRawWriteGlyphs() {
    return supportsUnicodeRawWrites() ? exports.UNICODE_GLYPHS : exports.ASCII_GLYPHS;
}
/** Reset the cached glyph set. Test-only; production code should call `getGlyphs()`. */
function _resetGlyphsCache() {
    cached = null;
}
//# sourceMappingURL=glyphs.js.map