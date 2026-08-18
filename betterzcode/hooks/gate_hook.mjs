#!/usr/bin/env node
/**
 * BetterZcode hooks, speaking the ZCode hook protocol.
 *
 * ZCode writes one line of JSON to stdin; the script answers through its exit
 * code and JSON on stdout. Anything that is not a protocol result must go to
 * stderr, otherwise the response is corrupted.
 *
 * Three roles, selected by argv[2]:
 *
 *   session_start : injects the pipeline doctrine before the first model call.
 *   evidence      : logs the commands actually executed (PostToolUse/Bash).
 *   sources       : logs the pages actually fetched (PostToolUse/WebFetch).
 *   stop          : two gates. The evidence gate refuses a conclusion claiming
 *                   PASS without any verification command having run this turn.
 *                   The citation gate refuses a conclusion claiming SOURCES:
 *                   VERIFIED while citing a URL that was never fetched.
 *
 * ZCode constraint: `async: true` prevents a hook from injecting context or
 * blocking. These three hooks are therefore synchronous (see hooks.json).
 *
 * Robustness contract: NEVER break a session. Every exception is swallowed,
 * the exit code stays 0, and no output means "no effect".
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Injected on every session open: keep it short, it is paid for every time. */
const DOCTRINE =
  "Evidence-gated pipeline active. Three sealed roles: the Builder writes, " +
  "the Reviewer judges in a fresh context, the Verifier proves by executing. " +
  "Hard rule: whoever produces an artifact never signs its own verdict. " +
  "A plan is never executed before it is checked: as soon as an implementation " +
  "plan, an approach or a task breakdown is produced, have gate-plan-critic " +
  "verify it against the codebase before the first file is edited. " +
  "Before you sign off, run the deciding command yourself, in this session: a " +
  "subagent's commands are not traceable from here, so its proof cannot back " +
  "your signature. Delegate the work, own the verdict. " +
  "A PASS verdict citing no output from an actually executed command is void " +
  "and will be refused at the conclusion. " +
  "Every verdict ends with a final line, alone on its line: 'VERDICT: PASS' or " +
  "'VERDICT: FAIL'. " +
  "Never cap the output budget of a role that returns a verdict: a response cut " +
  "off before its last line is the leading measured cause of unparseable verdicts. " +
  "Research obeys the same law: a source is fetched and read, never inferred from a " +
  "search snippet. A report whose citations you actually opened ends with a final " +
  "line, alone on its line: 'SOURCES: VERIFIED'. Sign it and every URL you cited is " +
  "checked against what was really fetched.";

/**
 * A command only counts as PROOF if it VERIFIES something.
 * Measured in a real session (2026-08-17): the agent runs ls/find/wc at the very
 * start. Counting "any command" therefore disarmed the gate before the work even
 * began, and an untested PASS sailed through.
 */
const VERIFY_RE = new RegExp(
  [
    "pytest", "unittest", "nosetests", "tox", "coverage",
    "jest", "vitest", "mocha", "jasmine", "karma", "cypress",
    "rspec", "minitest", "phpunit", "pest",
    "go\\s+(test|vet|build)", "cargo\\s+(test|build|check|clippy|miri)",
    "dotnet\\s+(test|build)", "mvn\\s+(test|verify|package)",
    "gradlew?\\s+\\S*(test|build|check)",
    "(npm|yarn|pnpm|bun|deno)\\s+(run\\s+)?(test|build|lint|typecheck|check)",
    "tsc", "--noEmit",
    "eslint", "biome", "ruff", "flake8", "pylint", "mypy", "pyright",
    "basedpyright", "shellcheck", "golangci-lint", "clippy",
    "make", "cmake", "ctest", "pre-commit",
  ].map((p) => `\\b(?:${p})\\b`).join("|"),
  "i",
);

/**
 * The doctrine defines a verdict as "a final line, alone on its line".
 * Searching for the phrase anywhere in the text produces a false positive:
 * measured in a real session (2026-08-17T23:31:56), the agent was REFUSING to
 * sign and explaining "I cannot conclude with VERDICT: PASS" — the gate blocked
 * a perfectly correct refusal. So only the last meaningful line is examined.
 */
const PASS_LINE_RE = /^\s*\**\s*VERDICT\s*:?\s*PASS\s*\**\s*[.!]?\s*$/i;
const FENCE_RE = /^\s*`{3,}\w*\s*$/;

/**
 * The citation marker: the research counterpart of the PASS verdict.
 *
 * Same last-line-only discipline, and for the same measured reason: the first
 * evidence gate matched its phrase anywhere in the text and blocked an agent
 * that was correctly REFUSING to sign. A gate that fires on a mention rather
 * than on a signature punishes honesty.
 */
const SOURCES_LINE_RE = /^\s*\**\s*SOURCES\s*:?\s*VERIFIED\s*\**\s*[.!]?\s*$/i;

/** Last meaningful line of a message, trailing fences stripped. Shared by both gates. */
function lastLine(message) {
  const lines = String(message).trim().split(/\r?\n/).filter((l) => l.trim());
  while (lines.length && FENCE_RE.test(lines[lines.length - 1])) lines.pop();
  return lines.length ? lines[lines.length - 1] : "";
}

/** True only if the message ENDS with a PASS verdict line. */
const claimsPass = (message) => PASS_LINE_RE.test(lastLine(message));

/** True only if the message ENDS with the citation marker. */
const claimsSourcesVerified = (message) => SOURCES_LINE_RE.test(lastLine(message));

/**
 * `)` is excluded so that a markdown link `[title](https://x)` yields the URL
 * and not the closing bracket. The trade is that a URL containing a real
 * parenthesis is truncated; markdown links are far more common in agent output
 * than parenthesised URLs, and a truncated URL fails closed (it will not match
 * a fetch), which is the safe direction for a gate.
 */
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;

/**
 * Two URLs are the same source if they differ only by protocol, `www.`,
 * a trailing slash or a fragment.
 *
 * arXiv is special-cased because it serves one paper at `/abs/X`, `/pdf/X`,
 * `/pdf/X.pdf` and `/abs/Xv2`. Without this, fetching the PDF and citing the
 * abstract page — the normal way anyone reads a paper — would be a false block.
 */
function normalizeUrl(u) {
  let s = String(u).trim()
    .replace(/[.,;:!?'"`*)\]]+$/, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "");
  s = s.split("#")[0].replace(/\/+$/, "").toLowerCase();
  const arxiv = /^arxiv\.org\/(?:abs|pdf)\/(.+?)(?:v\d+)?(?:\.pdf)?$/.exec(s);
  return arxiv ? `arxiv.org/abs/${arxiv[1]}` : s;
}

/** Every URL cited in the message, normalised and deduplicated. */
function citedUrls(message) {
  return [...new Set((String(message).match(URL_RE) ?? []).map(normalizeUrl))]
    .filter(Boolean);
}

/**
 * Pages actually FETCHED during this session.
 *
 * The window is the session, not the turn — deliberately unlike the evidence
 * gate. A verdict speaks about the current state of the code, so its proof must
 * be fresh; a paper fetched twenty minutes ago still says what it said. Scoping
 * sources to the turn would force a re-fetch of every citation at write-up time.
 */
function fetchedThisSession(payload) {
  const sid = payload.session_id ?? null;
  const found = new Set();
  let raw;
  try {
    raw = readFileSync(evidencePath(payload), "utf8");
  } catch {
    return found;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (sid !== null && e.session_id !== sid) continue;
    if (e.kind === "source" && e.url) found.add(e.url);
  }
  return found;
}

async function readPayload() {
  try {
    if (process.stdin.isTTY) return {};
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Anchor the log to the project root, never to the current directory.
 *
 * Measured in a real run (2026-08-17): agents worked from a subfolder, so the
 * evidence split across three separate files and the gate read the wrong one.
 * A proof written one directory down was invisible from the root.
 */
/** Windows hands out 8.3 short names, so compare resolved paths, not strings. */
function samePath(a, b) {
  const norm = (p) => {
    let out = p;
    try {
      out = realpathSync.native ? realpathSync.native(p) : realpathSync(p);
    } catch { /* path may not exist: fall back to the raw form */ }
    out = out.replace(/[\\/]+$/, "");
    return process.platform === "win32" ? out.toLowerCase() : out;
  };
  return norm(a) === norm(b);
}

function projectRoot(payload) {
  const start = payload.cwd || process.cwd();
  const home = homedir();
  const markers = [".betterzcode", ".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
  let dir = start;
  for (let hops = 0; hops < 12; hops += 1) {
    // Never anchor at the user's home: a stray .betterzcode there would
    // capture the evidence of every project on the machine.
    if (samePath(dir, home)) break;
    for (const m of markers) {
      if (existsSync(join(dir, m))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** One log per session, addressable from the session id alone. */
function evidencePath(payload) {
  const sid = String(payload.session_id ?? "").replace(/[^\w.-]/g, "_") || "unknown";
  return join(projectRoot(payload), ".betterzcode", "evidence", `${sid}.jsonl`);
}

/** Writes the protocol JSON to stdout. Nothing else may go there. */
function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function log(payload, entry) {
  // No session id means this is not a real turn: ZCode probes the hooks with an
  // empty payload when the plugin loads. Measured: those probes wrote 22 junk
  // lines into the user's home directory. Emit nothing, write nothing.
  if (!payload.session_id) return;
  try {
    const line = {
      ...entry,
      ts: new Date().toISOString().slice(0, 19),
      session_id: payload.session_id ?? null,
    };
    const path = evidencePath(payload);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(line)}\n`, "utf8");
  } catch {
    /* logging must never break a session */
  }
}

/**
 * VERIFICATION commands run since the end of the previous turn.
 *
 * The window is the current turn, not the session: a verdict speaks about the
 * current state, so its proof must be fresh. Turn boundaries are the `turn_end`
 * entries, written on every pass of the Stop hook.
 */
function verificationsThisTurn(payload) {
  const sid = payload.session_id ?? null;
  let found = [];
  let raw;
  try {
    raw = readFileSync(evidencePath(payload), "utf8");
  } catch {
    return found;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (sid !== null && e.session_id !== sid) continue;
    if (e.kind === "turn_end") found = []; // new turn: start over
    else if (e.kind === "evidence" && e.command && VERIFY_RE.test(e.command)) {
      found.push(e.command);
    }
  }
  return found;
}

function onSessionStart(payload) {
  log(payload, { kind: "session_start", source: payload.source ?? null });
  emit({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: DOCTRINE,
    },
  });
}

/** Traces a shell command: the raw material of the evidence gate. */
function onEvidence(payload) {
  const entry = { kind: "evidence", tool: payload.tool_name ?? null };
  const ti = payload.tool_input;
  if (ti && typeof ti === "object" && ti.command) {
    entry.command = String(ti.command).slice(0, 500);
  }
  const resp = payload.tool_response;
  if (resp && typeof resp === "object") {
    const out = resp.output || resp.stdout || "";
    if (out) entry.output_tail = String(out).slice(-400);
    if ("exit_code" in resp) entry.exit_code = resp.exit_code;
  }
  log(payload, entry);
  // No output: a PostToolUse has nothing to inject here.
}

/**
 * Traces a page retrieval: the raw material of the citation gate.
 *
 * A fetch counts as a source, a search does not, and that asymmetry IS the gate.
 * A search returns a snippet selected to match the query, so a claim resting on
 * one is a claim about the snippet rather than about the document. Measured at
 * scale: across 58k claim/source pairs, 50-90% of model citations are not fully
 * supported by the source they name, and the rate collapses further on
 * open-ended questions (SourceCheckup, Nature Communications 2025).
 *
 * The input shape decides, not the tool name: a fetch carries a `url`, a search
 * carries a `query`. That keeps the handler correct if the matcher is ever
 * widened to another retrieval tool.
 */
function onSources(payload) {
  const ti = payload.tool_input;
  if (!ti || typeof ti !== "object") return;
  const url = ti.url ?? ti.URL ?? "";
  if (url) {
    log(payload, {
      kind: "source",
      tool: payload.tool_name ?? null,
      url: normalizeUrl(url),
      raw_url: String(url).slice(0, 300),
    });
    return;
  }
  // Logged for the record, never as proof of reading.
  if (ti.query) {
    log(payload, {
      kind: "search",
      tool: payload.tool_name ?? null,
      query: String(ti.query).slice(0, 200),
    });
  }
}

const EVIDENCE_BLOCK =
  "Evidence gate: this turn claims VERDICT: PASS while no VERIFICATION " +
  "command was executed during this turn. Listing files or reading code is " +
  "not proof: only a command that verifies counts (test suite, linter, type " +
  "checker, build). " +
  "Actually run one, quote its raw output and its exit code, then conclude. " +
  "If a subagent already verified this, run the deciding command yourself: " +
  "its commands are not traceable from this session, so they cannot back " +
  "your signature. " +
  "If verification is impossible here, the verdict is FAIL with the reason, " +
  "never PASS by default.";

function citationBlock(missing) {
  const head = missing.length
    ? `${missing.length} cited source(s) were never fetched in this session: ` +
      `${missing.slice(0, 8).join(", ")}. `
    : "the report cites no source at all, so the signature answers for nothing. ";
  return (
    `Citation gate: this turn signs SOURCES: VERIFIED but ${head}` +
    "A search result is not a source: a search returns a snippet selected to " +
    "match your query, so a claim resting on one is a claim about the snippet, " +
    "not about the document. Open each URL with WebFetch and read it, then cite " +
    "the exact URL you fetched. " +
    "If a source cannot be fetched, keep the claim only if you mark it " +
    "explicitly unverified, and drop the signature. The marker is optional; " +
    "signing it without having opened the sources is not."
  );
}

/**
 * The two gates. A signature is admissible only if the runtime saw what backs it.
 *
 * Evidence is evaluated first because it is the stricter claim, and only one
 * block can be emitted per turn. Both are still evaluated when a message carries
 * both signatures: a research report can conclude on code as well as on sources,
 * and each marker answers for its own claim.
 */
function onStop(payload) {
  // Already intervened this turn: let it through (ZCode caps at 3 retries).
  if (payload.stop_hook_active) {
    log(payload, { kind: "turn_end", note: "after gate retry" });
    return;
  }

  const message = String(payload.last_assistant_message ?? "");
  const closing = { kind: "turn_end" };

  if (claimsPass(message)) {
    const proofs = verificationsThisTurn(payload);
    if (!proofs.length) {
      log(payload, { kind: "gate_block", reason: "PASS without verification command" });
      emit({ decision: "block", reason: EVIDENCE_BLOCK });
      return;
    }
    closing.verified_by = proofs.slice(0, 5);
  }

  if (claimsSourcesVerified(message)) {
    const cited = citedUrls(message);
    const fetched = fetchedThisSession(payload);
    const missing = cited.filter((u) => !fetched.has(u));
    // No citation at all is also a block: a signature over an empty set is
    // vacuous, and would be the cheapest way to disarm this gate.
    if (!cited.length || missing.length) {
      log(payload, {
        kind: "gate_block",
        reason: cited.length
          ? "SOURCES: VERIFIED with unfetched citations"
          : "SOURCES: VERIFIED with no citation",
        missing: missing.slice(0, 10),
      });
      emit({ decision: "block", reason: citationBlock(missing) });
      return;
    }
    closing.sourced_by = cited.slice(0, 10);
  }

  log(payload, closing);
}

const HANDLERS = {
  session_start: onSessionStart,
  evidence: onEvidence,
  sources: onSources,
  stop: onStop,
};

async function main() {
  const kind = process.argv[2] ?? "";
  const handler = HANDLERS[kind];
  if (!handler) {
    process.stderr.write(`[swarm] unknown event: ${JSON.stringify(kind)}\n`);
    return;
  }
  handler(await readPayload());
}

try {
  await main();
} catch (err) {
  // never bring a session down
  process.stderr.write(`[swarm] ${err?.name ?? "Error"}: ${err?.message ?? err}\n`);
}
process.exit(0);
