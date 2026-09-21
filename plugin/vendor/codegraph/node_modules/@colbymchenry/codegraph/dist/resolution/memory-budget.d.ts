/**
 * Memory headroom for worker-pool sizing — cgroup-honest on Linux,
 * reclaim-honest on macOS.
 *
 * `os.freemem()` reads /proc/meminfo, which inside a container reports the
 * HOST's (or VM's) memory, not the cgroup's — the same blindness os.cpus()
 * has for cpusets. A resolver pool sized by cores alone OOM-killed a
 * kernel-scale index in a 7GB-capped container (migration plan §7a.1:
 * oom_kill=5, six ~1GB workers at true 8-core concurrency), so pool sizing
 * combines a CPU term with the memory headroom this module reports.
 *
 * On macOS `os.freemem()` has the OPPOSITE failure: it counts only
 * `free_count` pages, and macOS deliberately keeps RAM full of reclaimable
 * cache — a mostly-idle 64GB machine reads ~1GB "free", so the memory term
 * capped the resolver pool at 2 workers where the CPU term allowed 6
 * (measured on the dubbo warm-wall bench: resolution settle 3.0s at 2
 * workers vs 1.9s at 6, ~1.5–2s of init wall). `darwinMemoryAvailable`
 * reports what Activity Monitor calls available — free + inactive +
 * speculative + purgeable pages — the same reclaimable-inclusive convention
 * the Linux branch uses by crediting `inactive_file` back.
 */
/**
 * Available headroom under the cgroup memory limit (v2 then v1), or null
 * when uncontained (no limit, non-Linux, or unreadable). Never throws.
 *
 * Reclaimable page cache (`inactive_file`) is credited back: `memory.current`
 * counts it as usage, but the kernel reclaims it on demand — after a bulk
 * parse the cache is stuffed with the DB's own pages, and the naive
 * `max − current` read 57MB of headroom on a 6GB container and silently
 * disabled the resolver pool (§7a.1 diagnostic run). This is the same
 * working-set convention `docker stats` uses.
 */
export declare function cgroupMemoryAvailable(): number | null;
/**
 * Reclaimable-inclusive available memory on macOS, or null elsewhere / on
 * any parse failure (→ callers fall back to `os.freemem()`). Reads
 * `/usr/bin/vm_stat` — the stable public interface over host_statistics64 —
 * once per call (pool sizing runs it once per init; a few ms). Never throws.
 */
export declare function darwinMemoryAvailable(): number | null;
/**
 * The budget pool sizing divides: the smaller of system free memory and the
 * cgroup headroom (when contained), with the macOS reclaimable-inclusive
 * reading replacing the too-small darwin `freemem`. Conservative by
 * construction — every number shrinks as the process itself grows.
 */
export declare function memoryBudgetBytes(): number;
//# sourceMappingURL=memory-budget.d.ts.map