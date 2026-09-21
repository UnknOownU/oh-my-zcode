"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const fs_1 = require("fs");
const glyphs_1 = require("./glyphs");
// Write directly to fd 1 (stdout) instead of writeStdout().
// In Node.js worker threads, process.stdout is proxied through the main
// thread's event loop — so if the main thread is blocked (e.g. SQLite),
// stdout writes from the worker queue up and the animation freezes.
// fs.writeSync(1, ...) is a direct kernel syscall that bypasses this.
//
// Side effect: bypasses Node's TTY-aware encoding conversion on Windows,
// so UTF-8 bytes hit the console raw and mojibake on OEM codepages.
// `getRawWriteGlyphs()` therefore always falls back to ASCII on Windows
// (#168). Everything this worker writes is transient — erased by the next
// frame or by the parent's phase-done line — so ASCII here never shows up
// in scrollback (#398); the persistent lines are printed by the parent
// through the codepage-immune process.stdout path.
function writeStdout(s) {
    (0, fs_1.writeSync)(1, s);
}
const G = (0, glyphs_1.getRawWriteGlyphs)();
const SPINNER_GLYPHS = G.spinner;
const ANIM_INTERVAL = 150;
const FRAMES_PER_GLYPH = 3;
// colors:false (NO_COLOR / --no-color on an interactive TTY, #1281) keeps the
// animation but drops every color/style code. `\r\x1b[K` line rewrites stay —
// they're cursor control, not color, and the parent only spawns this worker
// when stdout is a real TTY.
const COLORS = worker_threads_1.workerData.colors !== false;
const RST = COLORS ? '\x1b[0m' : '';
const DM = COLORS ? '\x1b[2m' : '';
const BOLD = COLORS ? '\x1b[1m' : '';
const startTime = worker_threads_1.workerData.startTime;
function animFrame() {
    return Math.floor((Date.now() - startTime) / ANIM_INTERVAL);
}
function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
}
function shimmerColor(frame) {
    if (!COLORS)
        return '';
    const t = (Math.sin(frame * 2 * Math.PI / 13) + 1) / 2;
    const r = lerp(160, 251, t);
    const g = lerp(100, 191, t);
    const b = lerp(9, 36, t);
    return `\x1b[38;2;${r};${g};${b}m${BOLD}`;
}
function formatNumber(n) {
    return n.toLocaleString();
}
function renderBar(frame, filled, empty) {
    if (filled === 0)
        return `${DM}${G.barEmpty.repeat(empty)}${RST}`;
    const cycleFrames = 24;
    const shimmerPos = ((frame % cycleFrames) / cycleFrames) * (filled + 6) - 3;
    const shimmerWidth = 3;
    let bar = '';
    for (let i = 0; i < filled; i++) {
        if (!COLORS) {
            bar += G.barFilled;
            continue;
        }
        const dist = Math.abs(i - shimmerPos);
        const t = Math.max(0, 1 - dist / shimmerWidth);
        const r = lerp(160, 251, t);
        const g = lerp(100, 191, t);
        const b = lerp(9, 36, t);
        bar += `\x1b[38;2;${r};${g};${b}m${BOLD}${G.barFilled}`;
    }
    bar += `${RST}${DM}${G.barEmpty.repeat(empty)}${RST}`;
    return bar;
}
// Mutable state
let currentMessage = '';
let currentPercent = -1;
let currentCount = 0;
function render() {
    if (!currentMessage)
        return;
    const frame = animFrame();
    const glyphIdx = Math.floor(frame / FRAMES_PER_GLYPH) % SPINNER_GLYPHS.length;
    const glyph = SPINNER_GLYPHS[glyphIdx] ?? SPINNER_GLYPHS[0] ?? '.';
    const color = shimmerColor(frame);
    let line;
    if (currentPercent >= 0) {
        const barWidth = 25;
        const filled = Math.round(barWidth * currentPercent / 100);
        const empty = barWidth - filled;
        line = `${DM}${G.rail}${RST}  ${color}${glyph}${RST} ${currentMessage}  ${renderBar(frame, filled, empty)}  ${currentPercent}%`;
    }
    else if (currentCount > 0) {
        line = `${DM}${G.rail}${RST}  ${color}${glyph}${RST} ${currentMessage}... ${formatNumber(currentCount)} found`;
    }
    else {
        line = `${DM}${G.rail}${RST}  ${color}${glyph}${RST} ${currentMessage}...`;
    }
    writeStdout(`\r\x1b[K${line}`);
}
// Clear the in-flight animation line. The persistent "phase done" line is
// printed by the PARENT on the main thread (TTY-aware, codepage-immune) —
// this worker's raw-byte path must never leave bytes in scrollback (#398).
function clearLine() {
    if (!currentMessage)
        return;
    writeStdout(`\r\x1b[K`);
    currentMessage = '';
    currentPercent = -1;
    currentCount = 0;
}
// Render loop — independent of main thread
const tickInterval = setInterval(render, 50);
worker_threads_1.parentPort.on('message', (msg) => {
    if (msg.type === 'update') {
        currentMessage = msg.phaseName;
        currentPercent = msg.percent;
        currentCount = msg.count;
    }
    else if (msg.type === 'stop') {
        clearInterval(tickInterval);
        clearLine();
        worker_threads_1.parentPort.postMessage({ type: 'stopped' });
    }
});
//# sourceMappingURL=shimmer-worker.js.map