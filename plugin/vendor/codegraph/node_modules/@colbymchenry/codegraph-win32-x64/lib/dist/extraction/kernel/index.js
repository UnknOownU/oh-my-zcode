"use strict";
/**
 * Kernel routing — which languages go through the native kernel, and the
 * single entry point the extraction path calls.
 *
 * Routing policy is deliberately TS-side and per-language (migration plan §2):
 * a language routes to the kernel only after its equivalence gate passes;
 * everything else stays on the wasm path forever if need be. Rollback per
 * language = removing it from DEFAULT_ROUTED (or CODEGRAPH_KERNEL=0 for all).
 *
 * Routing status: TypeScript/TSX/JavaScript/JSX are default-routed (R3 gate
 * passed 2026-07-16 — full-index dumps byte-identical on express/excalidraw/
 * vscode, control repo unchanged; see the migration plan §4a). Override with
 *   CODEGRAPH_KERNEL_LANGS=<langs|all>  (replaces the default set), or
 *   CODEGRAPH_KERNEL=0                  (kill switch, everything → wasm).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeExtractBuffers = exports.resetKernelForTests = exports.kernelSupports = exports.getKernel = void 0;
exports.kernelRoutes = kernelRoutes;
exports.takeDeferredPreParse = takeDeferredPreParse;
exports.tryKernelExtractRaw = tryKernelExtractRaw;
exports.materializeKernelResult = materializeKernelResult;
exports.tryKernelExtract = tryKernelExtract;
const languages_1 = require("../languages");
const loader_1 = require("./loader");
const decode_1 = require("./decode");
const layout_1 = require("./layout");
var loader_2 = require("./loader");
Object.defineProperty(exports, "getKernel", { enumerable: true, get: function () { return loader_2.getKernel; } });
Object.defineProperty(exports, "kernelSupports", { enumerable: true, get: function () { return loader_2.kernelSupports; } });
Object.defineProperty(exports, "resetKernelForTests", { enumerable: true, get: function () { return loader_2.resetKernelForTests; } });
var decode_2 = require("./decode");
Object.defineProperty(exports, "decodeExtractBuffers", { enumerable: true, get: function () { return decode_2.decodeExtractBuffers; } });
/**
 * Languages routed to the kernel by default (gate-passed only — see the
 * per-language tracker in docs/design/rust-kernel-migration-plan.md §4).
 * Per-file safety valve regardless of routing: a file whose parse tree
 * contains ERRORS defers to the wasm extractor (error recovery differs
 * between UTF-8 and UTF-16 parsing — wasm's recovery is canonical).
 */
const DEFAULT_ROUTED = new Set([
    'typescript',
    'tsx',
    'javascript',
    'jsx',
    'java',
    'python',
    'go',
    // R7a (2026-07-17): parity swept 0-diff on redis/git/fmt/protobuf/ALS
    // (2,389 files compared) + full-init dump-diffs byte-identical; erroring
    // files defer per-file to wasm (routine for macro-heavy C/C++ — see
    // scripts/kernel-parity.mjs --max-deferral).
    'c',
    'cpp',
    // R7b (2026-07-20): parity swept 0-diff on ripgrep/tokio/rust-analyzer
    // (2,108 files byte-parity) + full-init dump-diffs byte-identical. Rust
    // deferral is ~0% on normal repos; token-macro-table sources (rust-analyzer's
    // parser crates, 18%) error on BOTH arms — grammar-inherent, not a walker
    // signal.
    'rust',
    // R7b (2026-07-20): parity swept 0-diff on serilog/Newtonsoft.Json/jellyfin
    // (3,229 files byte-parity) + full-init dump-diffs byte-identical ×3.
    // Deferral 0.05–3.3% — both-branches-kept `#if` damage that errors on BOTH
    // arms (the preParse blanking hoist keeps the kernel's input identical).
    'csharp',
    // R7b (2026-07-20): parity swept 0-diff on sinatra/jekyll/rails (3,763
    // files byte-parity, 0 deferrals — ruby error incidence is 0.00%) +
    // full-init dump-diffs byte-identical ×3. Any deferral on a ruby sweep is
    // a walker-bug signal, not grammar reality.
    'ruby',
    // R7b (2026-07-20): parity swept 0-diff on monolog/laravel-framework/
    // symfony (13,950 files byte-parity) + full-init dump-diffs byte-identical
    // ×3. Deferral ≈0–0.1% (genuinely-broken fixtures) — default sweep guard.
    'php',
    // R7b (2026-07-20): parity swept 0-diff on Alamofire/vapor/swift-nio (720
    // clean files byte-parity; Alamofire's 348 #1020 property nodes reproduced
    // exactly) + full-init dump-diffs byte-identical ×3. Swift error incidence
    // is structurally 9–27% on BOTH arms (heavy #if conditionalization) —
    // sweeps run --max-deferral 0.3; a deferral-rate JUMP is the bug signal.
    'swift',
    // R7b (2026-07-20): parity swept 0-diff on okio/okhttp/kotlinx.coroutines
    // (1,861 clean files byte-parity; KMP expect/actual synthesis identical —
    // 412 edges both arms on kotlinx.coroutines) + full-init dump-diffs
    // byte-identical ×3. Deferral 4.7–8.5% both-arm grammar reality
    // (fun-interface misparses + PHANTOM hasError files) — default sweep guard
    // holds; a JUMP past ~10% is the bug signal.
    'kotlin',
    // R7b batch 4 (2026-07-20): parity swept 0-diff on dplyr/ggplot2/shiny +
    // AnomalyDetection + full-init dump-diffs byte-identical ×3. R error
    // incidence is ~0% (deferrals 0/0/0/1 across the gate repos — the 1 is a
    // moustache-template pseudo-R file, both-arm): any deferral on an R sweep
    // is a walker-bug signal, not grammar reality.
    'r',
    // R7b batch 4 (2026-07-20): one walker, two dialects. Parity swept 0-diff
    // on kong/lazy.nvim/lua-resty-core (lua) + lune/Fusion (luau) + full-init
    // dump-diffs byte-identical. Lua error incidence ~0% (any deferral is a
    // walker-bug signal); luau 1.4–7.1% both-arm grammar reality (generic type
    // packs, default type params) — a JUMP past ~10% is the bug signal.
    'lua',
    'luau',
    // R7b batch 4 (2026-07-20): parity swept 0-diff on os-lib/cats + scala3
    // compiler/src + library/src + full-init dump-diffs byte-identical.
    // Error incidence is bimodal: mainstream Scala-2-style repos ~0-2%
    // (os-lib 0%, cats 1.8%) but scala-3-frontier code runs 10-18% with
    // PHANTOM-dominated error sets (hasError=true, zero ERROR nodes —
    // capture-checking `^` types; defer on the FLAG). Sweeps over
    // scala3-style repos use --max-deferral 0.3 (swift precedent); a
    // deferral JUMP on cats/os-lib-style code is the bug signal.
    'scala',
    // R7b batch 4 (2026-07-20): parity swept 0-diff on shelf/bloc/flutter +
    // full-init dump-diffs byte-identical. Error incidence 3.4-20.7% both-arm
    // grammar reality (empty object patterns — the sealed-class idiom — and
    // unnamed `library;` dominate; flutter sits at ~21%) — sweeps use
    // --max-deferral 0.3; the RATE, not the count, is the signal (flutter
    // HEAD drifts).
    'dart',
]);
const POST_PASSES = {
// (none yet — R2+)
};
/**
 * The preParse hoist (checklist §arch-1): languages with an offset-preserving
 * `preParse` hook (c/cpp macro blanking, csharp #237, metal #1121, cuda #1172)
 * apply it HERE, before the kernel call, so both arms parse identical blanked
 * bytes and none of the blanking logic needs a Rust port. The wasm fallback
 * path is untouched — TreeSitterExtractor applies the same hook itself on the
 * RAW source it receives, so a kernel error/defer still extracts identically.
 * Every blank is an equal-length-space replacement, so offsets, lines, and
 * columns survive; `filePath` rides along for the extension-gated dialect
 * blanks (`.metal` attributes; `.cu`/`.cuh` + content-gated CUDA).
 */
function preParsedSource(filePath, source, language) {
    const pre = languages_1.EXTRACTORS[language]?.preParse;
    return pre ? pre(source, filePath) : source;
}
function isRouted(language) {
    const env = process.env.CODEGRAPH_KERNEL_LANGS;
    if (env === undefined || env === '')
        return DEFAULT_ROUTED.has(language);
    if (env === 'all')
        return true;
    return env
        .split(',')
        .map((s) => s.trim())
        .includes(language);
}
/** True when `language` would be extracted by the kernel right now. */
function kernelRoutes(language) {
    return isRouted(language) && (0, loader_1.kernelSupports)(language);
}
/** Warned-once registry so a broken language logs a single line, not one per file. */
const warned = new Set();
/**
 * One-slot defer memo. A file the kernel defers (parse errors → wasm) used to
 * pay the full pipeline again at every seam: the worker's raw try blanked +
 * native-parsed it, extractFromSource's kernel try blanked + native-parsed it
 * AGAIN, and the wasm extractor then re-applied preParse a third time. On a
 * high-deferral tree (the Linux kernel defers ~79% of files) that waste
 * dominated the arm's parse phase. The slot remembers the LAST deferred
 * (file, source, language) so (a) a repeat kernel attempt for the same file
 * short-circuits to null, and (b) the wasm fallback can reuse the
 * already-blanked source instead of re-running preParse. Source is matched by
 * string identity — the worker passes the same string through every seam.
 */
let deferSlot = null;
/** The hoisted preParse output for a just-deferred file, if it matches. */
function takeDeferredPreParse(filePath, source, language) {
    if (deferSlot &&
        deferSlot.filePath === filePath &&
        deferSlot.source === source &&
        deferSlot.language === language) {
        return deferSlot.pre;
    }
    return null;
}
/**
 * Extract via the kernel WITHOUT decoding — the bulk-index fast path. The
 * tables ride to the store boundary as buffers (decoded on the store worker),
 * so the main thread never materializes per-node objects. Returns null under
 * exactly the conditions tryKernelExtract does, PLUS when the language has a
 * registered post() pass (post passes operate on decoded results, so those
 * languages keep the decoded path).
 */
function tryKernelExtractRaw(filePath, source, language) {
    if (!kernelRoutes(language) || POST_PASSES[language])
        return null;
    const kernel = (0, loader_1.getKernel)();
    if (!kernel)
        return null;
    if (takeDeferredPreParse(filePath, source, language) !== null)
        return null; // already deferred
    const pre = preParsedSource(filePath, source, language);
    try {
        const buffers = kernel.extractFile(filePath, pre, language);
        const meta = buffers.meta;
        if (meta.readUInt8(layout_1.META.version) !== layout_1.KERNEL_ABI_VERSION) {
            throw new Error(`kernel buffer ABI ${meta.readUInt8(0)} != expected ${layout_1.KERNEL_ABI_VERSION}`);
        }
        const counts = {
            nodes: meta.readUInt32LE(layout_1.META.nodeCount),
            edges: meta.readUInt32LE(layout_1.META.edgeCount),
            refs: meta.readUInt32LE(layout_1.META.refCount),
        };
        let errors = [];
        const errorsOff = meta.readUInt32LE(layout_1.META.errorsOff);
        if (errorsOff !== layout_1.NONE) {
            const errorsLen = meta.readUInt32LE(layout_1.META.errorsLen);
            errors = JSON.parse(buffers.arena.toString('utf8', errorsOff, errorsOff + errorsLen));
        }
        return { buffers, counts, errors };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('defer:')) {
            deferSlot = { filePath, source, language, pre };
            return null;
        }
        if (!warned.has(language)) {
            warned.add(language);
            process.stderr.write(`[codegraph-kernel] ${language} extraction failed (${message}) — falling back to the wasm path\n`);
        }
        return null;
    }
}
/**
 * Decode a buffer-carrying result (see ExtractionResult.kernelBuffers) into a
 * plain, fully-materialized ExtractionResult — the fallback for store paths
 * that need objects (main-thread store, tests).
 */
function materializeKernelResult(result, filePath, language) {
    if (!result.kernelBuffers)
        return result;
    const b = result.kernelBuffers;
    const asBuf = (u) => Buffer.from(u.buffer, u.byteOffset, u.byteLength);
    const decoded = (0, decode_1.decodeExtractBuffers)({ meta: asBuf(b.meta), nodes: asBuf(b.nodes), edges: asBuf(b.edges), refs: asBuf(b.refs), arena: asBuf(b.arena) }, filePath, language);
    decoded.durationMs = result.durationMs;
    return decoded;
}
/**
 * Extract via the native kernel. Returns null when the kernel doesn't apply
 * (not routed / not available / kill switch) — the caller falls back to the
 * wasm TreeSitterExtractor. A kernel ERROR on a routed file also returns
 * null: per-file fallback keeps indexing correct while a kernel bug costs
 * only that file's speedup.
 */
function tryKernelExtract(filePath, source, language) {
    if (!kernelRoutes(language))
        return null;
    const kernel = (0, loader_1.getKernel)();
    if (!kernel)
        return null;
    if (takeDeferredPreParse(filePath, source, language) !== null)
        return null; // already deferred
    const t0 = Date.now();
    const pre = preParsedSource(filePath, source, language);
    try {
        const buffers = kernel.extractFile(filePath, pre, language);
        const result = (0, decode_1.decodeExtractBuffers)(buffers, filePath, language);
        POST_PASSES[language]?.(result, source);
        result.durationMs = Date.now() - t0;
        return result;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // `defer:` is the kernel's expected-routing signal (files with parse
        // errors take the wasm path — its error RECOVERY is the canonical one;
        // recovery differs between UTF-8 and UTF-16 parsing). Silent by design.
        if (message.includes('defer:')) {
            deferSlot = { filePath, source, language, pre };
            return null;
        }
        if (!warned.has(language)) {
            warned.add(language);
            process.stderr.write(`[codegraph-kernel] ${language} extraction failed (${message}) — falling back to the wasm path\n`);
        }
        return null;
    }
}
//# sourceMappingURL=index.js.map