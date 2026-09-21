"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LRUCache = void 0;
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
class LRUCache {
    max;
    store = new Map();
    constructor(max) {
        if (!Number.isFinite(max) || max <= 0) {
            throw new Error(`LRUCache max must be a positive finite number, got ${max}`);
        }
        this.max = Math.floor(max);
    }
    get size() {
        return this.store.size;
    }
    get(key) {
        const value = this.store.get(key);
        if (value === undefined) {
            // Distinguish "missing" from "stored undefined" by checking has().
            // We don't store undefined in practice, but be defensive.
            return this.store.has(key) ? value : undefined;
        }
        // Refresh recency by re-inserting.
        this.store.delete(key);
        this.store.set(key, value);
        return value;
    }
    has(key) {
        return this.store.has(key);
    }
    set(key, value) {
        if (this.store.has(key)) {
            this.store.delete(key);
        }
        else if (this.store.size >= this.max) {
            // Evict the oldest entry — first key in iteration order.
            const oldest = this.store.keys().next().value;
            if (oldest !== undefined) {
                this.store.delete(oldest);
            }
        }
        this.store.set(key, value);
    }
    clear() {
        this.store.clear();
    }
}
exports.LRUCache = LRUCache;
//# sourceMappingURL=lru-cache.js.map