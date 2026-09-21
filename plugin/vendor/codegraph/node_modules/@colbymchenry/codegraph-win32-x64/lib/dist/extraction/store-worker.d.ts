/**
 * Store worker — dedicated writer thread for the bulk-index store phase.
 *
 * During a fresh full index the main thread's biggest serial cost is executing
 * the per-file INSERT batches. This worker owns that work on its own SQLite
 * connection: the orchestrator posts one message per file (in file order) and
 * the worker applies them in arrival order, which preserves the #1015
 * insertion-order determinism exactly as if the main thread had run the same
 * calls. The main thread performs NO database access while the writer is
 * active (fresh-DB path only), so there is no cross-connection contention.
 *
 * Protocol (main → worker):
 *   {type:'open', dbPath, fastInit}  → open connection, reply {type:'ready'}
 *   {type:'bundle', bundle}          → apply one file's store bundle
 *   {type:'drain', id}               → reply {type:'drained', id} (in-order ⇒ all prior bundles applied)
 *   {type:'close'}                   → close DB and exit
 * Worker → main: {type:'ready'} | {type:'drained', id} | {type:'error', message}
 *
 * A bundle failure does not kill the worker; the first error is reported and
 * the client surfaces it at drain(), matching the main-thread path where a
 * store exception propagates out of the ordered-flush chain.
 */
export {};
//# sourceMappingURL=store-worker.d.ts.map