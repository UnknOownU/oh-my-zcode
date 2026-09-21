"use strict";
/**
 * Resolver worker — one member of the parallel-resolution pool.
 *
 * Opens the project database READ-ONLY on its own connection and hosts a full
 * ReferenceResolver over it. The main thread partitions each resolution batch
 * into ordered chunks, fans them across the pool, and ADMITS the results
 * sequentially in chunk order — so edge insertion order (and every cleanup /
 * parking side effect) is identical to the single-threaded loop. Workers only
 * ever read; all writes stay on the main thread.
 *
 * Visibility note: the sequential baseline resolves every ref of a batch
 * against the DB state committed BEFORE that batch (edges persist after the
 * whole batch resolves). Workers read exactly that same committed state, so
 * per-ref inputs match the baseline ref-for-ref.
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Compile cache FIRST — same worker-boot rationale as parse-worker.ts.
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:module').enableCompileCache?.();
}
catch { /* cache is best-effort */ }
const worker_threads_1 = require("worker_threads");
const sqlite_adapter_1 = require("../db/sqlite-adapter");
const queries_1 = require("../db/queries");
const index_1 = require("./index");
const callback_synthesizer_1 = require("./callback-synthesizer");
const cooperative_yield_1 = require("./cooperative-yield");
if (!worker_threads_1.parentPort) {
    throw new Error('resolver-worker must be run as a worker thread');
}
const port = worker_threads_1.parentPort;
let db = null;
let queries = null;
let resolver = null;
let dbPath = null;
port.on('message', (msg) => {
    try {
        switch (msg.type) {
            case 'open': {
                const tOpen = Date.now();
                dbPath = msg.dbPath;
                const created = (0, sqlite_adapter_1.createDatabase)(msg.dbPath, { readOnly: true });
                db = created.db;
                db.pragma('busy_timeout = 5000');
                db.pragma('cache_size = -32000');
                const tDb = Date.now();
                queries = new queries_1.QueryBuilder(db);
                resolver = new index_1.ReferenceResolver(msg.projectRoot, queries);
                resolver.initialize();
                if (process.env.CODEGRAPH_SYNTH_TIMINGS)
                    console.error(`[pool-timing] worker open: db=${tDb - tOpen}ms init=${Date.now() - tDb}ms`);
                port.postMessage({ type: 'ready' });
                break;
            }
            case 'recycle': {
                // Close and reopen the read-only connection so the WAL checkpoints
                // the writer runs can advance past this reader's mark (see
                // QueryBuilder.rebind). Everything above the connection survives —
                // the resolver keeps its warm caches; prepared statements re-prepare
                // lazily. Runs only at the pool-idle boundary, so no query is in
                // flight on this connection.
                if (!queries || !dbPath)
                    throw new Error('resolver-worker: recycle before open');
                try {
                    db?.close();
                }
                catch { /* already closed */ }
                const reopened = (0, sqlite_adapter_1.createDatabase)(dbPath, { readOnly: true });
                db = reopened.db;
                db.pragma('busy_timeout = 5000');
                db.pragma('cache_size = -32000');
                queries.rebind(db);
                port.postMessage({ type: 'recycled', id: msg.id });
                break;
            }
            case 'resolve': {
                if (!resolver)
                    throw new Error('resolver-worker: resolve before open');
                const tRes = Date.now();
                const out = resolver.resolveListForAdmission(msg.refs);
                if (process.env.CODEGRAPH_SYNTH_TIMINGS)
                    console.error(`[pool-timing] worker resolve: ${msg.refs.length} refs in ${Date.now() - tRes}ms`);
                port.postMessage({ type: 'result', id: msg.id, ...out });
                break;
            }
            case 'synth': {
                // Run one synthesis pass against this worker's read-only connection.
                // Passes only READ (graph + source via the resolver's context); their
                // edges are returned for the main thread's ordered merge. Async, with
                // its own error propagation — a throwing pass reports {type:'error'}
                // and the main thread retries it sequentially.
                if (!resolver || !queries)
                    throw new Error('resolver-worker: synth before open');
                const pass = callback_synthesizer_1.SYNTH_PASSES.find((p) => p.name === msg.pass);
                if (!pass)
                    throw new Error(`resolver-worker: unknown synth pass '${msg.pass}'`);
                const q = queries;
                const r = resolver;
                void (async () => {
                    const t0 = Date.now();
                    try {
                        const edges = await pass.run(q, r.getResolutionContext(), (0, cooperative_yield_1.createYielder)());
                        port.postMessage({ type: 'synth-result', id: msg.id, edges, ms: Date.now() - t0 });
                    }
                    catch (err) {
                        port.postMessage({
                            type: 'error',
                            id: msg.id,
                            message: err instanceof Error ? err.message : String(err),
                        });
                    }
                })();
                break;
            }
            case 'close': {
                try {
                    resolver?.dumpResolveProfile(`worker#${worker_threads_1.threadId}`);
                }
                catch { /* diagnostics never block shutdown */ }
                try {
                    db?.close();
                }
                catch {
                    /* already closed */
                }
                process.exit(0);
                break;
            }
        }
    }
    catch (err) {
        port.postMessage({
            type: 'error',
            id: msg.id,
            message: err instanceof Error ? err.message : String(err),
        });
    }
});
//# sourceMappingURL=resolver-worker.js.map