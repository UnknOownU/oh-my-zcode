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
export {};
//# sourceMappingURL=resolver-worker.d.ts.map