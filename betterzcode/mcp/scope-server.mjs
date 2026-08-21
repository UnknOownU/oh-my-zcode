#!/usr/bin/env node
/**
 * oh-my-zcode v2.0.0 — MCP scope server (stdio, zero runtime dependencies).
 *
 * The authorization write path is userConfig (Settings) ONLY: this server
 * READS its config from the spawn env (substituted by ${user_config.*} in
 * plugin.json) and MATERIALIZES the scope files the hooks consume. It never
 * accepts authorization from the agent. Tools: get_scope (read-only) and
 * revoke (fail-closed direction). There is NO authorize tool — PermissionRequest
 * cannot distinguish a user call from an agent call, so an authorize tool would
 * be auto-armable by a hostile agent (plan decision, 2026-08-21).
 *
 * Root resolution replicates projectRoot() from hooks/gate_hook.mjs (l.432):
 * marker walk from process.cwd(), 12-hop cap, home guard, NEAREST .betterzcode
 * ancestor wins, else nearest any-marker ancestor, else cwd. Same rule as the
 * gate — otherwise the server would write a file the gate never reads
 * (fail-closed, dead feature). If spawned outside a workspace with no
 * SCOPE_ROOT override, nothing is materialized: the gate stays closed.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const SERVER_NAME = "oh-my-zcode-scope";
const SERVER_VERSION = "2.0.0";
const VALID_ENVS = new Set(["dev", "staging", "test"]);
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
 * Walks PAST nearer markers to find the nearest .betterzcode ancestor;
 * falls back to the nearest any-marker ancestor. For the WRITE path (this
 * server) the bare-start fallback of the hook is NOT used: spawned outside
 * any workspace (no marker ancestor) → no root → nothing materialized →
 * the gate stays closed (assumed failure mode, fail-closed direction).
 */
function resolveProjectRoot(start) {
  const home = homedir();
  const markers = [".betterzcode", ".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
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
    // Never anchor at the user's home: a stray .betterzcode there would
    // capture the scope of every project on the machine.
    if (samePath(dir, home)) break;
    if (existsSync(join(dir, ".betterzcode")) && bzRoot === null) bzRoot = dir;
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

function parseTargets(raw) {
  if (!raw) return null;
  const targets = raw.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  // 2026-08-21, reviewer finding: reject unsubstituted manifest placeholders.
  // A partial host substitution (SCOPE_ENV substituted, SCOPE_TARGETS passed
  // through as the literal "${user_config.scope_targets}") would otherwise arm
  // a "target" matching no real host. A legitimate hostname never contains "${".
  if (targets.some((t) => t.includes("${"))) return null;
  return targets.length > 0 ? targets : null;
}

function parseMaxAge(raw) {
  if (raw === undefined || raw === "") return 60; // documented default
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== String(raw).trim()) return null;
  return n;
}

/** Valid config from spawn env, or null (absent/invalid = unarmed). */
function readConfig(env) {
  const targets = parseTargets(env.SCOPE_TARGETS);
  const scopeEnv = env.SCOPE_ENV;
  const maxAge = parseMaxAge(env.SCOPE_MAX_AGE_MIN);
  if (!targets) return null;
  if (!scopeEnv || !VALID_ENVS.has(scopeEnv)) return null; // "prod"/anything else = unarmed
  if (maxAge === null) return null;
  return { targets, env: scopeEnv, maxAge };
}

function configHash(cfg) {
  return createHash("sha256").update(JSON.stringify(cfg)).digest("hex");
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
    this.env = env;
    this.root = env.SCOPE_ROOT ? env.SCOPE_ROOT : resolveProjectRoot(process.cwd());
    if (!this.root) {
      this.securityDir = this.scopePath = this.grantPath = null;
    } else {
      this.securityDir = join(this.root, ".betterzcode", "security");
      this.scopePath = join(this.securityDir, "active_scope.json");
      this.grantPath = join(this.securityDir, ".grant");
    }
    this.config = readConfig(env);
  }

  /**
   * Startup materialization. Valid config → write v2 scope + .grant with a
   * granted_at STABLE across restarts (same config hash reuses the existing
   * window; different config opens a new one). Invalid/absent config →
   * materialize nothing and purge orphan scopes (v2 userConfig + any v1 file
   * without expires_at — a 1.9.5 scope is transient by design; the upgrade
   * disarms it).
   */
  startup() {
    if (!this.config || !this.root) {
      // Unarmed config OR spawned outside any workspace without SCOPE_ROOT:
      // fail-closed — purge orphans when we DO have a root, never materialize.
      if (this.root) this.purgeOrphans();
      return;
    }
    const hash = configHash(this.config);
    const existing = readJson(this.grantPath);
    const now = new Date();
    // Same config restart → keep the original granted_at (stable window).
    // Different config (or corrupted/partial state) → new window.
    const grantedAt =
      existing && typeof existing.granted_at === "string" && existing.config_hash === hash
        ? existing.granted_at
        : now.toISOString();
    const expiresAt = new Date(new Date(grantedAt).getTime() + this.config.maxAge * 60000);
    mkdirSync(this.securityDir, { recursive: true });
    writeFileSync(
      this.scopePath,
      JSON.stringify(
        {
          targets: this.config.targets,
          env: this.config.env,
          granted_at: grantedAt,
          expires_at: expiresAt.toISOString(),
          source: "userConfig"
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    writeFileSync(this.grantPath, JSON.stringify({ config_hash: hash, granted_at: grantedAt }, null, 2) + "\n", "utf8");
  }

  purgeOrphans() {
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
    rm(this.grantPath);
  }
}

const HINT =
  "arm the scope in Settings → Plugins → oh-my-zcode (scope_targets, scope_env, scope_max_age_min), then re-toggle the plugin";

const TOOLS = [
  {
    name: "get_scope",
    description:
      "Read the currently materialized security scope (targets, env, window). Read-only; arming happens in Settings (userConfig), never via this server."
  },
  {
    name: "revoke",
    description: "Delete the materialized scope and its grant record. Fail-closed direction: always safe for the agent to call."
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
          expires_at: scope.expires_at
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
  log(`root=${store.root} armed_config=${store.config ? "yes" : "no"}`);

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
