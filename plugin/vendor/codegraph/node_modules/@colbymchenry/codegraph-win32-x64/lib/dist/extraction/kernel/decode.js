"use strict";
/**
 * Decode the kernel's flat buffers into an ExtractionResult — the single
 * JS-side pass over the per-file tables. See layout.ts for the byte layout
 * and codegraph-kernel/src/buffers.rs for the writer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeExtractBuffers = decodeExtractBuffers;
const types_1 = require("../../types");
const layout_1 = require("./layout");
/** Read an (offset, len) arena string; undefined when absent. */
function str(arena, row, at) {
    const off = row.readUInt32LE(at);
    if (off === layout_1.NONE)
        return undefined;
    const len = row.readUInt32LE(at + 4);
    return arena.toString('utf8', off, off + len);
}
/** NUL-joined list field; undefined when absent. */
function strList(arena, row, at) {
    const joined = str(arena, row, at);
    return joined === undefined ? undefined : joined.split('\0');
}
/** Tri-state boolean from a (present, value) bit pair. */
function flag(flags, pair) {
    if ((flags & (1 << (pair * 2))) === 0)
        return undefined;
    return (flags & (1 << (pair * 2 + 1))) !== 0;
}
function u32opt(row, at) {
    const v = row.readUInt32LE(at);
    return v === layout_1.NONE ? undefined : v;
}
function decodeExtractBuffers(buffers, filePath, language) {
    const { meta, arena } = buffers;
    if (meta.length < layout_1.META_SIZE)
        throw new Error(`kernel meta too short: ${meta.length}`);
    const version = meta.readUInt8(layout_1.META.version);
    if (version !== layout_1.KERNEL_ABI_VERSION) {
        throw new Error(`kernel buffer ABI ${version} != expected ${layout_1.KERNEL_ABI_VERSION}`);
    }
    const nodeCount = meta.readUInt32LE(layout_1.META.nodeCount);
    const edgeCount = meta.readUInt32LE(layout_1.META.edgeCount);
    const refCount = meta.readUInt32LE(layout_1.META.refCount);
    const now = Date.now();
    const nodes = new Array(nodeCount);
    // Node-table row index → node id, for edge/ref endpoint resolution.
    const idByRow = new Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        const row = buffers.nodes.subarray(i * layout_1.NODE_ROW_SIZE, (i + 1) * layout_1.NODE_ROW_SIZE);
        const id = str(arena, row, layout_1.NODE.id);
        idByRow[i] = id;
        const flags = row.readUInt16LE(layout_1.NODE.flags);
        const node = {
            id,
            kind: types_1.NODE_KINDS[row.readUInt8(layout_1.NODE.kind)],
            name: str(arena, row, layout_1.NODE.name),
            qualifiedName: str(arena, row, layout_1.NODE.qualifiedName),
            filePath,
            language,
            startLine: row.readUInt32LE(layout_1.NODE.startLine),
            endLine: row.readUInt32LE(layout_1.NODE.endLine),
            startColumn: row.readUInt32LE(layout_1.NODE.startColumn),
            endColumn: row.readUInt32LE(layout_1.NODE.endColumn),
            updatedAt: now,
        };
        const docstring = str(arena, row, layout_1.NODE.docstring);
        if (docstring !== undefined)
            node.docstring = docstring;
        const signature = str(arena, row, layout_1.NODE.signature);
        if (signature !== undefined)
            node.signature = signature;
        const visibility = layout_1.VISIBILITIES[row.readUInt8(layout_1.NODE.visibility)];
        if (visibility !== undefined)
            node.visibility = visibility;
        const isExported = flag(flags, layout_1.FLAG.isExported);
        if (isExported !== undefined)
            node.isExported = isExported;
        const isAsync = flag(flags, layout_1.FLAG.isAsync);
        if (isAsync !== undefined)
            node.isAsync = isAsync;
        const isStatic = flag(flags, layout_1.FLAG.isStatic);
        if (isStatic !== undefined)
            node.isStatic = isStatic;
        const isAbstract = flag(flags, layout_1.FLAG.isAbstract);
        if (isAbstract !== undefined)
            node.isAbstract = isAbstract;
        const decorators = strList(arena, row, layout_1.NODE.decorators);
        if (decorators !== undefined)
            node.decorators = decorators;
        const typeParameters = strList(arena, row, layout_1.NODE.typeParameters);
        if (typeParameters !== undefined)
            node.typeParameters = typeParameters;
        const returnType = str(arena, row, layout_1.NODE.returnType);
        if (returnType !== undefined)
            node.returnType = returnType;
        const extraJson = str(arena, row, layout_1.NODE.extraJson);
        if (extraJson !== undefined)
            Object.assign(node, JSON.parse(extraJson));
        nodes[i] = node;
    }
    const edges = new Array(edgeCount);
    for (let i = 0; i < edgeCount; i++) {
        const row = buffers.edges.subarray(i * layout_1.EDGE_ROW_SIZE, (i + 1) * layout_1.EDGE_ROW_SIZE);
        const sourceIdx = row.readUInt32LE(layout_1.EDGE.sourceIdx);
        const targetIdx = row.readUInt32LE(layout_1.EDGE.targetIdx);
        const edge = {
            source: sourceIdx === layout_1.NONE ? str(arena, row, layout_1.EDGE.sourceIdStr) : idByRow[sourceIdx],
            target: targetIdx === layout_1.NONE ? str(arena, row, layout_1.EDGE.targetIdStr) : idByRow[targetIdx],
            kind: types_1.EDGE_KINDS[row.readUInt8(layout_1.EDGE.kind)],
        };
        const line = u32opt(row, layout_1.EDGE.line);
        if (line !== undefined)
            edge.line = line;
        const column = u32opt(row, layout_1.EDGE.column);
        if (column !== undefined)
            edge.column = column;
        const provenance = layout_1.PROVENANCES[row.readUInt8(layout_1.EDGE.provenance)];
        if (provenance !== undefined)
            edge.provenance = provenance;
        const metadataJson = str(arena, row, layout_1.EDGE.metadataJson);
        if (metadataJson !== undefined)
            edge.metadata = JSON.parse(metadataJson);
        edges[i] = edge;
    }
    const unresolvedReferences = new Array(refCount);
    for (let i = 0; i < refCount; i++) {
        const row = buffers.refs.subarray(i * layout_1.REF_ROW_SIZE, (i + 1) * layout_1.REF_ROW_SIZE);
        const fromIdx = row.readUInt32LE(layout_1.REF.fromIdx);
        const kindByte = row.readUInt8(layout_1.REF.kind);
        // No filePath/language on ordinary refs: the wasm extractors emit them
        // WITHOUT the denormalized fields (the store fills `ref.filePath ??
        // filePath`), and the kernel must match the extractFromSource seam
        // exactly. The ONE exception is flagged (REF_FLAG_FILE_PATH): the
        // ruby/php visitNode hooks set `filePath: ctx.filePath` on their
        // mixin/trait `implements` refs — re-attach the decode call's own
        // filePath, which is that exact value.
        const ref = {
            fromNodeId: fromIdx === layout_1.NONE ? str(arena, row, layout_1.REF.fromIdStr) : idByRow[fromIdx],
            referenceName: str(arena, row, layout_1.REF.referenceName),
            referenceKind: kindByte === layout_1.FUNCTION_REF_CODE
                ? 'function_ref'
                : types_1.EDGE_KINDS[kindByte],
            line: row.readUInt32LE(layout_1.REF.line),
            column: row.readUInt32LE(layout_1.REF.column),
        };
        if ((row.readUInt8(layout_1.REF.flags) & layout_1.REF_FLAG_FILE_PATH) !== 0)
            ref.filePath = filePath;
        const candidates = strList(arena, row, layout_1.REF.candidates);
        if (candidates !== undefined)
            ref.candidates = candidates;
        unresolvedReferences[i] = ref;
    }
    let errors = [];
    const errorsOff = meta.readUInt32LE(layout_1.META.errorsOff);
    if (errorsOff !== layout_1.NONE) {
        const errorsLen = meta.readUInt32LE(layout_1.META.errorsLen);
        errors = JSON.parse(arena.toString('utf8', errorsOff, errorsOff + errorsLen));
    }
    return { nodes, edges, unresolvedReferences, errors, durationMs: 0 };
}
//# sourceMappingURL=decode.js.map