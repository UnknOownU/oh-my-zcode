"use strict";
/**
 * Native-kernel loader — finds, loads, and contract-verifies the
 * codegraph-kernel .node addon.
 *
 * The kernel is OPTIONAL everywhere. Every failure mode here (no binary for
 * this platform, dlopen error, ABI/kind-table mismatch) resolves to `null`
 * and the extraction path silently keeps using the wasm pipeline — a missing
 * or stale kernel must never break indexing, only skip the speedup. Set
 * CODEGRAPH_KERNEL_DEBUG=1 to see why a kernel didn't load.
 *
 * Kill switch: CODEGRAPH_KERNEL=0 disables the kernel entirely (checked per
 * call so tests and embedders can flip it at runtime).
 *
 * Search order:
 *   1. CODEGRAPH_KERNEL_PATH — explicit .node path (dev/testing override)
 *   2. <up3>/kernel/codegraph-kernel.node — the release bundle layout
 *      (lib/dist/** next to lib/kernel/; see scripts/build-bundle.sh)
 *   3. <up3>/codegraph-kernel/prebuilds/<platform>-<arch>/codegraph-kernel.node
 *      — from-source runs and tests (staged by scripts/build-kernel.sh)
 *
 * "up3" = three directories above this file, which is the package root both
 * from src/extraction/kernel/ and from dist/extraction/kernel/.
 */
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
exports.getKernel = getKernel;
exports.kernelSupports = kernelSupports;
exports.resetKernelForTests = resetKernelForTests;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const module_1 = require("module");
const types_1 = require("../../types");
const layout_1 = require("./layout");
const debugEnabled = () => process.env.CODEGRAPH_KERNEL_DEBUG === '1';
function debug(msg) {
    if (debugEnabled())
        process.stderr.write(`[codegraph-kernel] ${msg}\n`);
}
/** Languages the loaded binary supports (contract-verified). Empty when no kernel. */
let kernelLanguages = new Set();
/** undefined = not attempted yet; null = attempted and unavailable. */
let cached;
function candidatePaths() {
    const candidates = [];
    if (process.env.CODEGRAPH_KERNEL_PATH)
        candidates.push(process.env.CODEGRAPH_KERNEL_PATH);
    const packageRoot = path.resolve(__dirname, '..', '..', '..');
    candidates.push(path.join(packageRoot, 'kernel', 'codegraph-kernel.node'));
    candidates.push(path.join(packageRoot, 'codegraph-kernel', 'prebuilds', `${process.platform}-${process.arch}`, 'codegraph-kernel.node'));
    return candidates;
}
/**
 * Verify the binary speaks our wire contract: same ABI version and byte-equal
 * NodeKind/EdgeKind tables (kinds cross the boundary as indexes into these).
 */
function verifyContract(mod, from) {
    const info = mod.contractInfo();
    if (info.abiVersion !== layout_1.KERNEL_ABI_VERSION) {
        debug(`${from}: ABI ${info.abiVersion} != expected ${layout_1.KERNEL_ABI_VERSION} — ignoring kernel`);
        return false;
    }
    const sameTable = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (!sameTable(info.nodeKinds, types_1.NODE_KINDS) || !sameTable(info.edgeKinds, types_1.EDGE_KINDS)) {
        debug(`${from}: NodeKind/EdgeKind tables differ from src/types.ts — ignoring kernel`);
        return false;
    }
    return true;
}
/**
 * Load (once per process) and return the kernel module, or null when
 * unavailable. The kill switch is NOT checked here — callers route through
 * `kernelAvailable()` / `tryKernelExtract()` which check it per call.
 */
function getKernel() {
    if (cached !== undefined)
        return cached;
    cached = null;
    for (const candidate of candidatePaths()) {
        try {
            if (!fs.existsSync(candidate))
                continue;
            // createRequire: works identically from CJS output and future ESM.
            const req = (0, module_1.createRequire)(__filename);
            const mod = req(candidate);
            if (typeof mod.extractFile !== 'function' || typeof mod.contractInfo !== 'function') {
                debug(`${candidate}: missing expected exports — ignoring`);
                continue;
            }
            if (!verifyContract(mod, candidate))
                continue;
            kernelLanguages = new Set(mod.contractInfo().languages);
            debug(`loaded ${candidate} (languages: ${[...kernelLanguages].join(', ')})`);
            cached = mod;
            break;
        }
        catch (err) {
            debug(`${candidate}: failed to load — ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return cached;
}
/** True when the kill switch is off, a verified binary is loaded, and it supports `language`. */
function kernelSupports(language) {
    if (process.env.CODEGRAPH_KERNEL === '0')
        return false;
    return getKernel() !== null && kernelLanguages.has(language);
}
/** Test hook: forget the loaded module so a changed env is re-evaluated. */
function resetKernelForTests() {
    cached = undefined;
    kernelLanguages = new Set();
}
//# sourceMappingURL=loader.js.map