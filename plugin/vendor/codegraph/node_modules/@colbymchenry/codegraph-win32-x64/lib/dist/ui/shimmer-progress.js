"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createShimmerProgress = createShimmerProgress;
const worker_threads_1 = require("worker_threads");
const path = __importStar(require("path"));
const color_1 = require("./color");
const glyphs_1 = require("./glyphs");
const PHASE_NAMES = {
    scanning: 'Scanning files',
    parsing: 'Parsing code',
    storing: 'Storing data',
    resolving: 'Resolving refs',
    linking: 'Linking dynamic dispatch',
};
function createShimmerProgress() {
    // Piped/redirected stdout: `\r`-rewriting animation frames are garbage in a
    // log file — emit one plain line per phase instead (#1281).
    if (process.stdout.isTTY !== true) {
        return createPlainProgress();
    }
    const useColor = (0, color_1.ansiColorsEnabled)();
    const G = (0, glyphs_1.getGlyphs)();
    const DM = useColor ? '\x1b[2m' : '';
    const GRN = useColor ? '\x1b[32m' : '';
    const RST = useColor ? '\x1b[0m' : '';
    let lastPhase = '';
    let lastPhaseName = '';
    let lastPercent = -1;
    let lastCount = 0;
    // The persistent "phase done" lines — the ones that stay in scrollback —
    // are printed HERE, on the main thread, not by the worker. process.stdout
    // reaches a Windows console through the wide-char API, so these lines can
    // carry the same Unicode glyphs @clack/prompts draws around them (#398);
    // the worker's raw fs.writeSync path can't (codepage mojibake, #168) and is
    // now used only for the transient, self-erasing animation frames. The main
    // thread is guaranteed alive here: phase changes arrive via its own
    // progress callback.
    const printPhaseDone = () => {
        if (!lastPhaseName)
            return;
        let detail = '';
        if (lastPercent >= 0)
            detail = ` ${G.dash} done`;
        else if (lastCount > 0)
            detail = ` ${G.dash} ${lastCount.toLocaleString()} found`;
        // Leading \r + erase clears the worker's in-flight animation line; one
        // atomic write so a worker frame can't interleave mid-line.
        process.stdout.write(`\r\x1b[K${DM}${G.rail}${RST}  ${GRN}${G.phaseDone}${RST} ${lastPhaseName}${detail}\n`);
        lastPhaseName = '';
        lastPercent = -1;
        lastCount = 0;
    };
    const workerPath = path.join(__dirname, 'shimmer-worker.js');
    const worker = new worker_threads_1.Worker(workerPath, {
        // colors:false keeps the animation (still an interactive TTY) but drops
        // the ANSI color codes, honoring NO_COLOR / --no-color (#1281).
        workerData: { startTime: Date.now(), colors: useColor },
    });
    return {
        onProgress(progress) {
            const phaseName = PHASE_NAMES[progress.phase] || progress.phase;
            if (progress.phase !== lastPhase && lastPhase) {
                printPhaseDone();
            }
            lastPhase = progress.phase;
            lastPhaseName = phaseName;
            let percent = -1;
            let count = 0;
            if (progress.total > 0) {
                percent = Math.round((progress.current / progress.total) * 100);
            }
            else if (progress.current > 0) {
                count = progress.current;
            }
            lastPercent = percent;
            lastCount = count;
            worker.postMessage({
                type: 'update',
                phase: progress.phase,
                phaseName,
                percent,
                count,
            });
        },
        stop() {
            return new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled)
                        return;
                    settled = true;
                    // Worker has cleared (or been terminated off) the animation line;
                    // persist the final phase's done-line from the main thread.
                    printPhaseDone();
                    resolve();
                };
                const timeout = setTimeout(() => {
                    worker.terminate().then(finish);
                }, 2000);
                worker.on('message', (msg) => {
                    if (msg.type === 'stopped') {
                        clearTimeout(timeout);
                        worker.terminate().then(finish);
                    }
                });
                worker.postMessage({ type: 'stop' });
            });
        },
    };
}
/**
 * Non-TTY fallback: one plain line per phase, no rewrites, no ANSI.
 * Completion details (counts, timings) are printed by the caller's result
 * summary, so phase starts are all that's worth logging here.
 */
function createPlainProgress() {
    let lastPhase = '';
    return {
        onProgress(progress) {
            if (progress.phase === lastPhase)
                return;
            lastPhase = progress.phase;
            const phaseName = PHASE_NAMES[progress.phase] || progress.phase;
            process.stdout.write(`${phaseName}...\n`);
        },
        stop() {
            return Promise.resolve();
        },
    };
}
//# sourceMappingURL=shimmer-progress.js.map