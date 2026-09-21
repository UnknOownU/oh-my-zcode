"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cgroupMemoryAvailable = cgroupMemoryAvailable;
exports.darwinMemoryAvailable = darwinMemoryAvailable;
exports.memoryBudgetBytes = memoryBudgetBytes;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
/** Parse a cgroup value file: numeric bytes, or null for absent/'max'. */
function readCgroupBytes(path) {
    try {
        const raw = fs.readFileSync(path, 'utf8').trim();
        if (raw === 'max')
            return null;
        const n = Number.parseInt(raw, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
    }
    catch {
        return null;
    }
}
/** `inactive_file` from a cgroup memory.stat file — reclaimable page cache. */
function readInactiveFile(statPath) {
    try {
        const m = /^inactive_file (\d+)$/m.exec(fs.readFileSync(statPath, 'utf8'));
        return m ? Number.parseInt(m[1], 10) : 0;
    }
    catch {
        return 0;
    }
}
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
function cgroupMemoryAvailable() {
    if (process.platform !== 'linux')
        return null;
    // v2 unified hierarchy
    const v2Max = readCgroupBytes('/sys/fs/cgroup/memory.max');
    if (v2Max !== null) {
        const current = readCgroupBytes('/sys/fs/cgroup/memory.current') ?? 0;
        const reclaimable = readInactiveFile('/sys/fs/cgroup/memory.stat');
        return Math.max(0, v2Max - Math.max(0, current - reclaimable));
    }
    // v1
    const v1Limit = readCgroupBytes('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    // v1 reports "no limit" as a huge sentinel (~PAGE_COUNTER_MAX); treat
    // anything at or beyond half the address-space-ish range as uncontained.
    if (v1Limit !== null && v1Limit < 2 ** 60) {
        const usage = readCgroupBytes('/sys/fs/cgroup/memory/memory.usage_in_bytes') ?? 0;
        const reclaimable = readInactiveFile('/sys/fs/cgroup/memory/memory.stat');
        return Math.max(0, v1Limit - Math.max(0, usage - reclaimable));
    }
    return null;
}
/**
 * Reclaimable-inclusive available memory on macOS, or null elsewhere / on
 * any parse failure (→ callers fall back to `os.freemem()`). Reads
 * `/usr/bin/vm_stat` — the stable public interface over host_statistics64 —
 * once per call (pool sizing runs it once per init; a few ms). Never throws.
 */
function darwinMemoryAvailable() {
    if (process.platform !== 'darwin')
        return null;
    try {
        const out = (0, child_process_1.execFileSync)('/usr/bin/vm_stat', { encoding: 'utf8', timeout: 2000 });
        const pageMatch = /page size of (\d+) bytes/.exec(out);
        const pageSize = pageMatch ? Number.parseInt(pageMatch[1], 10) : 16384;
        const count = (label) => {
            const m = new RegExp(`^${label}:\\s+(\\d+)`, 'm').exec(out);
            return m ? Number.parseInt(m[1], 10) : 0;
        };
        const pages = count('Pages free') +
            count('Pages inactive') +
            count('Pages speculative') +
            count('Pages purgeable');
        const bytes = pages * pageSize;
        return bytes > 0 && Number.isFinite(bytes) ? bytes : null;
    }
    catch {
        return null;
    }
}
/**
 * The budget pool sizing divides: the smaller of system free memory and the
 * cgroup headroom (when contained), with the macOS reclaimable-inclusive
 * reading replacing the too-small darwin `freemem`. Conservative by
 * construction — every number shrinks as the process itself grows.
 */
function memoryBudgetBytes() {
    const free = os.freemem();
    const cgroup = cgroupMemoryAvailable();
    if (cgroup !== null)
        return Math.min(free, cgroup);
    // darwinAvailable ⊇ free by construction (the sum includes free pages);
    // max() guards a hypothetical undercounting parse.
    const darwin = darwinMemoryAvailable();
    return darwin === null ? free : Math.max(free, darwin);
}
//# sourceMappingURL=memory-budget.js.map