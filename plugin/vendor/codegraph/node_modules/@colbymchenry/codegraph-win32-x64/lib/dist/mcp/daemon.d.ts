/**
 * Shared MCP daemon — issue #411.
 *
 * One detached `codegraph serve --mcp` daemon process per project root,
 * accepting N concurrent MCP clients over a Unix-domain socket (or named pipe
 * on Windows). Each incoming connection gets its own {@link MCPSession}; all
 * sessions share a single {@link MCPEngine}, which means a single file watcher
 * (one inotify set), a single SQLite connection (one WAL writer), and a single
 * tree-sitter warm-up — paid once, amortized across every agent talking to the
 * project.
 *
 * Lifecycle (see also `./index.ts` and `./proxy.ts`):
 *   - The daemon is spawned **detached** (its own session/process group, stdio
 *     decoupled) by the first launcher that finds no daemon running. It is NOT
 *     a child of any MCP host, so closing one terminal / Ctrl-C'ing one session
 *     can't take it down and sever the others. That's why this process has no
 *     PPID watchdog: it deliberately outlives every individual client.
 *   - Every MCP host talks to the daemon through a thin `proxy` process (the
 *     thing the host actually spawned). The proxy keeps the #277 PPID watchdog,
 *     so a SIGKILL'd host still reaps its proxy promptly; the proxy's socket
 *     close then decrements the daemon's refcount.
 *   - When the last client disconnects the daemon lingers for
 *     `CODEGRAPH_DAEMON_IDLE_TIMEOUT_MS` (default 300s) so back-to-back agent
 *     runs in the same project don't repay startup, then exits cleanly. This is
 *     what keeps a single-agent session from leaking a daemon forever (#277).
 *
 * What this file owns:
 *   - Listening on the daemon socket and spawning per-connection sessions.
 *   - The handshake "hello" line that lets a proxy verify it found a
 *     same-version daemon before piping any JSON-RPC through it.
 *   - The lockfile (`.codegraph/daemon.pid`) competing daemons arbitrate
 *     against — atomic `O_EXCL` create with the full record written in the same
 *     breath (no empty-file window) + cleanup on exit.
 *   - Reference counting + idle timeout.
 *   - Graceful shutdown on SIGTERM/SIGINT and idle exit.
 *
 * What this file does NOT own:
 *   - The proxy side (`./proxy.ts`).
 *   - The decision of *whether* to run as daemon at all — that's `MCPServer`.
 *   - The MCP protocol state machine — that's `./session.ts`.
 */
import * as net from 'net';
import { DaemonLockInfo } from './daemon-paths';
/**
 * Finalize daemon shutdown. On POSIX, exit immediately — it's clean and fast.
 * On Windows, do NOT force an exit while watchers may still be closing (that
 * trips the libuv assertion above); instead mark success and let the loop drain
 * to a natural exit, with an UNREF'd backstop that force-exits only if a stray
 * handle would otherwise hang shutdown. Pure and platform-injected so both
 * branches are unit-testable off-Windows. Returns the backstop timer (Windows)
 * so callers/tests can clear it.
 */
export declare function finalizeDaemonExit(platform: NodeJS.Platform, exit: (code: number) => void): NodeJS.Timeout | null;
/** Bytes/parse-window for an oversized hello line — bounded against a malicious peer. */
declare const MAX_HELLO_LINE_BYTES = 4096;
/**
 * Wire format for the one-shot hello line the daemon emits on every new
 * connection. Versioned with the package's own semver so a 0.9.x proxy never
 * pipes through a 0.10.x daemon (or vice-versa) — the proxy falls back to
 * direct mode on mismatch rather than risk subtle wire incompatibilities.
 */
export interface DaemonHello {
    codegraph: string;
    pid: number;
    socketPath: string;
    protocol: 1;
}
/**
 * Optional reverse-handshake line a proxy sends right after it verifies the
 * daemon hello, carrying its own pids so the daemon can reap the client if its
 * process dies WITHOUT the socket ever signalling close (the Windows named-pipe
 * hazard behind #692). Entirely optional and fail-safe: a connection that never
 * sends it (a legacy/direct client) just falls back to the socket-close
 * lifecycle. The `codegraph_client` marker is what tells it apart from the
 * client's first JSON-RPC message.
 */
export interface DaemonClientHello {
    codegraph_client: 1;
    pid: number;
    hostPid: number | null;
}
export interface DaemonStartResult {
    /** Always-non-null for a successfully-started daemon. */
    socketPath: string;
    /** Lockfile contents as written. */
    lock: DaemonLockInfo;
}
/**
 * Run as the shared daemon for `projectRoot`. Resolves once the socket is
 * listening. The Daemon owns the socket, the engine, and the lockfile until
 * `stop()` is called or it exits on idle/signal.
 *
 * Race-safe: callers must first call `tryAcquireDaemonLock(projectRoot)` and
 * only construct a Daemon if they got the lock (`kind: 'acquired'`). The atomic
 * `O_EXCL` create inside the acquire helper — which now also writes the full
 * record before returning — is the only synchronization between competing
 * daemons.
 */
export declare class Daemon {
    private projectRoot;
    private server;
    private clients;
    /** Per-client peer pids from the optional client-hello, for the liveness sweep. */
    private clientPeers;
    private idleTimer;
    private idleTimeoutMs;
    private maxIdleMs;
    private lastActivityAt;
    private maxIdleTimer;
    private clientSweepTimer;
    private engine;
    private stopping;
    private socketPath;
    private pidPath;
    constructor(projectRoot: string, opts?: {
        idleTimeoutMs?: number;
        maxIdleMs?: number;
    });
    /**
     * Bind the socket, kick off engine init, and register signal handlers. The
     * lockfile body was already written atomically by `tryAcquireDaemonLock`, so
     * there is nothing to write here. The promise resolves once the server is
     * listening — the daemon then sticks around until idle/shutdown.
     */
    start(): Promise<DaemonStartResult>;
    /** Currently-connected client count. Exposed for tests / status output. */
    getClientCount(): number;
    /** The socket path the daemon is (or will be) listening on. */
    getSocketPath(): string;
    /** Graceful shutdown: close all sessions, the engine, and clean up the lock. */
    stop(reason?: string): Promise<void>;
    private handleConnection;
    private dropClient;
    private armIdleTimer;
    private disarmIdleTimer;
    /**
     * Defense-in-depth against a daemon that outlives its clients (#692), for the
     * cases the refcount + idle timer miss because a socket close never arrives:
     *   - **Inactivity backstop:** after `maxIdleMs` with no inbound traffic, reap
     *     the daemon — but ONLY if no connected client can be proven alive (see
     *     {@link backstopShouldExit}). This is the sole phantom class the sweep
     *     below can't catch: a client whose client-hello never arrived, so we have
     *     no pid to check.
     *   - **Liveness sweep:** drop any client whose peer process has died (per the
     *     client-hello pids), which re-arms the idle timer once the last real
     *     client is gone. Catches a dead peer within one sweep instead of waiting
     *     out the whole backstop.
     * Both timers are unref'd — the listening server keeps the loop alive, and
     * neither should hold it open on its own.
     */
    private startLivenessTimers;
    /**
     * Decide whether the inactivity backstop should reap the daemon right now.
     * Public + `isAlive`-injected for deterministic tests; the timer calls it each
     * tick with the real liveness probe.
     *
     * The backstop exists ONLY to catch a **phantom** client (#692) — one counted
     * but actually gone, whose socket-close was never delivered. It must never
     * reap a **live-but-quiet** session (connected, alive peer, just not querying):
     * doing so silently severed the shared daemon and degraded that session — and
     * any others sharing it — to an in-process engine. `lastActivityAt` only tracks
     * inbound query bytes, and MCP has no keepalive, so a genuinely-live session
     * trips the raw inactivity window after ~30 min of not being queried.
     *
     * So: once the inactivity window elapses, drop provably-dead peers (the same
     * check the periodic sweep runs), then reap the daemon only when NOT ONE
     * remaining client can be proven alive — i.e. every client left is an
     * unknown-pid connection the sweep can't verify. A single provably-alive
     * client keeps the daemon up. Has the sweep's side effect (drops dead peers).
     */
    backstopShouldExit(isAlive: (pid: number) => boolean): boolean;
    /**
     * Drop every connected client whose peer process is gone. Returns the count
     * reaped. `isAlive` is injected for testing. Clients with unknown pids (no
     * client-hello) are skipped — they rely on the socket-close path.
     */
    reapDeadClients(isAlive: (pid: number) => boolean): number;
    private cleanupLockfile;
}
/**
 * Result of `tryAcquireDaemonLock`. Either we got the lockfile (caller becomes
 * the daemon), or it already existed (caller should connect to the existing
 * daemon as a proxy, or — if the holder is dead — clear it and retry).
 */
export type AcquireResult = {
    kind: 'acquired';
    pidPath: string;
    info: DaemonLockInfo;
} | {
    kind: 'taken';
    existing: DaemonLockInfo | null;
    pidPath: string;
};
/**
 * Atomically create the daemon pidfile with its full record already in place.
 * Returns either an `acquired` result (the caller is the daemon-elect and may
 * construct a {@link Daemon}) or a `taken` result.
 *
 * must-fix 1 (issue #411 review): the lockfile must appear in ONE atomic step,
 * already complete — never empty, even momentarily. The first attempt at this
 * (`O_EXCL` create then a separate `writeSync`) left a microsecond window where
 * the file existed but was empty; under concurrent daemon startup a third
 * candidate could read that empty file, decode it as `null`, and `unlink` the
 * winner's lock → two daemons (two watchers, two writers). The window was
 * normally too small to hit, but the file watcher's extra startup time made
 * concurrent daemons overlap enough to reproduce it reliably.
 *
 * The fix writes the complete record to a private temp file, then hard-links it
 * into place: `link()` is atomic AND exclusive (EEXIST if the target exists), so
 * the pidfile becomes visible in one step already containing a full record.
 * Whoever links first wins; everyone else gets EEXIST and reads a complete file.
 * There is no empty-file window at all.
 *
 * Filesystems without hard links (#997): ExFAT/FAT external volumes and some
 * network mounts can't `link()` at all — it throws ENOTSUP/EPERM, which would
 * otherwise kill the daemon before it ever reaches the socket bind. There we
 * fall back to an O_EXCL create (`acquireLockViaExclusiveOpen`): still exclusive
 * ("first writer wins"), but the full record is written through the fd in a
 * second step, so the empty-file window the link approach removed is reopened —
 * only on these filesystems, only for the microseconds between create and write
 * (far narrower than the original bug, which the file watcher's startup latency
 * widened). The race's worst case is two daemons briefly; on a single external
 * drive that's strictly better than the daemon never starting at all.
 */
export declare function tryAcquireDaemonLock(projectRoot: string): AcquireResult;
/**
 * Exclusive-create the pidfile (O_CREAT|O_EXCL via the `wx` flag) and write the
 * full record through the same fd — the hard-link-free fallback used by
 * {@link tryAcquireDaemonLock} on filesystems without `link()`. Returns true if
 * we created it (acquired the lock), false on EEXIST (another candidate holds
 * it). Any other error propagates. Still exclusive, so "first writer wins" holds
 * exactly as the link path does; the only difference is the brief empty-file
 * window between create and write. Exported for testing.
 */
export declare function acquireLockViaExclusiveOpen(pidPath: string, info: DaemonLockInfo): boolean;
/**
 * Remove a stale pidfile, but only if it still names a dead process. Re-reads
 * the file immediately before unlinking so we never delete a lock that a live
 * daemon (re)acquired in the meantime.
 *
 * must-fix 1 (issue #411 review): the original unconditionally `unlink`'d,
 * which let a racing candidate delete a healthy daemon's lock. Passing
 * `expectedDeadPid` (the pid the caller believed was dead) makes the clear a
 * compare-and-delete: bail if the file now holds a different pid, or any live
 * pid. Returns true when the stale lock is gone (or was already gone).
 */
export declare function clearStaleDaemonLock(pidPath: string, expectedDeadPid?: number): boolean;
/**
 * Probe whether `pid` is currently alive (signal-0). Treats EPERM as alive on
 * every platform (the process exists, it's just not ours to signal) so we never
 * mistake a live daemon for a dead one and clear its lock.
 */
export declare function isProcessAlive(pid: number): boolean;
/**
 * Bind the first usable socket from an ordered candidate list, relocating past
 * any path that fails to bind for a non-conflict reason (see {@link
 * SOCKET_BIND_CONFLICT_CODE}). The injected `listen` does the real
 * `net.Server.listen` (and stale-socket clear); abstracted so the relocation
 * policy is unit-testable without a real unsupported filesystem. Returns the
 * server plus the path actually bound. An EADDRINUSE, or any error on the LAST
 * candidate, propagates — the caller releases the lockfile and falls back to
 * direct mode (#974). Exported for testing.
 */
export declare function bindFirstUsableSocket(candidates: string[], listen: (socketPath: string) => Promise<net.Server>, opts?: {
    onRelocate?: (from: string, to: string, code: string) => void;
}): Promise<{
    server: net.Server;
    socketPath: string;
}>;
/**
 * Parse one client-hello line. Returns the peer pids if `line` is a well-formed
 * client-hello (carries the `codegraph_client` marker), or null otherwise — in
 * which case the caller treats the bytes as ordinary JSON-RPC.
 */
export declare function parseClientHelloLine(line: string): {
    pid: number;
    hostPid: number | null;
} | null;
/**
 * A client's peer is dead when its proxy process is gone, or when its known
 * host process is gone. Unknown pid (no client-hello) is never "dead" on this
 * basis — those clients rely on the socket-close path. Exported for testing.
 */
export declare function peerIsDead(peers: {
    pid: number | null;
    hostPid: number | null;
}, isAlive: (pid: number) => boolean): boolean;
/** Exported for test stubs that need to bound the hello-line read. */
export { MAX_HELLO_LINE_BYTES };
//# sourceMappingURL=daemon.d.ts.map