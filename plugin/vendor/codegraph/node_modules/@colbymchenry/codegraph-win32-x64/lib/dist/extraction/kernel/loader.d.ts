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
/** Raw buffer tables for one file — see layout.ts for the byte layout. */
export interface KernelBuffers {
    meta: Buffer;
    nodes: Buffer;
    edges: Buffer;
    refs: Buffer;
    arena: Buffer;
}
export interface KernelContractInfo {
    abiVersion: number;
    kernelVersion: string;
    nodeKinds: string[];
    edgeKinds: string[];
    languages: string[];
}
export interface KernelGrammarInfo {
    abiVersion: number;
    nodeKindCount: number;
    fieldCount: number;
    nodeKinds: string[];
    fieldNames: string[];
}
/** Input to the cFnPtr extraction sweep: one file's raw text + its struct
 *  node extents (`endLine ?? startLine` applied by the caller). */
export interface CfnptrFileIn {
    text: string;
    structs: {
        id: string;
        startLine: number;
        endLine: number;
    }[];
}
/** Per-file facts from the native cFnPtr extraction sweep — mirror of the
 *  Rust `CfnptrFacts` (see codegraph-kernel/src/cfnptr.rs); semantics match
 *  the JS sweep in src/resolution/c-fnptr-synthesizer.ts. */
export interface CfnptrFactsOut {
    fnPtrTypedefs: string[];
    fnTypeTypedefs: string[];
    structs: {
        id: string;
        parsed: boolean;
        fields: {
            name: string;
            index: number;
            ptr: boolean;
            type: string;
        }[];
    }[];
    inlinePtr: boolean;
    inlineTypes: string[];
    inlineTags: string[];
    initTokens: string[];
    arrayElems: string[];
    aliasNames: string[];
    dPairs: string[];
    dispatchFields: string[];
    arrayDispatchNames: string[];
    includes: string[];
}
export interface KernelModule {
    extractFile(filePath: string, content: string, language: string): KernelBuffers;
    contractInfo(): KernelContractInfo;
    grammarInfo(language: string): KernelGrammarInfo | null;
    /** Batched cFnPtr extraction sweep (task #5 step 2). OPTIONAL: absent on
     *  older binaries — callers feature-detect and keep their JS path. */
    cfnptrScanFiles?(files: CfnptrFileIn[]): CfnptrFactsOut[];
    /** Native `stripCommentsForRegex(text, 'c')` — differential-oracle hook. */
    cfnptrStripC?(text: string): string;
}
/**
 * Load (once per process) and return the kernel module, or null when
 * unavailable. The kill switch is NOT checked here — callers route through
 * `kernelAvailable()` / `tryKernelExtract()` which check it per call.
 */
export declare function getKernel(): KernelModule | null;
/** True when the kill switch is off, a verified binary is loaded, and it supports `language`. */
export declare function kernelSupports(language: string): boolean;
/** Test hook: forget the loaded module so a changed env is re-evaluated. */
export declare function resetKernelForTests(): void;
//# sourceMappingURL=loader.d.ts.map