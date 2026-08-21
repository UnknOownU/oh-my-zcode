#!/usr/bin/env node
/**
 * Validates the plugin against the ZCode specification.
 *
 * Checks the manifest, the hooks, the subagents, the command and the skill, then
 * the coherence between the manifest defaults and the agent frontmatter (a classic
 * source of silent drift).
 *
 *   node validate_zcode.mjs [plugin_path]
 *
 * Reference: https://zcode.z.ai/en/docs/plugins and /hooks and /subagents
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HOOK_EVENTS = new Set([
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest",
  "PostToolUse", "PostToolUseFailure", "Stop",
]);
// Events whose whole point is to inject context or block:
// `async: true` is exactly what strips them of that power.
const SYNC_REQUIRED = new Set([
  "SessionStart", "UserPromptSubmit", "Stop", "PreToolUse", "PermissionRequest",
]);
const AGENT_KEYS = new Set([
  "name", "description", "model", "thoughtLevel", "color", "tools",
  "disallowedTools", "maxTurns", "injectAgentsMd", "mcpServers",
]);
const BUILTIN_TOOLS = new Set([
  "Read", "Grep", "Glob", "Bash", "Edit", "Write", "WebFetch", "WebSearch",
  "TodoWrite",
]);
const REAL_MODELS = new Set(["glm-4.5", "glm-4.6", "glm-4.7", "glm-5-turbo", "glm-5.3"]);
const ALIASES = {
  "glm-5": "glm-5.3", "glm-5.1": "glm-5.3", "glm-5.2": "glm-5.3",
  "glm-4.5-air": "glm-4.7",
};
const SCRIPT_EXT = /\.(py|mjs|js|cjs|sh|cmd)$/;

const oks = [];
const errs = [];
const warns = [];
const ok = (m) => oks.push(m);
const err = (m) => errs.push(m);
const warn = (m) => warns.push(m);

function readText(path) {
  const raw = readFileSync(path);
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    warn(`${path.split(/[\\/]/).pop()} : UTF-8 BOM present (may break parsing)`);
  }
  return raw.toString("utf8").replace(/^\uFEFF/, "");
}

/** Parses the flat YAML frontmatter of an agent/command/skill file. */
function frontmatter(path) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readText(path));
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    // Skip .betterzcode runtime dir: run artifacts in the dev workspace mutated the digest with no content change (README says gitignore it).
    if (name === ".betterzcode") continue;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function onPath(cmd) {
  const probe = process.platform === "win32" ? "where" : "which";
  return spawnSync(probe, [cmd], { encoding: "utf8" }).status === 0;
}

function checkManifest(root) {
  if (existsSync(join(root, ".claude-plugin"))) {
    err("leftover .claude-plugin/ — the plugin ships the official .zcode-plugin form; delete it");
  }
  const path = join(root, ".zcode-plugin", "plugin.json");
  if (!existsSync(path)) {
    err("manifest .zcode-plugin/plugin.json missing");
    return {};
  }
  let man;
  try {
    man = JSON.parse(readText(path));
  } catch (e) {
    err(`plugin.json : invalid JSON (${e.message})`);
    return {};
  }
  ok("manifest .zcode-plugin/plugin.json is valid");
  for (const k of ["name", "version", "description"]) {
    if (!man[k]) err(`plugin.json : field '${k}' missing`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(man.name ?? "")) {
    err(`plugin.json : name '${man.name}' breaks ^[a-z0-9][a-z0-9._-]{0,127}$`);
  }
  if (man.hooks) {
    err("plugin.json : do not declare 'hooks' — hooks/hooks.json loads automatically, "
      + "the duplicate is skipped with a diagnostic");
  } else {
    ok("plugin.json does not re-declare hooks/hooks.json (correct)");
  }
  checkMcpServers(root, man);
  return man;
}

/**
 * mcpServers (v2.0.0 surface): 4 servers — the scope server (stdio, in-plugin),
 * semgrep and osv-scanner (stdio, external binaries) and grep.app (http).
 * Each stdio in-plugin script must exist under the plugin root; each http
 * server must declare a url. A declared server whose script is missing fails
 * at spawn, silently.
 */
function checkMcpServers(root, man) {
  if (!man.mcpServers) return;
  const servers = Object.entries(man.mcpServers);
  if (servers.length !== 4) {
    err(`mcpServers : expected 4 servers (scope, semgrep, osv-scanner, grep), got ${servers.length}`);
  }
  ok(`mcpServers : ${servers.length} server(s) declared`);
  for (const [id, srv] of servers) {
    if (srv.type === "http" || srv.url) {
      if (/^https?:\/\//.test(srv.url ?? "")) {
        ok(`mcpServers.${id} : http server with url (${srv.url})`);
      } else {
        err(`mcpServers.${id} : http server without a valid url`);
      }
      continue;
    }
    if (srv.type !== "stdio") {
      err(`mcpServers.${id} : unknown transport '${srv.type}' (expected 'stdio' or 'http')`);
      continue;
    }
    const args = (srv.args ?? []).map(String);
    const target = args.find((a) => a.includes("${ZCODE_PLUGIN_ROOT}"));
    if (!target) {
      // External binaries (semgrep, osv-scanner): nothing to resolve in-tree.
      if (srv.command && !onPath(srv.command)) {
        warn(`mcpServers.${id} : '${srv.command}' not found on PATH — documented prerequisite, spawn failure is isolated`);
      }
      continue;
    }
    const rel = target.split("${ZCODE_PLUGIN_ROOT}")[1].replace(/^[\\/]+/, "");
    if (existsSync(join(root, rel))) {
      ok(`mcpServers.${id} : target script present (${rel})`);
    } else {
      err(`mcpServers.${id} : target script not found (${rel})`);
    }
  }
}

function checkHooks(root) {
  const path = join(root, "hooks", "hooks.json");
  if (!existsSync(path)) {
    warn("hooks/hooks.json missing");
    return;
  }
  let doc;
  try {
    doc = JSON.parse(readText(path));
  } catch (e) {
    err(`hooks.json : invalid JSON (${e.message})`);
    return;
  }
  if (!doc.hooks) {
    err("hooks.json : events must be nested under the 'hooks' key (ZCode format), "
      + "not at the root (Claude Code format)");
    return;
  }
  ok("hooks.json : events nested under 'hooks' (ZCode format)");

  for (const [event, groups] of Object.entries(doc.hooks)) {
    if (!HOOK_EVENTS.has(event)) {
      err(`hooks.json : unknown event '${event}'`);
      continue;
    }
    for (const group of groups) {
      if (event === "SessionStart" && !group.matcher) {
        warn("SessionStart without a matcher: will apply to startup, clear AND compact");
      }
      for (const h of group.hooks ?? []) {
        if (h.async && SYNC_REQUIRED.has(event)) {
          err(`${event} : 'async: true' prevents this hook from injecting context `
            + "or blocking — it would only log");
        }
        if (!["process", "command"].includes(h.type)) {
          err(`${event} : type '${h.type}' invalid (process or command)`);
        }
        const args = h.args ?? [];
        const blob = [h.command ?? "", ...args].join(" ");
        if (blob.includes("CLAUDE_PLUGIN_ROOT")) {
          warn(`${event} : uses CLAUDE_PLUGIN_ROOT (compat) — prefer ZCODE_PLUGIN_ROOT`);
        }
        if (h.type === "process" && h.command && !onPath(h.command)) {
          warn(`${event} : '${h.command}' not found on PATH — the hook will fail `
            + "for a user who does not have it");
        }
        for (const a of args) {
          if (String(a).includes("PLUGIN_ROOT") && SCRIPT_EXT.test(String(a))) {
            const rel = String(a).split("PLUGIN_ROOT}")[1].replace(/^[\\/]+/, "");
            if (existsSync(join(root, rel))) ok(`${event} : target script present (${rel})`);
            else err(`${event} : target script not found (${rel})`);
          }
        }
        if (!h.timeoutMs && !h.timeout) {
          warn(`${event} : no explicit timeout (default 60000 ms)`);
        }
      }
    }
  }
  for (const needed of ["SessionStart", "Stop"]) {
    if (!doc.hooks[needed]) warn(`hooks.json : no ${needed} hook`);
  }
}

function checkAgents(root) {
  const dir = join(root, "agents");
  if (!existsSync(dir)) {
    err("agents/ directory missing");
    return;
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  if (!files.length) err("no agent in agents/");
  for (const f of files) {
    const fm = frontmatter(join(dir, f));
    if (!fm) {
      err(`${f} : YAML frontmatter missing`);
      continue;
    }
    for (const k of ["name", "description"]) {
      if (!fm[k]) err(`${f} : '${k}' is required — without it the agent is silently ignored`);
    }
    const unknown = Object.keys(fm).filter((k) => !AGENT_KEYS.has(k));
    if (unknown.length) {
      err(`${f} : unknown keys ${JSON.stringify(unknown)} — ZCode ignores them WITHOUT an error`);
    }
    if ("reasoningEffort" in fm) err(`${f} : the key is 'thoughtLevel', not 'reasoningEffort'`);
    const model = fm.model;
    if (model && !REAL_MODELS.has(model) && model !== "inherit") {
      if (ALIASES[model]) {
        err(`${f} : '${model}' is an ALIAS of ${ALIASES[model]} — model diversity would be fake`);
      } else {
        warn(`${f} : model '${model}' outside the measured lineup`);
      }
    }
    if (fm.thoughtLevel && !model) {
      err(`${f} : thoughtLevel only takes effect when 'model' is explicit`);
    }
    if (model && fm.thoughtLevel) ok(`${f} : ${model} / thoughtLevel=${fm.thoughtLevel}`);
    for (const key of ["tools", "disallowedTools"]) {
      if (key in fm) {
        const bad = fm[key].split(",").map((t) => t.trim()).filter(Boolean)
          .filter((t) => !BUILTIN_TOOLS.has(t) && !t.startsWith("mcp__") && t !== "*");
        if (bad.length) err(`${f} : ${key} references tools that do not exist in ZCode ${JSON.stringify(bad)}`);
        else ok(`${f} : ${key} only references real ZCode tools`);
      }
    }
    if (fm.maxTurns && !(Number.isInteger(+fm.maxTurns) && +fm.maxTurns > 0)) {
      err(`${f} : maxTurns must be a positive integer`);
    }
  }

  // README <-> agents coherence: documentation that lies about what runs.
  // This is a real bug we shipped once: the routing table still advertised
  // glm-4.7 as Verifier after the agent had been moved to glm-5.3.
  const readme = join(root, "README.md");
  if (!existsSync(readme)) {
    warn("README.md missing: cannot check the routing table against the agents");
    return;
  }
  const roleToFile = {
    "plan critic": "ohmy-plan-critic.md",
    "scaffold critic": "ohmy-scaffold-critic.md",
    builder: "ohmy-builder.md",
    reviewer: "ohmy-reviewer.md",
    verifier: "ohmy-verifier.md",
    "source verifier": "ohmy-source-verifier.md",
    "finding verifier": "ohmy-finding-verifier.md",
  };
  let checked = 0;
  for (const line of readText(readme).split(/\r?\n/)) {
    const m = /^\|\s*([A-Za-z ]+?)\s*\|\s*`([\w.-]+)`\s*\|\s*(\w+)\s*\|/.exec(line);
    if (!m) continue;
    const fname = roleToFile[m[1].trim().toLowerCase()];
    if (!fname || !existsSync(join(dir, fname))) continue;
    const fm = frontmatter(join(dir, fname)) ?? {};
    if (fm.model !== m[2]) {
      err(`DRIFT : README says ${m[1].trim()} runs ${m[2]}, but ${fname} says ${fm.model}`);
    } else if (fm.thoughtLevel !== m[3]) {
      err(`DRIFT : README says ${m[1].trim()} at '${m[3]}', but ${fname} says '${fm.thoughtLevel}'`);
    } else {
      checked += 1;
    }
  }
  if (checked) ok(`README routing table matches the agents (${checked} roles checked)`);
  else warn("no routing row matched in README.md: the table format may have changed");
}

function checkCommandAndSkill(root) {
  const cdir = join(root, "commands");
  if (existsSync(cdir)) {
    for (const f of readdirSync(cdir).filter((x) => x.endsWith(".md")).sort()) {
      const fm = frontmatter(join(cdir, f)) ?? {};
      if (!fm.description) err(`commands/${f} : 'description' required`);
      else ok(`commands/${f} : frontmatter valid`);
    }
  }
  const sdir = join(root, "skills");
  if (existsSync(sdir)) {
    for (const sub of readdirSync(sdir).sort()) {
      const p = join(sdir, sub, "SKILL.md");
      if (!existsSync(p)) {
        err(`skills/${sub} : SKILL.md missing`);
        continue;
      }
      const fm = frontmatter(p) ?? {};
      for (const k of ["name", "description"]) {
        if (!fm[k]) err(`skills/${sub}/SKILL.md : '${k}' required`);
      }
      if (fm.name && fm.name !== sub) {
        err(`skills/${sub}/SKILL.md : name='${fm.name}' != directory '${sub}'`);
      } else {
        ok(`skills/${sub}/SKILL.md : frontmatter valid`);
      }
    }
  }
}

/**
 * Content changed but version did not: the silent failure.
 *
 * ZCode offers an update only when the marketplace entry's `version` changes.
 * Measured the hard way (2026-08-17): a fourth agent was added to the plugin
 * while the version stayed at 1.0.0, so ZCode reported "all plugins are up to
 * date" and the new agent never reached the installed copy.
 */
function checkVersionStamp(root, man) {
  const marketplace = join(dirname(root), "marketplace.json");
  if (existsSync(marketplace)) {
    try {
      const mk = JSON.parse(readText(marketplace));
      const entry = (mk.plugins ?? []).find((p) => p.name === man.name);
      // Name agreement (same severity as version drift): a plugin renamed in one
      // manifest only breaks the update path in both directions.
      const base = root.split(/[\\/]/).pop();
      const bySource = (mk.plugins ?? []).find((p) =>
        String(p.source ?? "").split(/[\\/]/).pop().replace(/^\./, "") === base);
      if (bySource && bySource.name !== man.name) {
        err(`name drift: marketplace.json says '${bySource.name}', `
          + `plugin.json says '${man.name}' — the two manifests must agree`);
      } else if (bySource) {
        ok(`marketplace.json and plugin.json agree on name '${man.name}'`);
      }
      if (!entry && !bySource) {
        err(`marketplace.json lists no plugin named '${man.name}'`);
      } else if (entry && entry.version !== man.version) {
        err(`version drift: marketplace.json says ${entry.version}, `
          + `plugin.json says ${man.version} — ZCode compares the marketplace one`);
      } else if (entry) {
        ok(`marketplace.json and plugin.json agree on version ${man.version}`);
      }
    } catch (e) {
      err(`marketplace.json : invalid JSON (${e.message})`);
    }
  }

  const hash = createHash("sha256");
  for (const p of walk(root).sort()) hash.update(readFileSync(p));
  const digest = hash.digest("hex").slice(0, 16);
  const stampFile = join(dirname(root), ".version-stamp.json");
  let stamp = null;
  try {
    stamp = JSON.parse(readFileSync(stampFile, "utf8"));
  } catch { /* first run */ }

  if (stamp && stamp.digest !== digest && stamp.version === man.version) {
    err(`content changed but version is still ${man.version} — ZCode will report `
      + '"all plugins are up to date" and ship nothing. Bump the version in BOTH '
      + "plugin.json and marketplace.json.");
    return; // keep the baseline: overwriting it here would forget what shipped
  }
  if (stamp && stamp.digest === digest) {
    ok(`content unchanged since the last validation of ${man.version}`);
  } else {
    ok(`content stamped for version ${man.version}`);
  }
  writeFileSync(stampFile, `${JSON.stringify({ version: man.version, digest }, null, 2)}\n`);
}

function checkEncoding(root) {
  const bad = [];
  for (const p of walk(root)) {
    const raw = readFileSync(p);
    if (raw.toString("utf8").includes("\uFFFD")) bad.push(relative(root, p));
  }
  if (bad.length) err(`non UTF-8 files: ${JSON.stringify(bad)}`);
  else ok("every file is valid UTF-8");
}

const HERE = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? join(HERE, "oh-my-zcode");
if (!existsSync(root)) {
  console.log(`plugin not found: ${root}`);
  process.exit(2);
}
console.log(`ZCode validation of: ${root}\n`);
const man = checkManifest(root);
checkHooks(root);
checkAgents(root);
checkCommandAndSkill(root);
checkVersionStamp(root, man);
checkEncoding(root);

for (const m of oks) console.log(`  OK    ${m}`);
for (const m of warns) console.log(`  WARN  ${m}`);
for (const m of errs) console.log(`  ERR   ${m}`);
console.log(`\n${"=".repeat(62)}`);
if (errs.length) {
  console.log(`FAILED: ${errs.length} error(s), ${warns.length} warning(s), ${oks.length} check(s) passed`);
  process.exit(1);
}
console.log(`SUCCESS: ${oks.length} checks passed, ${warns.length} warning(s)`);
