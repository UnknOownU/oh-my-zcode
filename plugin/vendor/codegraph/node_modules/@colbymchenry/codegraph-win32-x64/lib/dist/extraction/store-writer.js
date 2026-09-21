"use strict";
/**
 * StoreWriter — main-thread client for the store worker (see store-worker.ts).
 *
 * Used ONLY on the fresh-DB bulk path: bundles are posted in file order and the
 * worker applies them in arrival order, so rowid assignment (and therefore
 * resolution's insertion-order disambiguation) is byte-identical to the
 * main-thread store. Kill switch: CODEGRAPH_NO_STORE_WORKER=1.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreWriter = void 0;
exports.finalizeStoreBundle = finalizeStoreBundle;
const worker_threads_1 = require("worker_threads");
/**
 * The validation/denormalization every bundle gets before storeFileBundle —
 * shared by the orchestrator's object path and the store worker's kernel
 * decode path so the two can never drift:
 *   - nodes missing identity fields are dropped (#42-class safety),
 *   - edges must connect inserted nodes (FK integrity),
 *   - refs must originate from inserted nodes and carry the denormalized
 *     filePath/language the resolver reads.
 */
function finalizeStoreBundle(result, filePath, language, file) {
    const validNodes = result.nodes.filter((n) => n.id && n.kind && n.name && n.filePath && n.language);
    const insertedIds = new Set(validNodes.map((n) => n.id));
    const validEdges = result.edges.filter((e) => insertedIds.has(e.source) && insertedIds.has(e.target));
    const validRefs = result.unresolvedReferences
        .filter((ref) => insertedIds.has(ref.fromNodeId))
        .map((ref) => ({
        ...ref,
        filePath: ref.filePath ?? filePath,
        language: ref.language ?? language,
    }));
    return { nodes: validNodes, edges: validEdges, refs: validRefs, file };
}
class StoreWriter {
    worker;
    readyPromise;
    firstError = null;
    drainWaiters = new Map();
    nextDrainId = 0;
    exited = false;
    /** Bundles posted but not yet acked — the queue-depth backpressure signal. */
    outstanding = 0;
    belowWaiters = [];
    constructor(workerScriptPath, dbPath, fastInit) {
        this.worker = new worker_threads_1.Worker(workerScriptPath);
        let readyResolve;
        let readyReject;
        this.readyPromise = new Promise((resolve, reject) => {
            readyResolve = resolve;
            readyReject = reject;
        });
        this.worker.on('message', (msg) => {
            if (msg.type === 'ready') {
                readyResolve();
            }
            else if (msg.type === 'ack') {
                this.settleOne();
            }
            else if (msg.type === 'drained' && msg.id !== undefined) {
                const waiter = this.drainWaiters.get(msg.id);
                this.drainWaiters.delete(msg.id);
                if (!waiter)
                    return;
                if (this.firstError)
                    waiter.reject(this.firstError);
                else
                    waiter.resolve();
            }
            else if (msg.type === 'error') {
                if (!this.firstError)
                    this.firstError = new Error(`store worker: ${msg.message}`);
                this.settleOne(); // the error reply is also the failed bundle's ack
            }
        });
        this.worker.on('error', (err) => {
            this.failAll(err instanceof Error ? err : new Error(String(err)));
            readyReject(this.firstError);
        });
        this.worker.on('exit', (code) => {
            this.exited = true;
            if (code !== 0) {
                this.failAll(new Error(`store worker exited with code ${code}`));
                readyReject(this.firstError);
            }
            else if (this.drainWaiters.size > 0 || this.belowWaiters.length > 0) {
                // A clean exit with waiters pending is a protocol violation (only
                // close() should end the worker) — settle the waiters instead of
                // hanging the index forever.
                this.failAll(new Error('store worker exited before drain completed'));
            }
        });
        this.worker.postMessage({ type: 'open', dbPath, fastInit });
        // The worker holds the event loop open only until close(); don't unref —
        // bundles must never be dropped because main ran out of work.
    }
    failAll(err) {
        if (!this.firstError)
            this.firstError = err;
        for (const [, waiter] of this.drainWaiters)
            waiter.reject(this.firstError);
        this.drainWaiters.clear();
        this.outstanding = 0;
        const waiters = this.belowWaiters;
        this.belowWaiters = [];
        for (const w of waiters)
            w.resolve(); // send() will surface firstError
    }
    settleOne() {
        if (this.outstanding > 0)
            this.outstanding--;
        if (this.belowWaiters.length === 0)
            return;
        const still = [];
        for (const w of this.belowWaiters) {
            if (this.outstanding < w.limit)
                w.resolve();
            else
                still.push(w);
        }
        this.belowWaiters = still;
    }
    ready() {
        return this.readyPromise;
    }
    /** Post one file's bundle. Throws immediately if the writer already failed. */
    send(bundle) {
        if (this.firstError)
            throw this.firstError;
        if (this.exited)
            throw new Error('store worker already exited');
        this.outstanding++;
        this.worker.postMessage({ type: 'bundle', bundle });
    }
    /** Backpressure: resolves once fewer than `limit` bundles are un-acked. */
    waitBelow(limit) {
        if (this.firstError || this.exited || this.outstanding < limit)
            return Promise.resolve();
        return new Promise((resolve) => {
            this.belowWaiters.push({ limit, resolve });
        });
    }
    /** Resolves when every bundle posted before this call has been applied. */
    drain() {
        if (this.firstError)
            return Promise.reject(this.firstError);
        if (this.exited)
            return Promise.reject(new Error('store worker already exited'));
        const id = this.nextDrainId++;
        const p = new Promise((resolve, reject) => {
            this.drainWaiters.set(id, { resolve, reject });
        });
        this.worker.postMessage({ type: 'drain', id });
        return p;
    }
    /** Close the worker's DB connection and join the thread. */
    async close() {
        if (this.exited)
            return;
        this.worker.postMessage({ type: 'close' });
        await new Promise((resolve) => {
            const t = setTimeout(() => {
                void this.worker.terminate().then(() => resolve());
            }, 5000);
            this.worker.once('exit', () => {
                clearTimeout(t);
                resolve();
            });
        });
    }
}
exports.StoreWriter = StoreWriter;
//# sourceMappingURL=store-writer.js.map