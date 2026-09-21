/**
 * Native-kernel buffer layout — TS mirror of codegraph-kernel/src/buffers.rs.
 *
 * The kernel returns five Buffers per file: meta, nodes, edges, refs, arena.
 * Rows are fixed-width little-endian; strings are (offset, len) pairs into
 * the UTF-8 arena; `offset === NONE` means "field absent".
 *
 * THIS FILE AND buffers.rs MUST MATCH BYTE FOR BYTE. Any layout change bumps
 * KERNEL_ABI_VERSION on both sides — the loader refuses a version it doesn't
 * know and the extraction path falls back to wasm.
 *
 * NodeKind / EdgeKind / provenance / visibility cross the boundary as indexes
 * into NODE_KINDS / EDGE_KINDS (src/types.ts) and the small tables below, so
 * those array orders are part of the contract (append, never reorder). The
 * loader additionally verifies the kernel's own kind tables against
 * NODE_KINDS/EDGE_KINDS at load time, so a stale .node degrades to the wasm
 * path instead of mis-decoding.
 */
export declare const KERNEL_ABI_VERSION = 2;
/** Sentinel for "absent" in u32 slots and string-ref offsets. */
export declare const NONE = 4294967295;
export declare const META_SIZE = 36;
export declare const NODE_ROW_SIZE = 96;
export declare const EDGE_ROW_SIZE = 44;
export declare const REF_ROW_SIZE = 40;
/** meta byte offsets */
export declare const META: {
    readonly version: 0;
    readonly nodeCount: 4;
    readonly edgeCount: 8;
    readonly refCount: 12;
    readonly arenaLen: 16;
    readonly errorsOff: 20;
    readonly errorsLen: 24;
    readonly durationMs: 28;
};
/** node row byte offsets */
export declare const NODE: {
    readonly kind: 0;
    readonly visibility: 1;
    readonly flags: 2;
    readonly startLine: 4;
    readonly endLine: 8;
    readonly startColumn: 12;
    readonly endColumn: 16;
    readonly name: 20;
    readonly qualifiedName: 28;
    readonly id: 36;
    readonly docstring: 44;
    readonly signature: 52;
    readonly decorators: 60;
    readonly typeParameters: 68;
    readonly returnType: 76;
    readonly extraJson: 84;
    readonly metrics: 92;
};
/** edge row byte offsets */
export declare const EDGE: {
    readonly sourceIdx: 0;
    readonly targetIdx: 4;
    readonly kind: 8;
    readonly provenance: 9;
    readonly line: 12;
    readonly column: 16;
    readonly metadataJson: 20;
    readonly sourceIdStr: 28;
    readonly targetIdStr: 36;
};
/** ref row byte offsets */
export declare const REF: {
    readonly fromIdx: 0;
    readonly kind: 4;
    readonly flags: 5;
    readonly line: 8;
    readonly column: 12;
    readonly referenceName: 16;
    readonly candidates: 24;
    readonly fromIdStr: 32;
};
/** ReferenceKind wire code for the internal-only `function_ref` (#756). */
export declare const FUNCTION_REF_CODE = 200;
/**
 * Ref-row flag bits (v2). FILE_PATH: the ref carries `filePath` = the
 * extracted file — the ruby/php visitNode hooks set `filePath: ctx.filePath`
 * on their mixin/trait `implements` refs (unlike every other extraction ref,
 * which the store denormalizes); decode re-attaches its own filePath
 * parameter, which is byte-identical.
 */
export declare const REF_FLAG_FILE_PATH = 1;
/** Node bool-flag bit pairs: bit(2n) = present, bit(2n+1) = value. */
export declare const FLAG: {
    readonly isExported: 0;
    readonly isAsync: 1;
    readonly isStatic: 2;
    readonly isAbstract: 3;
};
/** visibility byte values (0 = absent). */
export declare const VISIBILITIES: readonly [undefined, "public", "private", "protected", "internal"];
/** provenance byte values (0 = absent). */
export declare const PROVENANCES: readonly [undefined, "tree-sitter", "scip", "heuristic"];
//# sourceMappingURL=layout.d.ts.map