/**
 * CodeGraph MCP Server
 *
 * Model Context Protocol server that exposes CodeGraph functionality
 * as tools for AI assistants like Claude.
 *
 * @module mcp
 *
 * @example
 * ```typescript
 * import { MCPServer } from 'codegraph';
 *
 * const server = new MCPServer('/path/to/project');
 * await server.start();
 * ```
 *
 * Runtime modes (decided in {@link MCPServer.start}):
 *
 * - **Direct** — one process serves one MCP client over stdio. The pre-#411
 *   behavior; used when the user opts out (`CODEGRAPH_NO_DAEMON=1`), no
 *   `.codegraph/` is reachable, or the daemon machinery fails for any reason.
 * - **Proxy** — what an MCP host actually talks to when sharing is on: a thin
 *   stdio↔socket pipe to the shared daemon. The proxy carries the #277 PPID
 *   watchdog, so a SIGKILL'd host reaps its proxy promptly. See {@link ./proxy.ts}.
 * - **Daemon** — a *detached* background process (its own session/process
 *   group) that serves N proxies over a Unix-domain socket / named pipe,
 *   sharing one CodeGraph + watcher + SQLite handle. Spawned on demand; never a
 *   child of any host, so it survives individual sessions and is reaped by
 *   client-refcount + idle timeout. See {@link ./daemon.ts} and issue #411.
 *
 * The detached-daemon + always-proxy split is the fix for the review finding
 * that the original in-process daemon (a) was the first host's child, so closing
 * that terminal severed every other client, and (b) disabled the PPID watchdog,
 * regressing #277 (orphaned daemons on host SIGKILL).
 */
/**
 * MCP Server for CodeGraph
 *
 * Implements the Model Context Protocol to expose CodeGraph
 * functionality as tools that can be called by AI assistants.
 *
 * Backwards-compatible constructor and `start()` signature with the
 * pre-issue-#411 implementation: callers continue to do
 * `new MCPServer(path).start()`. Internally we now pick from direct / proxy /
 * daemon at start time.
 */
export declare class MCPServer {
    private projectPath;
    private session;
    private engine;
    private daemon;
    private ppidWatchdog;
    private livenessWatchdog;
    private originalPpid;
    private hostPpid;
    private stopped;
    private mode;
    constructor(projectPath?: string);
    /**
     * Start the MCP server.
     *
     * Decision order:
     *   1. `CODEGRAPH_NO_DAEMON=1` → direct mode (unchanged pre-#411 behavior).
     *   2. `CODEGRAPH_DAEMON_INTERNAL=1` → we ARE the detached daemon; listen.
     *   3. No `.codegraph/` reachable → direct mode (the daemon's lockfile and
     *      socket both live under `.codegraph/`).
     *   4. Otherwise connect to (or spawn) the shared daemon and proxy to it.
     *
     * On any unexpected failure in step 4 we transparently fall back to direct
     * mode — a misbehaving daemon must never block a session from starting.
     */
    start(): Promise<void>;
    /**
     * Stop the server. In daemon mode this triggers graceful shutdown of every
     * connected session; in direct mode it mirrors the pre-#411 behavior (close
     * cg, exit). Proxy mode never routes through here — the proxy exits itself.
     */
    stop(): void;
    /** Single-process stdio MCP session — the pre-issue-#411 code path. */
    private startDirect;
    /**
     * Run as the detached shared daemon (process spawned with
     * `CODEGRAPH_DAEMON_INTERNAL=1`). Arbitrate the O_EXCL lock, then either
     * become the daemon (bind the socket, serve forever) or — if a live daemon
     * already holds the lock — exit so we don't leak a redundant process.
     *
     * No PPID watchdog and no stdin handlers: the daemon is detached on purpose
     * and reaps itself via client-refcount + idle timeout (see {@link Daemon}).
     */
    private startDaemonProcess;
    /**
     * Proxy mode (the common case). Serve the MCP handshake LOCALLY for instant
     * tool registration, forwarding tool calls to the shared daemon — which is
     * connected in the background (probed, then spawned + polled if absent) so the
     * handshake never waits ~600ms on it. Runs until the host disconnects; the
     * proxy falls back to an in-process engine if the daemon never binds, so this
     * never wedges a session.
     */
    private runProxyWithLocalHandshake;
    /** Standard SIGINT/SIGTERM handlers that route to our `stop()` (direct mode). */
    private installSignalHandlers;
    /**
     * PPID watchdog (#277) — direct mode only. Daemon mode is detached on purpose
     * and reaps via idle timeout; proxy mode installs its own watchdog inside
     * {@link runProxy}. So this only ever runs for an in-process direct session.
     */
    private installPpidWatchdog;
}
export { StdioTransport } from './transport';
export { tools, ToolHandler } from './tools';
export { Daemon } from './daemon';
export { CodeGraphPackageVersion } from './version';
//# sourceMappingURL=index.d.ts.map