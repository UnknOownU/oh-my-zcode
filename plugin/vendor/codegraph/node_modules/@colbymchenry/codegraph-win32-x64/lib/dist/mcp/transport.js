"use strict";
/**
 * MCP JSON-RPC Transports
 *
 * Two flavors share the same wire format (newline-delimited JSON-RPC 2.0):
 *
 * - `StdioTransport` — original transport; reads/writes the process's
 *   stdin/stdout. Used by direct-mode MCP servers.
 * - `SocketTransport` — wraps a single `net.Socket`. Used by the shared-daemon
 *   architecture (see {@link ./daemon}) to multiplex multiple MCP clients onto
 *   one CodeGraph instance via per-connection sessions.
 *
 * Both implement {@link JsonRpcTransport} so the session-level protocol logic
 * (initialize / tools/list / tools/call, plus server-initiated `roots/list`)
 * is identical regardless of where the bytes come from.
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
exports.SocketTransport = exports.StdioTransport = exports.ErrorCodes = void 0;
const readline = __importStar(require("readline"));
// Standard JSON-RPC error codes
exports.ErrorCodes = {
    ParseError: -32700,
    InvalidRequest: -32600,
    MethodNotFound: -32601,
    InvalidParams: -32602,
    InternalError: -32603,
};
/**
 * Shared implementation of newline-delimited JSON-RPC 2.0 over any
 * `Readable`/`Writable` stream pair. Stdio and socket transports both wrap
 * this — the only difference between them is which streams get plugged in
 * and how a "close" propagates back to the owning code.
 */
class LineBasedJsonRpcTransport {
    messageHandler = null;
    // Outstanding server-initiated requests (e.g. roots/list), keyed by the id
    // we sent. Responses from the client are matched back here.
    pending = new Map();
    nextRequestId = 1;
    stopped = false;
    /**
     * Send a server-initiated request to the client and await its response.
     *
     * MCP is bidirectional: the server can ask the client questions too. We use
     * this for `roots/list` — the spec-blessed way to learn the workspace root
     * when the client didn't pass one in `initialize` (see issue #196). Rejects
     * on timeout so callers can fall back rather than hang forever.
     */
    request(method, params, timeoutMs = 5000) {
        const id = `${this.idPrefix()}-${this.nextRequestId++}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Timed out after ${timeoutMs}ms waiting for "${method}" response`));
            }, timeoutMs);
            // Don't let a pending request keep the process alive on shutdown.
            timer.unref?.();
            this.pending.set(id, {
                resolve: (value) => { clearTimeout(timer); resolve(value); },
                reject: (error) => { clearTimeout(timer); reject(error); },
            });
            this.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
        });
    }
    send(response) {
        this.write(JSON.stringify(response));
    }
    notify(method, params) {
        const notification = { jsonrpc: '2.0', method, params };
        this.write(JSON.stringify(notification));
    }
    sendResult(id, result) {
        this.send({ jsonrpc: '2.0', id, result });
    }
    sendError(id, code, message, data) {
        this.send({ jsonrpc: '2.0', id, error: { code, message, data } });
    }
    /**
     * Fail any in-flight server-initiated requests so their awaiters don't hang.
     * Called from `stop()` in subclasses.
     */
    rejectPending(reason) {
        for (const { reject } of this.pending.values()) {
            reject(new Error(reason));
        }
        this.pending.clear();
    }
    /**
     * Handle an incoming line of JSON. Both transports feed lines here.
     */
    async handleLine(line) {
        const trimmed = line.trim();
        if (!trimmed)
            return;
        let parsed;
        try {
            parsed = JSON.parse(trimmed);
        }
        catch {
            this.sendError(null, exports.ErrorCodes.ParseError, 'Parse error: invalid JSON');
            return;
        }
        // Response to a server-initiated request (has id + result/error, no method).
        // Route it to the awaiting requester instead of the message handler — these
        // used to be dropped as "Invalid Request" because they carry no method.
        const obj = parsed;
        if (obj?.jsonrpc === '2.0' &&
            typeof obj.method !== 'string' &&
            'id' in obj &&
            ('result' in obj || 'error' in obj)) {
            this.handleResponse(obj);
            return;
        }
        // Validate basic JSON-RPC structure
        if (!this.isValidMessage(parsed)) {
            this.sendError(null, exports.ErrorCodes.InvalidRequest, 'Invalid Request: not a valid JSON-RPC 2.0 message');
            return;
        }
        if (this.messageHandler) {
            try {
                if (process.env.CODEGRAPH_MCP_DEBUG) {
                    const m = parsed;
                    process.stderr.write(`[mcp-debug] recv method=${m.method} id=${String(m.id)}\n`);
                }
                await this.messageHandler(parsed);
                if (process.env.CODEGRAPH_MCP_DEBUG) {
                    const m = parsed;
                    process.stderr.write(`[mcp-debug] handled method=${m.method} id=${String(m.id)}\n`);
                }
            }
            catch (err) {
                const message = parsed;
                if ('id' in message) {
                    this.sendError(message.id, exports.ErrorCodes.InternalError, `Internal error: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }
    }
    /**
     * Resolve (or reject) the pending server-initiated request matching this
     * response's id. Unknown ids are ignored — the client may echo something we
     * never sent, or a request may have already timed out.
     */
    handleResponse(msg) {
        const id = msg.id;
        const pending = this.pending.get(id);
        if (!pending)
            return;
        this.pending.delete(id);
        if ('error' in msg && msg.error) {
            const err = msg.error;
            pending.reject(new Error(err.message || 'Request failed'));
        }
        else {
            pending.resolve(msg.result);
        }
    }
    /**
     * Check if message is a valid JSON-RPC 2.0 message
     */
    isValidMessage(msg) {
        if (typeof msg !== 'object' || msg === null)
            return false;
        const obj = msg;
        if (obj.jsonrpc !== '2.0')
            return false;
        if (typeof obj.method !== 'string')
            return false;
        return true;
    }
}
/**
 * Stdio Transport for MCP
 *
 * Reads JSON-RPC messages from stdin and writes responses to stdout. Used by
 * the direct (single-process) MCP server path, where the MCP host launches
 * one server per session and talks to it over the child's stdio. Also used by
 * shared-daemon mode for the launcher's session (with `exitOnClose: false`)
 * so the daemon outlives its launcher.
 */
class StdioTransport extends LineBasedJsonRpcTransport {
    rl = null;
    opts;
    constructor(opts = {}) {
        super();
        this.opts = {
            exitOnClose: opts.exitOnClose ?? true,
            onClose: opts.onClose ?? (() => { }),
        };
    }
    start(handler) {
        this.messageHandler = handler;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });
        this.rl.on('line', async (line) => {
            await this.handleLine(line);
        });
        // readline 'close' fires on a clean stdin EOF. But a socket-backed stdin
        // (the VS Code stdio shape) can fail with an 'error' (ECONNRESET/hangup)
        // that readline doesn't surface as 'close' — unhandled, it escalated to
        // the global uncaughtException handler (which keeps running), orphaning
        // the server and, on Linux, busy-spinning a POLLHUP fd at 100% CPU. Treat
        // 'error' as terminal too, and destroy stdin so the fd leaves epoll (#799).
        let closed = false;
        const onStreamEnd = () => {
            if (closed)
                return;
            closed = true;
            try {
                process.stdin.destroy();
            }
            catch { /* already gone */ }
            this.opts.onClose();
            if (this.opts.exitOnClose) {
                process.exit(0);
            }
        };
        this.rl.on('close', onStreamEnd);
        process.stdin.on('error', onStreamEnd);
    }
    stop() {
        if (this.stopped)
            return;
        this.stopped = true;
        this.rejectPending('Transport stopped');
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
    }
    write(line) {
        process.stdout.write(line + '\n');
    }
    idPrefix() {
        return 'cg-srv';
    }
}
exports.StdioTransport = StdioTransport;
/**
 * Socket Transport for MCP daemon sessions.
 *
 * Wraps a single `net.Socket` (Unix domain socket on POSIX, named pipe on
 * Windows). One instance per connected MCP client. Unlike {@link StdioTransport},
 * `stop()` and stream-close *don't* call `process.exit` — a daemon-side session
 * ending must not bring down the whole daemon.
 */
class SocketTransport extends LineBasedJsonRpcTransport {
    socket;
    prefix;
    buffer = '';
    closeHandlers = [];
    constructor(socket, prefix = 'cg-sock') {
        super();
        this.socket = socket;
        this.prefix = prefix;
    }
    /**
     * Register a callback fired exactly once when the socket closes (from either
     * side). Used by the daemon to decrement its connected-clients refcount.
     */
    onClose(handler) {
        this.closeHandlers.push(handler);
    }
    start(handler) {
        this.messageHandler = handler;
        this.socket.setEncoding('utf8');
        if (process.env.CODEGRAPH_MCP_DEBUG) {
            process.stderr.write(`[mcp-debug] transport attached flowing=${String(this.socket.readableFlowing)} buffered=${this.socket.readableLength}\n`);
        }
        this.socket.on('data', (chunk) => {
            if (process.env.CODEGRAPH_MCP_DEBUG)
                process.stderr.write(`[mcp-debug] transport data ${chunk.length}b\n`);
            this.buffer += chunk;
            let idx;
            // Drain every complete line; tail-fragment stays in the buffer for the
            // next chunk. The handler is async but we don't await it here — JSON-RPC
            // permits out-of-order responses, and serializing here would deadlock if
            // a handler issued a server-initiated request that needed a *later* line
            // to arrive (e.g. roots/list mid-tools-call).
            while ((idx = this.buffer.indexOf('\n')) !== -1) {
                const line = this.buffer.slice(0, idx);
                this.buffer = this.buffer.slice(idx + 1);
                void this.handleLine(line);
            }
        });
        this.socket.on('close', () => this.handleSocketClose());
        this.socket.on('error', (err) => {
            // Don't crash the daemon over a broken pipe; just shut this connection.
            process.stderr.write(`[CodeGraph daemon] socket error: ${err.message}\n`);
            this.handleSocketClose();
        });
        // The daemon's hello reader hands the socket over PAUSED (so the unshifted
        // tail can't be emitted to zero listeners and lost — the #662 wedge).
        // Attaching 'data' does not resume an explicitly-paused stream; do it here.
        // Harmless when the socket was never paused.
        this.socket.resume();
    }
    stop() {
        if (this.stopped)
            return;
        this.stopped = true;
        this.rejectPending('Transport stopped');
        if (!this.socket.destroyed) {
            this.socket.end();
            this.socket.destroy();
        }
    }
    /**
     * Write a one-shot line directly to the socket (no JSON-RPC framing applied
     * by this class — caller produces the line). The daemon uses this for the
     * hello/handshake line that precedes the JSON-RPC stream.
     */
    writeRaw(line) {
        if (!this.socket.destroyed) {
            this.socket.write(line.endsWith('\n') ? line : line + '\n');
        }
    }
    write(line) {
        if (!this.socket.destroyed) {
            this.socket.write(line + '\n');
        }
    }
    idPrefix() {
        return this.prefix;
    }
    handleSocketClose() {
        if (this.stopped)
            return;
        this.stopped = true;
        this.rejectPending('Socket closed');
        for (const h of this.closeHandlers) {
            try {
                h();
            }
            catch { /* never let a close-handler take the daemon down */ }
        }
        this.closeHandlers = [];
    }
}
exports.SocketTransport = SocketTransport;
//# sourceMappingURL=transport.js.map