#!/usr/bin/env node
/**
 * oh-my-zcode v2.0.0 — MCP scope server (stdio, zero runtime dependencies).
 *
 * 2026-08-21, v2 refonte: env-arming is GONE. Arming is BY INVOCATION: the
 * /ohmy-redteam command flow WRITES active_scope.json itself (v2 shape,
 * 60-minute window). This server only READS, REPORTS and REVOKES — it never
 * arms. Tools: get_scope (read-only) and revoke (fail-closed direction).
 * There is NO authorize tool — PermissionRequest cannot distinguish a user
 * call from an agent call, so an authorize tool would be auto-armable by a
 * hostile agent (plan decision, 2026-08-21).
 *
 * Root resolution replicates projectRoot() from hooks/gate_hook.mjs (l.432):
 * marker walk from process.cwd(), 12-hop cap, home guard, NEAREST .oh-my-zcode
 * ancestor wins, else nearest any-marker ancestor, else null. Same rule as
 * the gate — otherwise the server would report a file the gate never reads
 * (fail-closed, dead feature). If spawned outside a workspace with no
 * SCOPE_ROOT override, nothing is read or created: the gate stays closed.
 */

import { existsSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const SERVER_NAME = "oh-my-zcode-scope";
const SERVER_VERSION = "2.0.0";
const HOP_CAP = 12;

function log(msg) {
  // Diagnostics only — stdout is reserved for the JSON-RPC protocol.
  process.stderr.write(`[scope-server] ${msg}\n`);
}

function samePath(a, b) {
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/**
 * Same marker walk as projectRoot() in hooks/gate_hook.mjs.
 * Walks PAST nearer markers to find the nearest .oh-my-zcode ancestor;
 * falls back to the nearest any-marker ancestor. Spawned outside any
 * workspace (no marker ancestor) → no root → nothing read or created →
 * the gate stays closed (assumed failure mode, fail-closed direction).
 */
function resolveProjectRoot(start) {
  const home = homedir();
  const markers = [".oh-my-zcode", ".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
  // Resolve Windows 8.3 short names (e.g. ABDELK~1) to the canonical long
  // form: otherwise the home guard below silently fails when cwd and
  // homedir() spell the same directory differently (measured in harness).
  // realpathSync.native uses GetFinalPathNameByHandle and is the only variant
  // that expands short names; plain realpathSync keeps them.
  let dir;
  try {
    dir = realpathSync.native(start);
  } catch {
    try {
      dir = realpathSync(start);
    } catch {
      dir = start;
    }
  }
  let bzRoot = null;
  let markerRoot = null;
  for (let hops = 0; hops < HOP_CAP; hops += 1) {
    // Never anchor at the user's home: a stray .oh-my-zcode there would
    // capture the scope of every project on the machine.
    if (samePath(dir, home)) break;
    if (existsSync(join(dir, ".oh-my-zcode")) && bzRoot === null) bzRoot = dir;
    if (markerRoot === null) {
      for (const m of markers) {
        if (existsSync(join(dir, m))) { markerRoot = dir; break; }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return bzRoot ?? markerRoot ?? null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function rm(path) {
  try {
    unlinkSync(path);
  } catch {
    /* already gone */
  }
}

class ScopeStore {
  constructor(env) {
    this.root = env.SCOPE_ROOT ? env.SCOPE_ROOT : resolveProjectRoot(process.cwd());
    if (!this.root) {
      this.securityDir = this.scopePath = this.grantPath = null;
    } else {
      this.securityDir = join(this.root, ".oh-my-zcode", "security");
      this.scopePath = join(this.securityDir, "active_scope.json");
      this.grantPath = join(this.securityDir, ".grant");
    }
  }

  /**
   * 2026-08-21, v2 refonte: this server never arms, so startup only purges
   * orphan scope files it can no longer honor: any v1 file (no expires_at —
   * a 1.9.5 scope is transient by design; the upgrade disarms it) and any
   * v2 "userConfig" scope from the retired env-arming path. Scope files
   * written by invocation (source:"invocation", with expires_at) are left
   * alone — they belong to the /ohmy-redteam window.
   */
  startup() {
    if (!this.root) return; // no workspace root: nothing to purge, nothing to create
    const scope = readJson(this.scopePath);
    if (scope && (scope.source === "userConfig" || typeof scope.expires_at !== "string")) {
      rm(this.scopePath);
      rm(this.grantPath);
    }
  }

  armed() {
    if (!this.root) return null; // no workspace root: nothing can be armed
    const scope = readJson(this.scopePath);
    if (!scope || typeof scope.expires_at !== "string") return null; // v1 or corrupted = not armed (read path fail-closed too)
    if (new Date(scope.expires_at).getTime() <= Date.now()) return null; // expired
    return scope;
  }

  revoke() {
    if (!this.root) return;
    rm(this.scopePath);
    rm(this.grantPath); // harmless if no .grant leftover exists
  }
}

const HINT =
  "armed by running /ohmy-redteam with your target — expires in 60 minutes";

const EMPTY_SCHEMA = { type: "object", properties: {} };

const TOOLS = [
  {
    name: "get_scope",
    description:
      "Read the current security scope (targets, env, window). Read-only; arming happens by running /ohmy-redteam with your target, never via this server.",
    inputSchema: EMPTY_SCHEMA
  },
  {
    name: "revoke",
    description: "Delete the current scope file (and any grant leftover, harmlessly). Fail-closed direction: always safe for the agent to call.",
    inputSchema: EMPTY_SCHEMA
  }
];

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolResult(contentText, isError) {
  const r = { content: [{ type: "text", text: contentText }] };
  if (isError) r.isError = true;
  return r;
}

function handleRequest(store, msg) {
  const method = msg.method;
  const id = msg.id;
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
    });
  }
  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }
  if (method === "tools/call") {
    const name = msg.params && msg.params.name;
    if (name === "get_scope") {
      const scope = store.armed();
      if (scope) {
        return rpcResult(id, toolResult(JSON.stringify({
          armed: true,
          targets: scope.targets,
          env: scope.env,
          granted_at: scope.granted_at,
          expires_at: scope.expires_at,
          source: scope.source
        })));
      }
      return rpcResult(id, toolResult(JSON.stringify({ armed: false, hint: HINT })));
    }
    if (name === "revoke") {
      store.revoke();
      return rpcResult(id, toolResult(JSON.stringify({ revoked: true })));
    }
    return rpcError(id, -32602, `Unknown tool: ${String(name)}`);
  }
  if (method === "ping") {
    return rpcResult(id, {});
  }
  return rpcError(id, -32601, `Method not found: ${String(method)}`);
}

function main() {
  const store = new ScopeStore(process.env);
  store.startup();
  log(`root=${store.root}`);

  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg = null;
      try {
        msg = JSON.parse(line);
      } catch {
        // Malformed line → error response, never crash.
        process.stdout.write(`${JSON.stringify(rpcError(null, -32700, "Parse error"))}\n`);
        continue;
      }
      if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
        process.stdout.write(`${JSON.stringify(rpcError(msg && msg.id !== undefined ? msg.id : null, -32600, "Invalid Request"))}\n`);
        continue;
      }
      // Notifications (no id) get no response; notifications/initialized closes the handshake.
      if (msg.id === undefined || msg.id === null) continue;
      let response;
      try {
        response = handleRequest(store, msg);
      } catch (err) {
        response = rpcError(msg.id, -32603, `Internal error: ${err && err.message}`);
      }
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  });
  process.stdin.on("end", () => {
    // Stdin closed → clean exit.
    process.exit(0);
  });
  process.stdin.on("error", (err) => {
    log(`stdin error: ${err.message}`);
    process.exit(0);
  });
}

main();
