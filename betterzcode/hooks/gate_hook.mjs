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
 *   stop          : the evidence gate. Refuses a conclusion that claims PASS
 *                   without any verification command having run this turn.
 *
 * ZCode constraint: `async: true` prevents a hook from injecting context or
 * blocking. These three hooks are therefore synchronous (see hooks.json).
 *
 * Robustness contract: NEVER break a session. Every exception is swallowed,
 * the exit code stays 0, and no output means "no effect".
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Injected on every session open: keep it short, it is paid for every time. */
const DOCTRINE =
  "Evidence-gated pipeline active. Three sealed roles: the Builder writes, " +
  "the Reviewer judges in a fresh context, the Verifier proves by executing. " +
  "Hard rule: whoever produces an artifact never signs its own verdict. " +
  "A PASS verdict citing no output from an actually executed command is void " +
  "and will be refused at the conclusion. " +
  "Every verdict ends with a final line, alone on its line: 'VERDICT: PASS' or " +
  "'VERDICT: FAIL'. " +
  "Never cap the output budget of a role that returns a verdict: a response cut " +
  "off before its last line is the leading measured cause of unparseable verdicts.";

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

/** True only if the message ENDS with a PASS verdict line. */
function claimsPass(message) {
  const lines = String(message).trim().split(/\r?\n/).filter((l) => l.trim());
  while (lines.length && FENCE_RE.test(lines[lines.length - 1])) lines.pop();
  return lines.length > 0 && PASS_LINE_RE.test(lines[lines.length - 1]);
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

function evidencePath(payload) {
  return join(payload.cwd || process.cwd(), ".betterzcode", "evidence.jsonl");
}

/** Writes the protocol JSON to stdout. Nothing else may go there. */
function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function log(payload, entry) {
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

/** Evidence gate: a PASS signature requires a real VERIFICATION. */
function onStop(payload) {
  // Already intervened this turn: let it through (ZCode caps at 3 retries).
  if (payload.stop_hook_active) {
    log(payload, { kind: "turn_end", note: "after gate retry" });
    return;
  }

  if (!claimsPass(payload.last_assistant_message ?? "")) {
    log(payload, { kind: "turn_end" });
    return;
  }

  const proofs = verificationsThisTurn(payload);
  if (proofs.length) {
    log(payload, { kind: "turn_end", verified_by: proofs.slice(0, 5) });
    return;
  }

  log(payload, { kind: "gate_block", reason: "PASS without verification command" });
  emit({
    decision: "block",
    reason:
      "Evidence gate: this turn claims VERDICT: PASS while no VERIFICATION " +
      "command was executed during this turn. Listing files or reading code is " +
      "not proof: only a command that verifies counts (test suite, linter, type " +
      "checker, build). " +
      "Actually run one, quote its raw output and its exit code, then conclude. " +
      "If verification is impossible here, the verdict is FAIL with the reason, " +
      "never PASS by default.",
  });
}

const HANDLERS = {
  session_start: onSessionStart,
  evidence: onEvidence,
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
