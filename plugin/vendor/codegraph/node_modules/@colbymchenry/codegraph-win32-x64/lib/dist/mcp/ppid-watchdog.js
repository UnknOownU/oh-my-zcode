"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PPID_POLL_MS = void 0;
exports.supervisionLostReason = supervisionLostReason;
exports.parsePpidPollMs = parsePpidPollMs;
exports.parseHostPpid = parseHostPpid;
/**
 * Returns a human-readable reason string when the process has lost its
 * supervisor and should shut down, or null while it is still supervised.
 */
function supervisionLostReason(state) {
    const { originalPpid, currentPpid, hostPpid, isAlive } = state;
    const platform = state.platform ?? process.platform;
    // POSIX: the parent dying reparents us, so ppid diverges. (Never on Windows.)
    if (currentPpid !== originalPpid) {
        return `ppid ${originalPpid} -> ${currentPpid}`;
    }
    // Windows: ppid is stable across parent death, so detect it by liveness.
    // Skip pid 0/1 — "unknown" and init are never a real Windows parent, and a
    // bogus liveness probe there must not trigger a shutdown.
    if (platform === 'win32' && originalPpid > 1 && !isAlive(originalPpid)) {
        return `parent pid ${originalPpid} exited`;
    }
    // Either platform: the host pid threaded past a launcher shim is gone.
    if (hostPpid !== null && !isAlive(hostPpid)) {
        return `host pid ${hostPpid} exited`;
    }
    return null;
}
/** Default PPID poll cadence (ms). Shared by the MCP server and CLI commands. */
exports.DEFAULT_PPID_POLL_MS = 5000;
/**
 * Resolve the PPID watchdog poll interval from an env override
 * (`CODEGRAPH_PPID_POLL_MS`). A value of `0` disables the watchdog entirely
 * (escape hatch for embedded scenarios where the parent legitimately re-parents
 * the process on purpose). Anything non-numeric or negative falls back to the
 * default.
 */
function parsePpidPollMs(raw) {
    if (raw === undefined || raw === '')
        return exports.DEFAULT_PPID_POLL_MS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed))
        return exports.DEFAULT_PPID_POLL_MS;
    if (parsed < 0)
        return exports.DEFAULT_PPID_POLL_MS;
    return Math.floor(parsed);
}
/**
 * Parse the host PID propagated across the `--liftoff-only` re-exec
 * (`CODEGRAPH_HOST_PPID`). Returns a positive integer PID, or null when
 * unset/invalid — the direct-launch path, where the watchdog falls back to
 * `process.ppid` divergence. PIDs of 0/1 are rejected (0 = unknown, 1 = init,
 * i.e. already orphaned), so the watchdog doesn't latch onto init.
 */
function parseHostPpid(raw) {
    if (raw === undefined || raw === '')
        return null;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 1)
        return null;
    return parsed;
}
//# sourceMappingURL=ppid-watchdog.js.map