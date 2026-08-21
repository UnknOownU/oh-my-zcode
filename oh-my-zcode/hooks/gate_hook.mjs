#!/usr/bin/env node
/**
 * BetterZcode hooks, speaking the ZCode hook protocol.
 *
 * ZCode writes one line of JSON to stdin; the script answers through its exit
 * code and JSON on stdout. Anything that is not a protocol result must go to
 * stderr, otherwise the response is corrupted.
 *
 * Six roles, selected by argv[2] — five gates (the stop handler holds three):
 *
 *   session_start : injects the pipeline doctrine before the first model call.
 *   evidence      : logs the commands actually executed (PostToolUse/Bash).
 *   sources       : logs the pages actually fetched (PostToolUse/WebFetch).
 *   scope         : the scope gate (PreToolUse/Bash). Blocks attack commands
 *                   unless a valid authorization (active_scope.json, env
 *                   dev/staging/test, matching session) exists, and confines
 *                   every URL a scoped session touches to the declared targets.
 *   dispatch      : the dispatch gate (PreToolUse/Agent|Task). A tagged
 *                   red-team subagent dispatch ([ohmy-redteam <run-id>]) is
 *                   admissible only under a valid armed scope; every other
 *                   dispatch is never touched (zero interference by
 *                   construction — detection is by routing tag, not language).
 *   stop          : three gates. The evidence gate refuses a conclusion claiming
 *                   PASS without any verification command having run this turn.
 *                   The citation gate refuses a conclusion claiming SOURCES:
 *                   VERIFIED while citing a URL that was never fetched. The
 *                   findings gate refuses a security report claiming FINDINGS:
 *                   VERIFIED without a verification command this turn.
 *
 * ZCode constraint: `async: true` prevents a hook from injecting context or
 * blocking. All of these hooks are therefore synchronous (see hooks.json).
 *
 * Robustness contract: NEVER break a session. Every exception is swallowed,
 * the exit code stays 0, and no output means "no effect".
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

/**
 * Vendored shell-quote 1.10.0 parser (parse.js, MIT, never patched). Loaded via
 * createRequire rather than a native import so that an ancestor package.json
 * flipping .js resolution to ESM cannot break the hook.
 */
const sqParse = createRequire(import.meta.url)("./vendor/shell-quote/parse.js");

/** Injected on every session open: keep it short, it is paid for every time. */
const DOCTRINE =
  "Evidence-gated pipeline active. Three sealed roles: the Builder writes, " +
  "the Reviewer judges in a fresh context, the Verifier proves by executing. " +
  "Hard rule: whoever produces an artifact never signs its own verdict. " +
  "A plan is never executed before it is checked: as soon as an implementation " +
  "plan, an approach or a task breakdown is produced, have ohmy-plan-critic " +
  "verify it against the codebase before the first file is edited — the " +
  "orchestrator relays: dedicated writers produce the scaffold and the plan. " +
  "Before you sign off, run the deciding command yourself, in this session: a " +
  "subagent's commands are not traceable from here, so its proof cannot back " +
  "your signature. Delegate the work, own the verdict. " +
  "A PASS verdict citing no output from an actually executed command is void " +
  "and will be refused at the conclusion. " +
  "Every verdict ends with a final line, alone on its line: 'VERDICT: PASS' or " +
  "'VERDICT: FAIL'. " +
  "Set max_tokens to 131072, the documented ceiling, and never below for any role " +
  "that returns a verdict: a response cut off before its last line is the leading " +
  "measured cause of unparseable verdicts, and the ceiling costs nothing you do " +
  "not generate. " +
  "Research obeys the same law: a source is fetched and read, never inferred from a " +
  "search snippet. A report whose citations you actually opened ends with a final " +
  "line, alone on its line: 'SOURCES: VERIFIED'. Sign it and every URL you cited is " +
  "checked against what was really fetched. " +
  "Security findings are findings only once reproduced: a report whose every " +
  "finding was re-executed ends with 'FINDINGS: VERIFIED' alone on the final " +
  "line, and signing it without having run the proof will be refused.";

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
    // Security tools are deterministic judges: a scan or a reproduction command
    // verifies a claim about a system the same way a test suite verifies a
    // claim about code. Bare "zap" is deliberately absent: as a word it is too
    // ambiguous and would match ordinary prose.
    "nuclei", "semgrep", "sqlmap", "nmap", "ffuf", "nikto", "naabu",
    "subfinder", "katana", "zap-baseline", "zap\\.sh",
  ].map((p) => `\\b(?:${p})\\b`).join("|"),
  "i",
);

/**
 * Commands that attack a system. Same word-boundary style and the same
 * deliberate omissions as VERIFY_RE: bare "zap" stays out — as a word it is
 * too ambiguous — while its unambiguous spellings stay in.
 */
const ATTACK_RE = new RegExp(
  [
    "nuclei", "semgrep", "sqlmap", "nmap", "ffuf", "nikto", "naabu",
    "subfinder", "katana", "hydra", "zap-baseline", "zap\\.sh",
  ].map((p) => `\\b(?:${p})\\b`).join("|"),
  "i",
);

/** The same tool names as ATTACK_RE, kept in lockstep as the typed-match list. */
const ATTACK_TOOLS = new Set([
  "nuclei", "semgrep", "sqlmap", "nmap", "ffuf", "nikto", "naabu",
  "subfinder", "katana", "hydra", "zap-baseline", "zap.sh",
]);

/**
 * Prefixes that wrap a real command without being it: env assignments,
 * POSIX niceties, and interpreters whose -c payload must be re-parsed.
 * Measured against the vendored parser: an interpreter payload arrives as
 * ONE token (`powershell -Command "nuclei -u x"` → "nuclei -u x" as a single
 * string), so the payload is re-parsed recursively, not split on spaces.
 */
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
const WRAPPERS = new Set(["env", "nice", "nohup", "time", "sudo", "command", "stdbuf", "xargs"]);
/**
 * Wrapper flags that consume a SEPARATE value token (`sudo -u root nuclei`:
 * "root" is a value, not the command). 2026-08-20, reviewer finding: skipping
 * only the bare wrapper word let the flag's VALUE become the command head, so
 * the attack tool hiding behind `sudo -u root` / `nice -n 5` / `env -u VAR`
 * was never checked — a fail-open gap in the flagship unwrap. Attached forms
 * (`-uroot`, `--flag=value`) are self-contained and need no value skip.
 */
const WRAPPER_VALUE_FLAGS = {
  sudo: new Set(["u", "g", "p", "h", "C", "U", "D", "T", "t", "r"]),
  env: new Set(["u"]),
  nice: new Set(["n"]),
  stdbuf: new Set(["o", "e", "i"]),
  xargs: new Set(["I", "L", "n", "P", "s", "j", "J"]),
};
// time / nohup / command keep bare-flag skipping: their flags take no value.
const INTERPRETERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "powershell", "pwsh", "cmd"]);
const RUN_FLAG_RE = /^(?:-[a-zA-Z]*c|--command|-Command|-command|\/c|\/C)$/;

/**
 * The command words of a shell line, typed rather than substring-matched.
 *
 * Raw ATTACK_RE.test(command) had a measured false positive (2026-08-19,
 * `grep nuclei README.md` blocked): the tool name as an ARGUMENT is not an
 * attack. This walks the parsed token stream instead:
 *   - sqParse without env: undefined $VAR → "", and `$(…)` degrades to
 *     op-split segments — every {op} token INCLUDING ( and ) starts a new
 *     segment, so `echo $(nuclei -u x)` yields nuclei as a segment head
 *     (no {command} nodes exist without env execution; none is written).
 *   - Within a segment, each string entry is one word (parse already joins
 *     quote-split pieces: `nucl"ei"` arrives as "nuclei"); non-string nodes
 *     are never stringified — `# nuclei …` parses to [{comment:…}] and
 *     comments are not commands.
 *   - Assignment prefixes, wrappers, and interpreters are unwrapped;
 *     interpreter payloads are re-parsed recursively. PowerShell/cmd are not
 *     POSIX grammars, but detection is by tool NAME — the same word in both.
 *
 * @param {string} command
 * @returns {string[]} every candidate command word (segment and unwrapped heads)
 */
function commandWords(command) {
  const tokens = sqParse(command);
  if (!Array.isArray(tokens)) return [];
  // Split on every {op} token, parentheses included: pipes, &&, ;, $( all
  // demote what follows to a fresh command position.
  const segments = [[]];
  for (const t of tokens) {
    if (t !== null && typeof t === "object" && typeof t.op === "string") segments.push([]);
    else segments[segments.length - 1].push(t);
  }
  const words = [];
  for (const segment of segments) {
    // Words: every string entry is one word (parse has already joined the
    // pieces a quote split, measured: `nucl"ei"` arrives as "nuclei").
    // Non-string nodes are NEVER stringified — a comment node is not a
    // command (`# nuclei …` parses to [{comment:…}] and must stay inert).
    const segWords = segment.filter((t) => typeof t === "string" && t !== "");
    if (!segWords.length) continue;
    words.push(...unwrapHead(segWords, 0));
  }
  return words;
}

/**
 * Walk a segment from position i, unwrapping assignments/wrappers/interpreters
 * into the accumulator; an interpreter's payload token is re-parsed via
 * commandWords (recursive by design: one nesting level per wrapper).
 */
function unwrapHead(segWords, i) {
  const out = [];
  while (i < segWords.length) {
    const w = segWords[i];
    if (ASSIGNMENT_RE.test(w)) { i++; continue; } // FOO=1 nuclei → skip prefix
    const lower = w.toLowerCase();
    if (WRAPPERS.has(lower)) {
      // 2026-08-21 debt fix: `command -v X` / `command -V X` resolves a NAME,
      // it never executes X — found live when the gate blocked its own
      // diagnostics. The whole segment is a name resolution: skip it (no
      // unwrap to a command head), and only for this exact wrapper+flag pair.
      if (lower === "command" && i + 1 < segWords.length && (segWords[i + 1] === "-v" || segWords[i + 1] === "-V")) {
        return out;
      }
      // 2026-08-20, reviewer finding: the wrapper's own flags (and the VALUE
      // some of them take) are not the command. Skip every "-…" token after
      // the wrapper; a short flag in WRAPPER_VALUE_FLAGS (exact `-u` form)
      // also skips its separate value token, a long `--flag` likewise; the
      // attached forms (`-uroot`, `--flag=value`) are self-contained. The
      // first non-flag token is the real head.
      i++;
      while (i < segWords.length && segWords[i].startsWith("-")) {
        const flag = segWords[i];
        // A value-taking flag consumes the NEXT token when its value is
        // separate: exact short form (`-u`) or bare long form (`--user`).
        // Attached forms (`-uroot`, `--user=root`) carry it inline.
        const takesValue = flag.includes("=")
          ? false
          : flag.startsWith("--")
            ? true
            : WRAPPER_VALUE_FLAGS[lower]?.has(flag.slice(1)) ?? false;
        i += takesValue ? 2 : 1;
      }
      continue;
    }
    if (INTERPRETERS.has(lower) && i + 1 < segWords.length && RUN_FLAG_RE.test(segWords[i + 1])) {
      // bash -c 'payload' / powershell -Command "payload" / cmd /c payload.
      // When the payload came quoted it is one token — re-parse it whole.
      for (let j = i + 2; j < segWords.length; j++) {
        if (typeof segWords[j] === "string" && segWords[j].includes(" ")) {
          out.push(...commandWords(segWords[j]));
        }
      }
      // Unquoted payloads: the words after the flag are the command already.
      out.push(...unwrapHead(segWords, i + 2));
      return out;
    }
    out.push(w); // a real command head
    return out;
  }
  return out;
}

/**
 * Typed attack matching: exact case-insensitive equality on the basename of a
 * command word against ATTACK_TOOLS. The whole parse+match is wrapped: ANY
 * exception (measured input that throws: `nuclei ${` → "Bad substitution")
 * falls back to the legacy ATTACK_RE on the raw string — an unparseable
 * command is broken anyway, so fail-closed is the assumed posture. This keeps
 * the robustness contract: a parser defect can never break a session.
 */
function attackIn(command) {
  try {
    return commandWords(command)
      .some((w) => ATTACK_TOOLS.has(w.split("/").pop().toLowerCase()));
  } catch {
    return ATTACK_RE.test(command);
  }
}

/** A local copy of the URL pattern: the shared one is /g and stateful. */
const SCOPE_URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;

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

/**
 * The security-report marker: the offensive counterpart of the PASS verdict.
 *
 * Same last-line-only discipline, and for the same measured reason: a gate that
 * fires on a mention rather than on a signature punishes honesty.
 */
const FINDINGS_LINE_RE = /^\s*\**\s*FINDINGS\s*:?\s*VERIFIED\s*\**\s*[.!]?\s*$/i;

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

/** True only if the message ENDS with the security-report marker. */
const claimsFindingsVerified = (message) => FINDINGS_LINE_RE.test(lastLine(message));

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
 * Parsed evidence entries for this session, oldest first. Reading the log and
 * filtering by session is shared by both gates; they differ only in WHAT they
 * count once the entries are in hand.
 */
function readEvidenceEntries(payload) {
  const sid = payload.session_id ?? null;
  let raw;
  try {
    raw = readFileSync(evidencePath(payload), "utf8");
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (sid !== null && e.session_id !== sid) continue;
    entries.push(e);
  }
  return entries;
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
  const found = new Set();
  for (const e of readEvidenceEntries(payload)) {
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

/**
 * Anchor the log to the project root, never to the current directory.
 *
 * Measured in a real run (2026-08-17): agents worked from a subfolder, so the
 * evidence split across three separate files and the gate read the wrong one.
 * A proof written one directory down was invisible from the root.
 *
 * Field incident (2026-08-19, run 20260819-2107, session 63232fdd): the agent
 * worked from lms-booster/, which has its own package.json, so the walk stopped
 * one floor BELOW the real root — the scope gate read .betterzcode at the wrong
 * level, fail-closed on a validly armed scope, and the evidence split across
 * two roots. The walk therefore NO LONGER early-returns at the first directory
 * carrying ANY marker: it walks to the hop cap / filesystem root as before,
 * REMEMBERS the first (nearest) directory carrying .betterzcode, and returns
 * that; only when no .betterzcode ancestor exists does it fall back to the
 * previous first-any-marker result. Nearest .betterzcode wins (most-specific
 * workspace when both levels carry one).
 *
 * WARNING: reordering the markers array does NOT fix this — the walk must pass
 * OVER nearer markers to find the .betterzcode ancestor.
 */
function projectRoot(payload) {
  const start = payload.cwd || process.cwd();
  const home = homedir();
  const markers = [".betterzcode", ".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
  let dir = start;
  let bzRoot = null; // nearest ancestor carrying .betterzcode
  let markerRoot = null; // nearest ancestor carrying any marker (legacy fallback)
  for (let hops = 0; hops < 12; hops += 1) {
    // Never anchor at the user's home: a stray .betterzcode there would
    // capture the evidence of every project on the machine.
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
  return bzRoot ?? markerRoot ?? start;
}

/**
 * Where evidence WRITES bootstrap when no .betterzcode ancestor exists.
 *
 * v1.9.3 Verifier finding (bootstrap poisoning): when the walk finds no
 * .betterzcode ancestor, bootstrapping at the NEAREST marker creates an orphan
 * .betterzcode one floor down; nearest-wins resolution then promotes that orphan
 * to a permanent shadow of the true root, and a scope validly armed at the real
 * root fail-closes forever. So the bootstrap goes to the WORKSPACE boundary:
 * the HIGHEST ancestor carrying .git (the repository edge), else the HIGHEST
 * ancestor carrying any marker. Once a .betterzcode exists anywhere, resolution
 * is exactly today's projectRoot and this function changes nothing (reads keep
 * today's projectRoot untouched).
 *
 * Home guard and 12-hop cap are inherited from the shared walk below.
 */
function evidenceRoot(payload) {
  const start = payload.cwd || process.cwd();
  const home = homedir();
  const markers = [".betterzcode", ".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
  let dir = start;
  let bzRoot = null; // nearest ancestor carrying .betterzcode
  let gitRoot = null; // HIGHEST ancestor carrying .git
  let markerRoot = null; // HIGHEST ancestor carrying any marker
  for (let hops = 0; hops < 12; hops += 1) {
    // Never anchor at the user's home: a stray .betterzcode there would
    // capture the evidence of every project on the machine.
    if (samePath(dir, home)) break;
    if (existsSync(join(dir, ".betterzcode")) && bzRoot === null) bzRoot = dir;
    if (existsSync(join(dir, ".git"))) gitRoot = dir; // keep climbing: highest wins
    if (existsSync(join(dir, ".betterzcode")) || markers.slice(1).some((m) => existsSync(join(dir, m)))) {
      markerRoot = dir; // keep climbing: highest wins
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return bzRoot ?? gitRoot ?? markerRoot ?? start;
}

/** One log per session, addressable from the session id alone. */
function evidencePath(payload) {
  const sid = String(payload.session_id ?? "").replace(/[^\w.-]/g, "_") || "unknown";
  return join(evidenceRoot(payload), ".betterzcode", "evidence", `${sid}.jsonl`);
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
      session_id: payload.session_id,
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
  let found = [];
  for (const e of readEvidenceEntries(payload)) {
    if (e.kind === "turn_end") found = []; // new turn: start over
    else if (e.kind === "evidence" && e.command && VERIFY_RE.test(e.command)) {
      found.push(e.command);
    }
  }
  return found;
}

/**
 * VERIFICATION commands run at any point of this session, turn boundaries
 * ignored. The findings gate needs both windows: proof must be fresh for the
 * signature itself, but a session with zero verification commands anywhere
 * contradicts a FINDINGS: VERIFIED signature the same way zero retrievals
 * contradicts SOURCES: VERIFIED.
 */
function verificationsThisSession(payload) {
  const found = [];
  for (const e of readEvidenceEntries(payload)) {
    if (e.kind === "evidence" && e.command && VERIFY_RE.test(e.command)) {
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
 * Did the retrieval actually fail?
 *
 * Deliberately CONSERVATIVE: only structured signals count, never the body text.
 * A page that merely talks about a 404 must not be treated as a failed fetch,
 * because the cost is asymmetric — missing a failure lets an agent cite a page
 * it could not read, while inventing a failure blocks an agent that read it
 * perfectly well. The second is the worse error, so anything ambiguous is
 * treated as success.
 *
 * `isError` is the field ZCode really sets on a failed tool result, observed on
 * a Bash result that exited 2 in a real session (2026-08-19).
 */
function fetchFailed(resp) {
  if (!resp || typeof resp !== "object") return false;
  if (resp.isError === true || resp.is_error === true) return true;
  if (resp.error) return true;
  const status = resp.status ?? resp.statusCode ?? resp.status_code;
  if (typeof status === "number" && status >= 400) return true;
  if (typeof resp.exit_code === "number" && resp.exit_code !== 0) return true;
  return false;
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
 * The input SHAPE decides, not the tool name: a retrieval carries a `url`, a
 * search carries a `query`. That is what makes this handler correct across
 * ZCode's built-in `WebFetch` and Z.AI's `webReader` MCP tool alike — the
 * latter takes `{ retain_images, url }`, so it is recognised without naming it.
 */
function onSources(payload) {
  const ti = payload.tool_input;
  if (!ti || typeof ti !== "object") return;
  const url = ti.url ?? ti.URL ?? "";
  if (url) {
    // A failed retrieval is recorded, but never as a source: a 403 the agent
    // never read must not be citable. Observed in a real run (2026-08-19): two
    // pages returned 403 to WebFetch and were logged as sources anyway.
    log(payload, {
      kind: fetchFailed(payload.tool_response) ? "fetch_failed" : "source",
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

/**
 * The findings gate speaks last and refuses the cheapest way to fake a security
 * report: signing over findings nobody re-ran in this session.
 */
const FINDINGS_BLOCK =
  "Findings gate: this turn signs FINDINGS: VERIFIED while no verification " +
  "command was executed during this turn. Re-run the deciding scan or the " +
  "reproduction command yourself, in this session: a subagent's commands are " +
  "not traceable from here, so they cannot back your signature. " +
  "A finding without executed proof is an allegation. " +
  "If verification is impossible here, do not sign: the marker is optional, " +
  "signing it without having run the proof is not.";

function citationBlock(missing) {
  const head = missing.length
    ? `${missing.length} cited source(s) were never fetched in this session: ` +
      `${missing.slice(0, 8).join(", ")}. `
    : "this session retrieved no page at all, so the signature answers for nothing. ";
  return (
    `Citation gate: this turn signs SOURCES: VERIFIED but ${head}` +
    "A search result is not a source: a search returns a snippet selected to " +
    "match your query, so a claim resting on one is a claim about the snippet, " +
    "not about the document. Open each URL and read it, then cite the exact URL " +
    "you retrieved. " +
    "If a source cannot be fetched, keep the claim only if you mark it " +
    "explicitly unverified, and drop the signature. The marker is optional; " +
    "signing it without having opened the sources is not."
  );
}

/**
 * Evaluates all three gates without deciding what to do about the result.
 *
 * Split out from `onStop` so the verdict can be computed even on a retry, where
 * blocking is forbidden but staying informed is not.
 *
 * Every gate whose signature is present is evaluated, and every satisfied
 * signature populates its closing fields — a research report can conclude on
 * code, sources and findings at once, and each marker answers for its own
 * claim. But at most ONE block is emitted per turn, in priority order:
 * evidence first (the stricter claim), then citation, then findings — the
 * agent must fix the most fundamental gap before the log says anything about
 * the others.
 */
function evaluateGates(payload, message) {
  const closing = { kind: "turn_end" };
  let block = null;

  if (claimsPass(message)) {
    const proofs = verificationsThisTurn(payload);
    if (!proofs.length && !block) {
      block = { reason: "PASS without verification command", text: EVIDENCE_BLOCK };
    }
    if (proofs.length) closing.verified_by = proofs.slice(0, 5);
  }

  if (claimsSourcesVerified(message)) {
    const cited = citedUrls(message);
    const fetched = fetchedThisSession(payload);
    const missing = cited.filter((u) => !fetched.has(u));
    if (!block && missing.length) {
      block = {
        reason: "SOURCES: VERIFIED with unfetched citations",
        missing,
        text: citationBlock(missing),
      };
    }
    /*
     * A signature citing nothing is refused ONLY when the session retrieved
     * nothing either.
     *
     * Measured on a real run (2026-08-19, LMS BOOSTER): the agent fetched 30
     * pages, wrote all 30 URLs into report.md — a later audit confirmed 30 cited
     * for 30 fetched, no gap either way — and then signed in a chat message that
     * carried none of them. The gate reads the message, not the artifact, so it
     * blocked a turn whose citations were perfectly backed.
     *
     * The rule this fixes: refuse a signature the log CONTRADICTS, never one the
     * log is merely silent about. Signing with zero retrievals in the whole
     * session is still a contradiction, so that case keeps blocking.
     */
    if (!block && !cited.length && !fetched.size) {
      block = { reason: "SOURCES: VERIFIED with nothing fetched", missing: [], text: citationBlock([]) };
    }
    if (!missing.length && (cited.length || fetched.size)) {
      closing.fetched_this_session = fetched.size;
      if (cited.length) closing.sourced_by = cited.slice(0, 10);
    }
  }

  if (claimsFindingsVerified(message)) {
    const proofs = verificationsThisTurn(payload);
    /*
     * Same freshness window as the evidence gate: a finding speaks about the
     * current state of a system, so its proof must be re-run in this turn. And
     * the same empty-set contradiction as the citation gate: a session with no
     * verification command at all cannot have reproduced anything.
     */
    if (!block && !proofs.length) {
      block = {
        reason: verificationsThisSession(payload).length
          ? "FINDINGS: VERIFIED with no verification this turn"
          : "FINDINGS: VERIFIED with no verification all session",
        text: FINDINGS_BLOCK,
      };
    }
    if (proofs.length) closing.findings_verified_by = proofs.slice(0, 5);
  }

  return { block, closing };
}

/** The three gates. A signature is admissible only if the runtime saw what backs it. */
function onStop(payload) {
  const { block, closing } = evaluateGates(payload, String(payload.last_assistant_message ?? ""));

  /*
   * Already intervened this turn: ZCode caps retries, so never block twice.
   * But stay open-eyed rather than blind. The previous version returned before
   * evaluating anything, which left a bypassed gate indistinguishable from a
   * satisfied one in the audit trail — the log said `turn_end` either way.
   * The turn is still closed here, because turn accounting is what scopes the
   * evidence gate to the current turn.
   */
  if (payload.stop_hook_active) {
    log(payload, block
      ? {
        kind: "turn_end",
        gate_bypassed: block.reason,
        missing: (block.missing ?? []).slice(0, 10),
        note: "retry still non-compliant; not blocked twice, by design",
      }
      : { ...closing, note: "compliant after gate retry" });
    return;
  }

  if (block) {
    log(payload, {
      kind: "gate_block",
      reason: block.reason,
      missing: (block.missing ?? []).slice(0, 10),
    });
    emit({ decision: "block", reason: block.text });
    return;
  }

  log(payload, closing);
}

/**
 * The scope gate (PreToolUse/Bash), fourth mechanical gate.
 *
 * An attack command is admissible only against a declared scope: the file
 * <root>/.betterzcode/security/active_scope.json, written by running
 * /ohmy-redteam with the target (the agent has no write path to
 * it since v2), naming the authorised targets, a non-prod env and an expiry.
 * Missing or unparsable file fails CLOSED for attack tools and stays silent
 * for everything else — a normal dev session must feel zero interference.
 */
const SCOPE_POINTER =
  "Scope gate: authorization is armed by running /ohmy-redteam with your target — it expires in 60 minutes.";

function scopeFilePath(payload) {
  return join(projectRoot(payload), ".betterzcode", "security", "active_scope.json");
}

/** Parsed scope file, or null when missing/unparsable. Null = no valid scope. */
function readScopeFile(payload) {
  try {
    return JSON.parse(readFileSync(scopeFilePath(payload), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Why the loaded scope is expired, or null when it is not (2026-08-21).
 *
 * v2 replaced the v1.9.5 session binding with expiry windows: the MCP scope
 * server stamps `expires_at` at materialization, and the hook only trusts a
 * window that is still open. An ABSENT expires_at means a pre-v2 scope file
 * written by the old agent-side flow — treated as expired, fail-closed: the
 * only legitimate writer now always stamps an expiry. Unparsable timestamps
 * fail the same way (NaN = not provably still valid = invalid).
 */
function scopeExpiredReason(scope) {
  if (scope.expires_at === undefined || scope.expires_at === null) {
    return "scope expired (pre-v2 scope file without expires_at — re-arm by running /ohmy-redteam with your target)";
  }
  const t = Date.parse(scope.expires_at);
  if (Number.isNaN(t) || t <= Date.now()) return `scope expired at ${scope.expires_at}`;
  return null;
}

/**
 * Is the loaded scope a validly ARMED v2 scope? Expiry replaces the session
 * binding (same date): targets non-empty, env non-prod, window still open.
 * Both consumers (onScope, onDispatch) must judge by this one rule so the
 * Bash gate and the dispatch gate can never disagree.
 */
function scopeArmed(scope) {
  return scope !== null
    && Array.isArray(scope.targets)
    && scope.targets.length > 0
    && typeof scope.env === "string"
    && scope.env !== "prod"
    && scopeExpiredReason(scope) === null;
}

/**
 * Cause-specific reason for an invalid scope, shared by the Bash and dispatch
 * gates (identical chain, so a mismatch would be a defect). Order matters:
 * file-level causes first, then field causes, expiry last.
 */
function scopeInvalidReason(payload, scope) {
  if (scope === null) {
    return existsSync(scopeFilePath(payload))
      ? "active_scope.json is present but malformed (unparsable JSON)"
      : "no active_scope.json — no scope armed";
  }
  if (!Array.isArray(scope.targets) || !scope.targets.length) {
    return "scope file invalid: targets is missing or empty";
  }
  if (!(typeof scope.env === "string" && scope.env !== "prod")) {
    return `scope env invalid (got ${JSON.stringify(scope.env)})`;
  }
  const expired = scopeExpiredReason(scope);
  if (expired) return expired;
  return "scope file invalid";
}

/**
 * Default ports by URL scheme. Used only for port NORMALIZATION, never for
 * widening: a target whose explicit port equals the scheme default (443/https,
 * 80/http) matches a URL of that scheme with the port implicit — the URL parser
 * drops default ports, so "https://a.com" and the target "a.com:443" must
 * reconcile. A target carrying any other explicit port still never authorizes
 * a different port.
 */
const SCHEME_DEFAULT_PORTS = { "https:": "443", "http:": "80" };

/** Split "host[:port]" into [hostname, port|null]. */
function splitHostPort(h) {
  const i = h.lastIndexOf(":");
  if (i === -1) return [h, null];
  return [h.slice(0, i), h.slice(i + 1)];
}

/**
 * Port-aware comparison of a parsed URL against a "host[:port]" target:
 * a portless target matches by hostname alone (any port); a ported target
 * requires hostname AND port equality — with the single default-port
 * normalization above (target port == scheme default, URL port implicit).
 * A ported target NEVER authorizes a different explicit port.
 */
function hostPortMatches(url, targetHost) {
  const [th, tp] = splitHostPort(targetHost);
  const hh = url.hostname.toLowerCase();
  if (!th || !hh || hh !== th) return false;
  if (tp === null || tp === "") return true;
  if (tp === url.port) return true;
  return !url.port && tp === SCHEME_DEFAULT_PORTS[url.protocol];
}

/**
 * Does a parsed URL fall inside a declared target? Exact host, or wildcard
 * suffix: "*.example.com" admits any subdomain but never the bare
 * "example.com". Both sides may carry a port; port-aware via hostPortMatches.
 */
function hostMatchesTarget(url, target) {
  const t = String(target ?? "").trim().toLowerCase();
  if (!t) return false;
  if (t.includes("://")) {
    let tHost;
    try {
      tHost = new URL(t).host.toLowerCase();
    } catch {
      return false;
    }
    return hostPortMatches(url, tHost);
  }
  const wildcard = /^\*\.(.+)$/.exec(t);
  if (wildcard) {
    const [wh, wp] = splitHostPort(wildcard[1]);
    const hh = url.hostname.toLowerCase();
    if (!hh.endsWith(`.${wh}`)) return false;
    if (wp === null || wp === "") return true;
    return wp === url.port || (!url.port && wp === SCHEME_DEFAULT_PORTS[url.protocol]);
  }
  return hostPortMatches(url, t);
}

/** Every http(s) URL parsed out of the text, in order (scheme context included). */
function commandUrls(text) {
  const urls = [];
  for (const u of String(text).match(SCOPE_URL_RE) ?? []) {
    try {
      urls.push(new URL(u));
    } catch { /* not a parseable URL: skip */ }
  }
  return urls;
}

function scopeBlock(payload, command, reason) {
  log(payload, {
    kind: "scope_block",
    reason,
    command: String(command).slice(0, 200),
  });
  emit({ decision: "block", reason: `Scope gate: ${reason}\n${SCOPE_POINTER}` });
}

function onScope(payload) {
  const ti = payload.tool_input;
  const command = ti && typeof ti === "object" ? String(ti.command ?? "") : "";
  if (!command) return;
  const head = command.slice(0, 200);
  const isAttack = attackIn(command);
  const scope = readScopeFile(payload);

  // 1. No session id: not a real turn. Attack tools still fail closed —
  //    an untraceable caller must not get the gun — everything else passes.
  if (!payload.session_id) {
    if (isAttack) {
      emit({
        decision: "block",
        reason:
          "Scope gate: attack command from a caller with no session id " +
          "(untraceable caller, fails closed).\n" + SCOPE_POINTER,
      });
    }
    return;
  }

  // 2. An attack command requires a valid armed scope: parsable file,
  //    non-empty targets, non-prod env, unexpired window. Any failure blocks.
  if (isAttack && !scopeArmed(scope)) {
    scopeBlock(payload, command, scopeInvalidReason(payload, scope));
    return;
  }

  // 3. A VALID scope active: every URL in EVERY command must land inside the
  //    declared targets — attack tool, curl, wget, anything.
  if (scopeArmed(scope)) {
    const hosts = commandUrls(command);
    const outOfScope = hosts.filter(
      (u) => !scope.targets.some((t) => hostMatchesTarget(u, t)));
    if (!outOfScope.length) {
      // 2026-08-20: the audit trail must distinguish "the gate SAW an attack
      // command pass under an armed scope" (scope_attack_pass) from plain
      // scoped traffic (scope_pass). Resolution of the LMS BOOSTER ghost
      // scope_pass: the run's real evidence lives in the TARGET project's
      // .betterzcode/evidence/, and subagent commands are invisible to hooks
      // by design — this kind is what makes the difference auditable.
      log(payload, { kind: isAttack ? "scope_attack_pass" : "scope_pass", command: head });
      return;
    }

    // 2026-08-21, surgical disarm: a MIXED command (at least one in-scope URL,
    // at least one out) is not thrown away wholesale — the offending tokens
    // are stripped via updatedInput and the in-scope work survives. All
    // out-of-scope keeps the v1.9.5 behavior (block). If stripping would
    // leave no in-scope URL at all, block instead: a disarm only preserves
    // work that remains valid, it never launders a fully out-of-scope call.
    const inScopeCount = hosts.length - outOfScope.length;
    if (inScopeCount > 0) {
      const badHosts = outOfScope.map((u) => u.host);
      const badSet = new Set(badHosts);
      const kept = command.split(/\s+/)
        .filter((tok) => tok !== ""
          && !commandUrls(tok).some((u) => badSet.has(u.host)));
      const rewritten = kept.join(" ");
      log(payload, {
        kind: "scope_disarm",
        removed: badHosts,
        command: head,
      });
      emit({
        decision: "block",
        reason:
          "Scope gate: out-of-scope URL(s) removed from the command " +
          `(${badHosts.join(", ")}); the rewritten command below is the ` +
          `authorized remainder.\n${SCOPE_POINTER}`,
        updatedInput: { command: rewritten },
      });
      return;
    }
    scopeBlock(payload, command, `host not in scope targets: ${outOfScope[0].host}`);
    return;
  }

  // 4. No valid scope and not an attack tool: a normal dev session. Allow,
  //    silently — logging every innocent command would bury the audit trail.
}

/**
 * The dispatch gate (PreToolUse/Agent|Task), fifth mechanical gate.
 *
 * Hooks do not fire inside subagents (measured in a real run: 16 invisible
 * Verifier commands), so a dispatched beast's own commands never reach the Bash
 * scope gate — but the dispatch itself is a main-session tool call, and this
 * gate stands there: a TAGGED dispatch is admissible only under a valid armed
 * scope, and while one is armed, every URL host in the prompt must land inside
 * the declared targets. Untagged dispatches are NEVER touched, whatever their
 * text — zero interference by construction.
 */
// Detection is by routing tag, not language: any intent regex matches pipeline
// prompts that quote plan/fixture text, and the gate would have blocked its own
// construction (plan-critic round 1, 2026-08-19). The tag is the only trigger.
const DISPATCH_TAG_RE = /\[ohmy-redteam[^\]]*\]/i;

function dispatchBlock(payload, reason, prompt) {
  log(payload, { kind: "dispatch_block", reason, prompt: String(prompt).slice(0, 200) });
  emit({ decision: "block", reason: `Dispatch gate: ${reason}\n${SCOPE_POINTER}` });
}

function onDispatch(payload) {
  const ti = payload.tool_input;
  const prompt = ti && typeof ti === "object"
    ? String(ti.prompt ?? ti.description ?? "")
    : "";
  // Untagged: a normal dispatch (builder, reviewer, researcher — even one
  // quoting attack tool names verbatim). Never touched, never logged.
  if (!DISPATCH_TAG_RE.test(prompt)) return;
  const head = prompt.slice(0, 200);

  // 1. No session id: an untraceable caller must not get the gun. Fail closed.
  if (!payload.session_id) {
    dispatchBlock(payload,
      "tagged dispatch from a caller with no session id (untraceable caller, fails closed)",
      head);
    return;
  }

  // 2. A tagged dispatch requires a valid armed scope, judged by the SAME
  //    rule as the Bash gate (2026-08-21: expiry window, no session binding):
  //    any failure blocks, cause-specific via the shared reason chain.
  const scope = readScopeFile(payload);
  if (!scopeArmed(scope)) {
    dispatchBlock(payload, scopeInvalidReason(payload, scope), head);
    return;
  }

  // 3. Valid scope armed: every URL host in the prompt must land inside the
  //    declared targets — same extraction and comparison as the Bash gate.
  for (const u of commandUrls(prompt)) {
    if (!scope.targets.some((t) => hostMatchesTarget(u, t))) {
      dispatchBlock(payload, `host not in scope targets: ${u.host}`, head);
      return;
    }
  }

  // 4. Allowed — but nothing is emitted: the tag reaches the beast unchanged
  //    (no rewriting), and the pass is recorded for the audit trail.
  log(payload, { kind: "dispatch_pass", prompt: head });
}

const HANDLERS = {
  session_start: onSessionStart,
  evidence: onEvidence,
  sources: onSources,
  scope: onScope,
  dispatch: onDispatch,
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
