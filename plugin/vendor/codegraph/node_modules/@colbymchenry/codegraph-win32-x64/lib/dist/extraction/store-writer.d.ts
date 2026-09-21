/**
 * StoreWriter — main-thread client for the store worker (see store-worker.ts).
 *
 * Used ONLY on the fresh-DB bulk path: bundles are posted in file order and the
 * worker applies them in arrival order, so rowid assignment (and therefore
 * resolution's insertion-order disambiguation) is byte-identical to the
 * main-thread store. Kill switch: CODEGRAPH_NO_STORE_WORKER=1.
 */
import { ExtractionResult, Language, Node, Edge, UnresolvedReference, FileRecord } from '../types';
/** One file's complete store payload (pre-filtered — see storeFileBundle). */
export interface StoreBundle {
    nodes: Node[];
    edges: Edge[];
    refs: UnresolvedReference[];
    file: FileRecord;
}
/**
 * A kernel deferred-decode payload: the file's raw table buffers plus the
 * FileRecord the main thread built from meta counts. The store WORKER decodes
 * and finalizes (same filters as the object path), so per-node objects never
 * exist on the main thread.
 */
export interface KernelStoreBundle {
    kernel: true;
    filePath: string;
    language: Language;
    buffers: NonNullable<ExtractionResult['kernelBuffers']>;
    file: FileRecord;
}
/**
 * The validation/denormalization every bundle gets before storeFileBundle —
 * shared by the orchestrator's object path and the store worker's kernel
 * decode path so the two can never drift:
 *   - nodes missing identity fields are dropped (#42-class safety),
 *   - edges must connect inserted nodes (FK integrity),
 *   - refs must originate from inserted nodes and carry the denormalized
 *     filePath/language the resolver reads.
 */
export declare function finalizeStoreBundle(result: Pick<ExtractionResult, 'nodes' | 'edges' | 'unresolvedReferences'>, filePath: string, language: Language, file: FileRecord): StoreBundle;
export declare class StoreWriter {
    private worker;
    private readyPromise;
    private firstError;
    private drainWaiters;
    private nextDrainId;
    private exited;
    /** Bundles posted but not yet acked — the queue-depth backpressure signal. */
    private outstanding;
    private belowWaiters;
    constructor(workerScriptPath: string, dbPath: string, fastInit: boolean);
    private failAll;
    private settleOne;
    ready(): Promise<void>;
    /** Post one file's bundle. Throws immediately if the writer already failed. */
    send(bundle: StoreBundle | KernelStoreBundle): void;
    /** Backpressure: resolves once fewer than `limit` bundles are un-acked. */
    waitBelow(limit: number): Promise<void>;
    /** Resolves when every bundle posted before this call has been applied. */
    drain(): Promise<void>;
    /** Close the worker's DB connection and join the thread. */
    close(): Promise<void>;
}
//# sourceMappingURL=store-writer.d.ts.map