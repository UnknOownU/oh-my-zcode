/**
 * Background update-availability check for long-lived servers (#1243).
 *
 * The recommended MCP config launches the LOCAL `codegraph` binary, so the
 * server (and the prompt hook alongside it) silently stays on whatever version
 * was last manually upgraded — users discover the drift only when something
 * breaks. This module gives the running server *visibility* without changing
 * behavior: a non-blocking check against the latest GitHub release, surfaced
 * as a one-line notice (stderr log, MCP initialize instructions, and
 * `codegraph_status`) telling the user to run `codegraph upgrade`.
 *
 * Invariants (mirrors the telemetry module's contract):
 *   - Never stdout — stdio is the MCP protocol channel.
 *   - Never blocking: the network refresh is fire-and-forget; every reader
 *     (`getUpdateNotice`) is a cheap synchronous cache read, so the #172
 *     respond-fast handshake contract holds.
 *   - Fail silent: offline / rate-limited / disk-full all degrade to "no
 *     notice", never an error, never a retry loop.
 *   - Off is off: `CODEGRAPH_NO_UPDATE_CHECK` (dedicated) or `DO_NOT_TRACK`
 *     (broad don't-phone-home convention — set by e.g. the Pro container's
 *     data plane) suppresses the network call AND the notice entirely.
 *
 * The check itself reuses `resolveLatestVersion` — the GitHub release-redirect
 * trick with the API fallback — so version resolution can't drift from what
 * `codegraph upgrade` installs. Results are cached in `~/.codegraph/` (the
 * same global state dir telemetry and the daemon registry use) with a 24h TTL
 * on success and a 1h backoff after failure, shared across every proxy /
 * daemon process on the machine.
 */
/** Re-check the release feed after this long (successful checks). */
export declare const UPDATE_CHECK_TTL_MS: number;
/** Back off this long after a failed check (offline, rate-limited). */
export declare const UPDATE_CHECK_FAILURE_BACKOFF_MS: number;
export interface UpdateCheckCacheFile {
    /** Last time a network check was attempted (ms epoch). */
    lastAttemptAt: number;
    /** Last time a network check succeeded (ms epoch). */
    lastSuccessAt?: number;
    /** Latest release tag from the last successful check (e.g. `v1.4.1`). */
    latest?: string;
}
export interface UpdateCheckDeps {
    /** Global state dir; defaults to ~/.codegraph. Tests inject a temp dir. */
    dir?: string;
    env?: NodeJS.ProcessEnv;
    now?: () => number;
    resolveLatest?: () => Promise<string>;
    currentVersion?: string;
}
/**
 * True when the update check must not run at all — no network call, no
 * notice. `DO_NOT_TRACK` uses the same truthiness the telemetry opt-out does.
 */
export declare function updateCheckDisabled(env?: NodeJS.ProcessEnv): boolean;
export declare function updateCheckCachePath(dir: string): string;
export declare function readUpdateCheckCache(dir: string): UpdateCheckCacheFile | null;
/**
 * Rebuild a canonical `vX.Y.Z[-pre]` tag from the PARSED semver fields, or
 * null when the input isn't version-shaped. The notice ends up inside the MCP
 * initialize instructions — agent-visible, system-prompt-adjacent text — and
 * the `latest` value arrives from a network redirect via an on-disk cache, so
 * only a reconstructed canonical string may ever be interpolated, never the
 * raw value. (`parseSemver`'s regex is not end-anchored: a value like
 * `1.2.3-x <arbitrary text>` parses "valid" while the raw string would carry
 * the trailing text straight into every session's instructions.)
 */
export declare function canonicalVersionTag(v: string): string | null;
/** One user-facing sentence; every surface (stderr, instructions, status) shows this. */
export declare function formatUpdateNotice(current: string, latest: string): string;
/**
 * Ensure the on-disk cache is fresh (hitting the network only past the TTL /
 * backoff) and return the current notice, or null. Never throws.
 */
export declare function refreshUpdateCheck(deps?: UpdateCheckDeps): Promise<string | null>;
/**
 * The current update notice from the on-disk cache — synchronous and cheap
 * (memoized disk read), safe on the initialize respond-fast path. When the
 * cache has gone stale (e.g. a daemon that has been up for weeks), kicks a
 * background refresh so the NEXT reader sees a current answer; this call
 * still returns immediately from the stale cache.
 */
export declare function getUpdateNotice(deps?: UpdateCheckDeps): string | null;
/** Test hook: clear the per-process memo. */
export declare function resetUpdateNoticeMemo(): void;
/**
 * Fire-and-forget entry point for server startup: refresh the cache in the
 * background and, if an update is available, emit ONE stderr line (stderr is
 * the MCP-safe channel; hosts surface it in their server logs). Never throws,
 * never blocks, never writes stdout.
 */
export declare function checkForUpdateInBackground(deps?: UpdateCheckDeps, log?: (line: string) => void): void;
//# sourceMappingURL=update-check.d.ts.map