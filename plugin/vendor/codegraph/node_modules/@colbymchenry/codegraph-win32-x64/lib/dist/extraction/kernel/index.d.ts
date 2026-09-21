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
import type { ExtractionResult, Language } from '../../types';
export { getKernel, kernelSupports, resetKernelForTests } from './loader';
export { decodeExtractBuffers } from './decode';
/**
 * Per-language TS post-pass over the decoded result — the escape hatch for
 * logic `.scm` queries can't express (macro salvage, dialect sniffing,
 * wrapper-based component recognition). Runs synchronously after decode,
 * before the framework extract() hooks the caller applies. Keep these SMALL:
 * anything heavy belongs in the Rust emitter.
 */
export type KernelPostPass = (result: ExtractionResult, source: string) => void;
/** True when `language` would be extracted by the kernel right now. */
export declare function kernelRoutes(language: Language): boolean;
/** The hoisted preParse output for a just-deferred file, if it matches. */
export declare function takeDeferredPreParse(filePath: string, source: string, language: Language): string | null;
/** The raw table buffers + the cheap facts the orchestrator needs pre-decode. */
export interface KernelRawResult {
    buffers: NonNullable<ExtractionResult['kernelBuffers']>;
    counts: {
        nodes: number;
        edges: number;
        refs: number;
    };
    errors: ExtractionResult['errors'];
}
/**
 * Extract via the kernel WITHOUT decoding — the bulk-index fast path. The
 * tables ride to the store boundary as buffers (decoded on the store worker),
 * so the main thread never materializes per-node objects. Returns null under
 * exactly the conditions tryKernelExtract does, PLUS when the language has a
 * registered post() pass (post passes operate on decoded results, so those
 * languages keep the decoded path).
 */
export declare function tryKernelExtractRaw(filePath: string, source: string, language: Language): KernelRawResult | null;
/**
 * Decode a buffer-carrying result (see ExtractionResult.kernelBuffers) into a
 * plain, fully-materialized ExtractionResult — the fallback for store paths
 * that need objects (main-thread store, tests).
 */
export declare function materializeKernelResult(result: ExtractionResult, filePath: string, language: Language): ExtractionResult;
/**
 * Extract via the native kernel. Returns null when the kernel doesn't apply
 * (not routed / not available / kill switch) — the caller falls back to the
 * wasm TreeSitterExtractor. A kernel ERROR on a routed file also returns
 * null: per-file fallback keeps indexing correct while a kernel bug costs
 * only that file's speedup.
 */
export declare function tryKernelExtract(filePath: string, source: string, language: Language): ExtractionResult | null;
//# sourceMappingURL=index.d.ts.map