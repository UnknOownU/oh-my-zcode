/**
 * Simple LRU cache backed by JavaScript's insertion-ordered Map.
 *
 * Used by ReferenceResolver to bound the per-resolver caches that
 * previously grew without limit and OOM'd on large codebases (20k+
 * files). Each cache is sized independently — see `index.ts` for
 * the chosen limits per cache type.
 *
 * Eviction is plain LRU: on `set`, if the cache is full, the
 * least-recently-used entry (the first one in iteration order) is
 * evicted. Touching via `get` moves the entry to the most-recently-used
 * position so hot keys survive eviction passes.
 */
export declare class LRUCache<K, V> {
    private readonly max;
    private readonly store;
    constructor(max: number);
    get size(): number;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value: V): void;
    clear(): void;
}
//# sourceMappingURL=lru-cache.d.ts.map