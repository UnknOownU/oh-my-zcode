#!/usr/bin/env node
/**
 * Integration tests for the evidence gate and the citation gate, run against the
 * compiled Rust executable.
 *
 * Build with cargo build, then run node test_gate.mjs.
 * OHMY_ZCODE_BIN selects the exact executable under test.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { BINARY } from "./test_proof_gate_helpers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(HERE, "plugin", ".zcode-plugin", "plugin.json"), "utf8"),
).version;

const WS = mkdtempSync(join(tmpdir(), "gate-"));
// A real workspace has a project marker; the hook anchors its log to it.
writeFileSync(join(WS, "package.json"), "{}\n");
writeFileSync(join(WS, "hosts.txt"), "https://example.test\n");
const SID = "sess-test";
let passed = 0;
let failed = 0;
let toolSequence = 0;

function run(kind, payload) {
  const body = { session_id: SID, cwd: WS, ...payload };
  if (kind === "evidence" && body.tool_name === "Bash") {
    body.tool_use_id ??= "native-test-" + (++toolSequence);
    const pre = spawnSync(BINARY, ["hook", "proof_start"], { input: JSON.stringify(body), encoding: "utf8" });
    if (pre.status !== 0) throw new Error(pre.stderr);
  }
  const p = spawnSync(BINARY, ["hook", kind], {
    input: JSON.stringify(body),
    encoding: "utf8",
  });
  if (p.status !== 0) {
    throw new Error(`exit code ${p.status} (must always be 0): ${p.stderr}`);
  }
  return (p.stdout ?? "").trim();
}

const bash = (command) =>
  run("evidence", {
    tool_name: "Bash",
    tool_input: { command },
    tool_response: { output: "ok", exit_code: 0 },
  });

const stop = (msg, active = false) =>
  run("stop", { last_assistant_message: msg, stop_hook_active: active });

const fetchUrl = (url) =>
  run("sources", {
    tool_name: "WebFetch",
    tool_input: { url },
    tool_response: { output: "<html>the full page</html>" },
  });

const searchFor = (query) =>
  run("sources", {
    tool_name: "WebSearch",
    tool_input: { query },
    tool_response: { output: "a snippet chosen to match the query" },
  });

function check(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  OK    ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}  ${detail}`);
  }
}

function blocked(out) {
  try {
    return JSON.parse(out).decision === "block";
  } catch {
    return false;
  }
}

const reset = () => rmSync(join(WS, ".oh-my-zcode"), { recursive: true, force: true });
const evidenceFile = () =>
  join(WS, ".oh-my-zcode", "evidence", `${SID.replace(/[^\w.-]/g, "_")}.jsonl`);

console.log(`Executable under test : ${BINARY}\nSandbox               : ${WS}\n`);

// 1. session-start injection
const intro = run("session_start", { source: "startup" });
check("SessionStart injects the doctrine",
  typeof JSON.parse(intro).hookSpecificOutput?.additionalContext === "string");

// 2. PASS with nothing at all
reset();
check("PASS + no command -> BLOCKS", blocked(stop("VERDICT: PASS")));

// 3. THE REAL CASE: PASS after exploration only
reset();
for (const c of [
  'ls -la "C:\\Users\\AbdelKarim\\Documents\\LMS BOOSTER"',
  'find "C:\\...\\.swarm" -type f | head -50',
  'wc -l "C:\\...\\evidence.jsonl"',
]) bash(c);
check("PASS + ls/find/wc only -> BLOCKS  (the fixed defect)",
  blocked(stop("VERDICT: PASS")));

// 4. a genuine verification
reset();
bash("npm test");
check("PASS + 'npm test' -> lets through", !blocked(stop("VERDICT: PASS")));

// 5. exploration then verification
reset();
bash("ls -la");
bash("python -m pytest -q");
check("PASS + exploration then pytest -> lets through",
  !blocked(stop("VERDICT: PASS")));

// 6. freshness: proof belongs to the previous turn only
reset();
bash("npm test");
stop("interim report, no verdict");   // closes the turn
bash("cat src/index.ts");
check("proof in PREVIOUS turn + PASS this turn -> BLOCKS",
  blocked(stop("VERDICT: PASS")));

// 7. proof retries remain enforced; an honest failure exits.
reset();
check("unbacked PASS remains blocked on retry; FAIL can end the turn",
  blocked(stop("VERDICT: PASS", true)) && !blocked(stop("VERDICT: FAIL", true)));

// 8. no verdict, no interference
reset();
check("message without a verdict -> no output", stop("done exploring") === "");

// 9. verdict spelling variants
for (const variant of ["VERDICT:PASS", "**VERDICT: PASS**", "verdict: pass"]) {
  reset();
  check(`variant detected: ${JSON.stringify(variant)}`, blocked(stop(variant)));
}

// 10. FAIL is never blocked
reset();
check("VERDICT: FAIL -> never blocked", !blocked(stop("VERDICT: FAIL")));

// 10bis. NON-REGRESSION: false positive observed in a real session
// (2026-08-17T23:31:56) - the agent was REFUSING to sign, and the gate blocked
// it because the phrase appeared inside its explanation.
const REAL_REFUSAL = `I cannot conclude with VERDICT: PASS as things stand: this session
contains no work in progress, no delivered artifact, and no output from an actually
executed command on which to base a verdict.

The pipeline rule is clear: a PASS citing no proof of real execution is void.

Give me one of those elements and I will conclude with VERDICT: PASS only if real
execution justifies it, otherwise with VERDICT: FAIL and the evidence of failure.`;
reset();
check("REFUSAL quoting the phrase in prose -> DOES NOT BLOCK  (false positive fixed)",
  !blocked(stop(REAL_REFUSAL)));

reset();
check("trailing question after an in-prose mention -> DOES NOT BLOCK",
  !blocked(stop("Should I conclude with VERDICT: PASS? Give me the artifact.")));

reset();
check("explanation THEN a final verdict line -> BLOCKS",
  blocked(stop("I reviewed the code, it all looks correct.\n\nVERDICT: PASS")));

reset();
check("verdict inside a trailing code fence -> BLOCKS",
  blocked(stop("My verdict:\n\n```\nVERDICT: PASS\n```")));

reset();
check("verdict line + trailing blank lines -> BLOCKS",
  blocked(stop("VERDICT: PASS\n\n\n")));

reset();
check("in-prose mention WITHOUT a final line -> DOES NOT BLOCK",
  !blocked(stop("The expected format is 'VERDICT: PASS' on the last line.")));

// 11. robustness: never bring a session down
for (const [kind, data] of [["stop", ""], ["session_start", "{broken"], ["unknown", "{}"]]) {
  const p = spawnSync(BINARY, ["hook", kind], { input: data, encoding: "utf8" });
  check(`robustness (${kind}, input ${JSON.stringify(data)}) -> exit 0`, p.status === 0);
}

// 12. exploration commands never count as proof
reset();
for (const c of ["git status", "cat package.json", "grep -r TODO .", "echo hello", "tree"]) {
  bash(c);
}
check("git/cat/grep/echo/tree are not proof -> BLOCKS",
  blocked(stop("VERDICT: PASS")));

// 13. evidence lands in the per-session file, not a loose one
reset();
bash("npm test");
check("evidence written to .oh-my-zcode/evidence/<session>.jsonl",
  existsSync(evidenceFile()),
  `expected ${evidenceFile()}`);

// 14. NON-REGRESSION: the log follows the project root, not the cwd.
// Measured in a real run (2026-08-17): agents worked from a subfolder and the
// evidence split across three files, so the gate read the wrong one.
reset();
mkdirSync(join(WS, "app", "deep"), { recursive: true });
run("evidence", {
  cwd: join(WS, "app", "deep"),
  tool_name: "Bash",
  tool_input: { command: "npm test" },
  tool_response: { output: "ok", exit_code: 0 },
});
check("a proof written from a subfolder lands in the ROOT log",
  existsSync(evidenceFile())
  && readFileSync(evidenceFile(), "utf8").includes("npm test"));
check("no stray log created in the subfolder",
  !existsSync(join(WS, "app", "deep", ".oh-my-zcode")));

// the gate must see that proof from the root
check("gate sees the subfolder proof and lets PASS through",
  !blocked(stop("VERDICT: PASS")));
rmSync(join(WS, "app"), { recursive: true, force: true });

// 15. probe payloads write nothing (ZCode calls hooks with an empty payload
// when the plugin loads; that used to leave junk in the home directory)
reset();
const probe = spawnSync(BINARY, ["hook", "session_start"], {
  input: JSON.stringify({ source: "startup" }), encoding: "utf8",
});
check("probe payload without session_id still injects the doctrine",
  probe.stdout.includes("additionalContext"));
check("probe payload writes no log file", !existsSync(join(WS, ".oh-my-zcode")));

// ---------------------------------------------------------------------------
// 16. CITATION GATE
// ---------------------------------------------------------------------------

// 16.1 THE CRUX: a search is not a source.
reset();
searchFor("multi-agent system failure taxonomy");
check("marker + search only, never fetched -> BLOCKS  (a snippet is not a source)",
  blocked(stop("MAST measures 41-86.7% failure rates (https://arxiv.org/abs/2503.13657).\n\nSOURCES: VERIFIED")));

// 16.2 the page was actually retrieved
reset();
fetchUrl("https://arxiv.org/abs/2503.13657");
check("marker + the cited page was fetched -> lets through",
  !blocked(stop("MAST measures 41-86.7% failure rates (https://arxiv.org/abs/2503.13657).\n\nSOURCES: VERIFIED")));

// 16.3 arXiv serves one paper under several URLs
reset();
fetchUrl("https://arxiv.org/pdf/2503.13657v2.pdf");
check("unfetched abstract URL is distinct from fetched versioned PDF",
  blocked(stop("See https://arxiv.org/abs/2503.13657 for the taxonomy.\n\nSOURCES: VERIFIED")));

// 16.4 markdown links must yield the URL, not the bracket
reset();
fetchUrl("https://www.nature.com/articles/s41467-025-58551-6");
check("markdown link syntax is extracted, not the closing bracket",
  !blocked(stop("The [SourceCheckup study](https://www.nature.com/articles/s41467-025-58551-6) measures it.\n\nSOURCES: VERIFIED")));

// 16.5 a sentence-final URL keeps its punctuation in prose
reset();
fetchUrl("https://example.org/paper");
check("unfetched path ending in punctuation stays distinct",
  blocked(stop("Full text at https://example.org/paper.\n\nSOURCES: VERIFIED")));

// 16.6 signing over an empty set would be the cheapest way to disarm the gate
reset();
check("marker with no citation at all -> BLOCKS",
  blocked(stop("I read a great deal and the literature agrees.\n\nSOURCES: VERIFIED")));

// 16.7 the gate fires on the signature, never on a mention
reset();
check("unfetched URL WITHOUT the marker -> does not block",
  !blocked(stop("You might look at https://arxiv.org/abs/2503.13657 for this.")));

reset();
check("marker quoted in prose without a final line -> does not block",
  !blocked(stop("End the report with 'SOURCES: VERIFIED' once you have opened them.")));

// 16.8 spelling variants of the signature
for (const variant of ["SOURCES:VERIFIED", "**SOURCES: VERIFIED**", "sources: verified"]) {
  reset();
  check(`marker variant detected: ${JSON.stringify(variant)}`, blocked(stop(variant)));
}

// 16.9 one missing source is enough
reset();
fetchUrl("https://arxiv.org/abs/2503.13657");
check("one source fetched, one not -> BLOCKS on the missing one",
  blocked(stop("Both https://arxiv.org/abs/2503.13657 and https://arxiv.org/abs/2406.07155 agree.\n\nSOURCES: VERIFIED")));

// 16.10 DELIBERATE DIVERGENCE from the evidence gate: sources are scoped to the
// session, not the turn. A verdict speaks about the current state of the code so
// its proof must be fresh; a paper fetched twenty minutes ago still says what it
// said. Scoping sources to the turn would force a re-fetch at write-up time.
reset();
fetchUrl("https://arxiv.org/abs/2503.13657");
stop("interim note, no signature");   // closes the turn
check("a source fetched in a PREVIOUS turn still counts (session window)",
  !blocked(stop("The [taxonomy](https://arxiv.org/abs/2503.13657) remains available.\n\nSOURCES: VERIFIED")));

// 16.11 what lands in the log
reset();
fetchUrl("https://example.org/x");
check("a fetch is logged as kind=source",
  readFileSync(evidenceFile(), "utf8").includes('"kind":"source"'));

reset();
searchFor("anything at all");
const searchLog = readFileSync(evidenceFile(), "utf8");
check("a search is logged, but never as a source",
  searchLog.includes('"kind":"search"') && !searchLog.includes('"kind":"source"'));

// 16.12 A retry cannot turn an unsupported source claim into evidence.
reset();
check("stop_hook_active -> unverified sources remain blocked",
  blocked(stop("No source here.\n\nSOURCES: VERIFIED", true)));
check("SOURCES: FAIL permits an honest failure after a blocked retry",
  !blocked(stop("SOURCES: FAIL", true)));

// 16.13 the two gates do not interfere
reset();
bash("npm test");
fetchUrl("https://example.org/x");
check("both signatures, both backed -> lets through",
  !blocked(stop("Checked and read https://example.org/x\n\nVERDICT: PASS")));

// ---------------------------------------------------------------------------
// 17. CONTRADICTED, NOT SILENT
// Regression from a real run (2026-08-19, LMS BOOSTER): the agent fetched 30
// pages, wrote all 30 URLs into report.md, and signed in a chat message that
// carried none of them. A later audit confirmed 30 cited for 30 fetched, with no
// gap either way — yet the gate blocked. It read the message, not the artifact.
// ---------------------------------------------------------------------------

reset();
for (const u of ["https://digiforma.com/prix/", "https://kaliopi.io/", "https://planor.fr/"]) fetchUrl(u);
check("pages fetched, citations live in the report file, message cites none -> DOES NOT BLOCK  (the real false positive)",
  !blocked(stop("Report written to .oh-my-zcode/research/20260819-0658_x/report.md — 30 sources opened.\n\nSOURCES: VERIFIED")));

reset();
check("signature with nothing fetched all session -> STILL BLOCKS  (a contradiction, not a silence)",
  blocked(stop("I am confident in this.\n\nSOURCES: VERIFIED")));

reset();
fetchUrl("https://example.org/a");
check("a cited URL that was never fetched still BLOCKS, fetches elsewhere notwithstanding",
  blocked(stop("Per https://example.org/b this holds.\n\nSOURCES: VERIFIED")));

// ---------------------------------------------------------------------------
// 18. A FAILED RETRIEVAL IS NOT A SOURCE
// Real run: two pages returned 403 to WebFetch and were logged as sources anyway.
// ---------------------------------------------------------------------------

const fetchFailed403 = (url) =>
  run("sources", {
    tool_name: "WebFetch",
    tool_input: { url },
    tool_response: { isError: true, output: "403 Forbidden" },
  });

reset();
fetchFailed403("https://needme.fr/metiers/formateur-independant-micro-entreprise/");
const failLog = readFileSync(evidenceFile(), "utf8");
check("a 403 is logged as kind=fetch_failed, never as a source",
  failLog.includes('"kind":"fetch_failed"') && !failLog.includes('"kind":"source"'));

check("citing a page that 403'd -> BLOCKS",
  blocked(stop("See https://needme.fr/metiers/formateur-independant-micro-entreprise/\n\nSOURCES: VERIFIED")));

reset();
fetchUrl("https://example.org/ok");
check("a successful fetch with no error field still counts as a source",
  !blocked(stop("Read https://example.org/ok\n\nSOURCES: VERIFIED")));

// ---------------------------------------------------------------------------
// 19. RETRIES KEEP THE SAME PROOF REQUIREMENTS
// The audit trail distinguishes an unsupported retry from a compliant one.
// ---------------------------------------------------------------------------

reset();
const retryOut = stop("Still nothing to show.\n\nSOURCES: VERIFIED", true);
check("retry that is still non-compliant -> remains blocked", blocked(retryOut));
check("...and the log records the current-schema gate block",
  readFileSync(evidenceFile(), "utf8").trim().split('\n').some(line => {
    const entry = JSON.parse(line);
    return entry.schema === 'oh-my-zcode/audit/v3' && entry.kind === 'gate_block';
  }));

reset();
fetchUrl("https://example.org/ok");
stop("Read https://example.org/ok\n\nSOURCES: VERIFIED", true);
const completedRetry = JSON.parse(readFileSync(evidenceFile(), "utf8").trim().split('\n').at(-1));
check("retry that IS compliant ends the current-schema turn",
  completedRetry.schema === 'oh-my-zcode/audit/v3' && completedRetry.kind === 'turn_end');

// ---------------------------------------------------------------------------
// 20. Z.AI webReader — recognised by input shape, not by tool name
// Official tool per docs.z.ai: `webReader`, input { retain_images, url }.
// ---------------------------------------------------------------------------

reset();
run("sources", {
  tool_name: "webReader",
  tool_input: { retain_images: false, url: "https://teetche.com/formateurs-independants/" },
  tool_response: { output: "page text" },
});
check("Z.AI webReader counts as a source (shape-based detection)",
  !blocked(stop("Per https://teetche.com/formateurs-independants/ the Solo plan is 49 EUR.\n\nSOURCES: VERIFIED")));

reset();
run("sources", {
  tool_name: "webSearchPrime",
  tool_input: { search_query: "logiciel formateur independant", query: "logiciel formateur independant" },
  tool_response: { output: "snippets" },
});
check("Z.AI webSearchPrime is a search, never a source",
  blocked(stop("Per https://teetche.com/formateurs-independants/ the Solo plan is 49 EUR.\n\nSOURCES: VERIFIED")));

// ---------------------------------------------------------------------------
// 21. FINDINGS GATE
// A security report signs FINDINGS: VERIFIED only when the proof ran in THIS
// turn: a finding without executed proof is an allegation. Security tools
// (nuclei, semgrep, ...) count as verification commands for both gates.
// ---------------------------------------------------------------------------

// 21.1 THE CRUX: the signature with nothing behind it
reset();
check("marker + no command at all -> BLOCKS",
  blocked(stop("XSS found in the search parameter.\n\nFINDINGS: VERIFIED")));

// 21.2 a deterministic judge ran this turn
reset();
bash("semgrep scan --config p/default .");
check("marker + 'semgrep scan --config p/default .' this turn -> lets through",
  !blocked(stop("XSS found in the search parameter.\n\nFINDINGS: VERIFIED")));

// 21.3 another security tool, another pass
reset();
bash("nuclei -l hosts.txt -silent");
check("marker + 'nuclei -l hosts.txt -silent' this turn -> lets through",
  !blocked(stop("XSS found in the search parameter.\n\nFINDINGS: VERIFIED")));

// 21.4 exploration is not reproduction
reset();
bash("ls -la");
bash("cat report.txt");
check("marker + ls/cat only -> BLOCKS",
  blocked(stop("XSS found in the search parameter.\n\nFINDINGS: VERIFIED")));

// 21.5 freshness: the scan belongs to the previous turn
reset();
bash("nuclei -l hosts.txt");
stop("interim report, no signature");   // closes the turn
check("proof in a PREVIOUS turn only -> BLOCKS  (fresh window)",
  blocked(stop("XSS found in the search parameter.\n\nFINDINGS: VERIFIED")));

// 21.6 spelling variants of the signature
for (const variant of ["FINDINGS:VERIFIED", "**FINDINGS: VERIFIED**", "findings: verified"]) {
  reset();
  check(`marker variant detected: ${JSON.stringify(variant)}`, blocked(stop(variant)));
}

// 21.7 the gate fires on the signature, never on a mention
reset();
check("marker quoted in prose without a final line -> does not block",
  !blocked(stop("End the report with 'FINDINGS: VERIFIED' once you have reproduced each finding.")));

// 21.8 findings retries also require a valid proof.
reset();
const findingsBypass = stop("Still just an allegation.\n\nFINDINGS: VERIFIED", true);
check("stop_hook_active -> unbacked findings remain blocked",
  blocked(findingsBypass));
check("...and the log records gate_block",
  readFileSync(evidenceFile(), "utf8").includes('"gate_block"'));

// 21.9 security tools are verification commands for the evidence gate too
reset();
bash("semgrep scan --config p/default .");
check("'semgrep scan --config p/default .' also lets VERDICT: PASS through",
  !blocked(stop("VERDICT: PASS")));

// 21.10 the three gates do not interfere
reset();
bash("npm test");
fetchUrl("https://example.org/x");
bash("semgrep scan --config p/default .");
check("all three signatures backed -> lets through, no block",
  !blocked(stop("Code tested, https://example.org/x read, findings reproduced.\n\nVERDICT: PASS")));

// 21.11 the empty-set contradiction, mirroring the citation gate
reset();
check("marker with ZERO verification commands the whole session -> BLOCKS",
  blocked(stop("I am confident every finding reproduces.\n\nFINDINGS: VERIFIED")));

// ---------------------------------------------------------------------------
// 22. SCOPE GATE (PreToolUse/Bash)
// Attack commands fail closed without a valid authorization on disk; a valid
// scope confines every URL the session touches to its declared targets; a
// normal dev session with no scope file feels zero interference.
// ---------------------------------------------------------------------------

const scopeFile = () => join(WS, ".oh-my-zcode", "security", "active_scope.json");
// Current authorization is written by invocation with a 60-minute window.
const writeScope = (s) => {
  const grantedAt = s.granted_at ?? new Date().toISOString();
  const expiresAt = s.expires_at
    ?? new Date(new Date(grantedAt).getTime() + 60 * 60000).toISOString();
  mkdirSync(join(WS, ".oh-my-zcode", "security"), { recursive: true });
  writeFileSync(scopeFile(), JSON.stringify({
    targets: s.targets,
    env: s.env,
    granted_at: grantedAt,
    expires_at: expiresAt,
    source: s.source ?? "invocation",
  }), "utf8");
};
// An EXPIRED window (deterministic past dates, never "now - epsilon") for the
// fail-closed expiry tests of the v2 model.
const writeExpiredScope = (s) =>
  writeScope({ ...s, granted_at: "2019-01-01T00:00:00Z", expires_at: "2020-01-01T00:00:00Z" });
const deleteScope = () => rmSync(scopeFile(), { force: true });
const scopeCmd = (command) =>
  run("scope", { tool_name: "Bash", tool_input: { command } });
const blockReason = (out) => {
  try {
    return JSON.parse(out).reason ?? "";
  } catch {
    return "";
  }
};

// 22.1 attack command, no scope file at all -> fail closed
reset();
check("nuclei with NO scope file -> BLOCKS", blocked(scopeCmd("nuclei -l hosts.txt")));

// 22.2 a valid scope authorizes the attack
reset();
writeScope({ targets: ["staging.example.com"], env: "staging" });
check("nuclei against the scoped target -> passes (no output)",
  scopeCmd("nuclei -u https://staging.example.com") === "");

// 22.3 prod is never a valid scope
reset();
writeScope({ targets: ["staging.example.com"], env: "prod" });
check("scope env 'prod' + attack -> BLOCKS", blocked(scopeCmd("nuclei -u https://staging.example.com")));

// 22.4 UPDATED 2026-08-21 (v2.0.0 model change): session binding is GONE — an
// expired window is what now fails closed. The old wrong-session fixture
// encoded the removed model.
reset();
writeExpiredScope({ targets: ["staging.example.com"], env: "staging" });
const expired22 = scopeCmd("nuclei -u https://staging.example.com");
check("EXPIRED scope + attack -> BLOCKS with reason containing 'expired'  (model rewrite 2026-08-21)",
  blocked(expired22) && blockReason(expired22).includes("expired"),
  blockReason(expired22));

// 22.5 a valid scope confines every URL, curl included
reset();
writeScope({ targets: ["staging.example.com"], env: "staging" });
check("valid scope + curl to a host NOT in targets -> BLOCKS",
  blocked(scopeCmd("curl -X GET https://other.example.com/api")));

// 22.6 the declared target itself passes
check("valid scope + curl to the scoped target -> passes",
  scopeCmd("curl -X GET https://staging.example.com/api") === "");

// 22.7 wildcard targets admit subdomains but not the bare domain
reset();
writeScope({ targets: ["*.example.com"], env: "dev" });
check("wildcard target admits a subdomain",
  scopeCmd("curl -X GET https://app.example.com/api") === "");
check("wildcard target does NOT admit the bare domain",
  blocked(scopeCmd("curl -X GET https://example.com/api")));
check("a target written as a full URL is honoured by its host",
  (writeScope({ targets: ["https://staging.example.com/x"], env: "dev" }),
   scopeCmd("curl -X GET https://staging.example.com/api") === ""));

// 22.8 no scope file, no attack tool: the dev session is untouched
reset();
check("NO scope file + curl anywhere -> passes (normal dev session)",
  scopeCmd("curl -X GET https://anything.example.com") === "");

// 22.9 malformed scope file fails closed for attack tools
reset();
mkdirSync(join(WS, ".oh-my-zcode", "security"), { recursive: true });
writeFileSync(scopeFile(), "\x00\x01 not json \x02", "utf8");
check("garbage active_scope.json + attack -> BLOCKS (fail closed)",
  blocked(scopeCmd("nuclei -l hosts.txt")));

// 22.10 no attack, no scope: silence — nothing is logged
reset();
scopeCmd("ls -la");
check("'ls -la' with no scope -> passes and logs nothing",
  !existsSync(evidenceFile())
  || !readFileSync(evidenceFile(), "utf8").includes("scope_"));

// 22.11 a block lands in the evidence log
reset();
scopeCmd("nuclei -l hosts.txt");
check("a blocked attack is logged as kind=scope_block",
  existsSync(evidenceFile())
  && readFileSync(evidenceFile(), "utf8").includes('"kind":"scope_block"'));

// and a scoped pass is logged as scope_pass
// UPDATED 2026-08-20 (v1.9.5 semantic change, plan step 3): attack commands under
// an armed scope now log kind=scope_attack_pass (asserted in 25.3). This legacy
// assertion keeps its original intent — a scoped NON-attack command logs
// scope_pass — by scoping `ls -la` instead of a nuclei command.
reset();
writeScope({ targets: ["staging.example.com"], env: "staging" });
scopeCmd("ls -la");
check("a scoped pass is logged as kind=scope_pass",
  readFileSync(evidenceFile(), "utf8").includes('"kind":"scope_pass"'));

// 22.12 payloads without a session id: attack fails closed, curl passes
const noSession = (command) => {
  const p = spawnSync(BINARY, ["hook", "scope"], {
    input: JSON.stringify({ cwd: WS, tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  if (p.status !== 0) throw new Error(`exit code ${p.status} (must always be 0): ${p.stderr}`);
  return (p.stdout ?? "").trim();
};
reset();
check("attack with NO session_id -> BLOCKS", blocked(noSession("nuclei -l hosts.txt")));
check("curl with NO session_id -> passes (no output)",
  noSession("curl -X GET https://anything.example.com") === "");

// 22.13 lifecycle: authorized while the scope exists, blocked once removed
reset();
writeScope({ targets: ["staging.example.com"], env: "staging" });
check("lifecycle: scope written -> attack passes",
  scopeCmd("nuclei -u https://staging.example.com") === "");
deleteScope();
check("lifecycle: scope deleted -> the SAME attack BLOCKS again",
  blocked(scopeCmd("nuclei -u https://staging.example.com")));

// 22.14 the incident repro: port-aware targets across the whole chain
reset();
writeScope({ targets: ["localhost:3000"], env: "dev" });
check("ported target authorizes its own port (incident repro)",
  scopeCmd("curl -s http://localhost:3000/") === "");
check("ported target does NOT authorize a different port (no widening)",
  blocked(scopeCmd("curl -s http://localhost:4000/")));
writeScope({ targets: ["localhost"], env: "dev" });
check("portless target still matches a ported URL host",
  scopeCmd("curl -s http://localhost:3000/") === "");

// 22.15 the block reason names the offending host (actionable diagnostics)
reset();
writeScope({ targets: ["staging.example.com"], env: "staging" });
const mismatch = scopeCmd("curl -X GET https://other.example.com/api");
check("host-mismatch block reason CONTAINS the offending host",
  blocked(mismatch) && blockReason(mismatch).includes("other.example.com"));

// ---------------------------------------------------------------------------
// 23. DISPATCH GATE (PreToolUse/Agent|Task)
// UPDATED 2026-08-21 (v2 refonte): the routing tag is [ohmy-redteam <run-id>]
// (DISPATCH_TAG_RE /\[ohmy-redteam[^\]]*\]/i). A tagged red-team dispatch
// under a valid armed scope, and while one is armed every URL host in the
// prompt must land inside the targets. Untagged dispatches are NEVER touched,
// whatever their text — zero interference by construction (detection is by
// routing tag, not language; plan-critic round 1, 2026-08-19).
// ---------------------------------------------------------------------------

const dispatch = (prompt, extra = {}) =>
  run("dispatch", {
    tool_name: "Agent",
    tool_input: { prompt, description: prompt, subagent_type: "ohmy-redteam-beast" },
    ...extra,
  });
const TAGGED = "[ohmy-redteam 20260821-0900] run nuclei against https://x.example.com";

// 23.1 tagged dispatch, no scope file at all -> fail closed
reset();
check("tagged dispatch with NO scope file -> BLOCKS", blocked(dispatch(TAGGED)));

// 23.2 a valid scope authorizes the tagged dispatch (and emits nothing)
reset();
writeScope({ targets: ["x.example.com"], env: "dev" });
check("tagged dispatch under a valid scope -> passes (no output)",
  dispatch(TAGGED) === "");
check("...and the pass is logged as kind=dispatch_pass",
  existsSync(evidenceFile())
  && readFileSync(evidenceFile(), "utf8").includes('"kind":"dispatch_pass"'),
  `expected ${evidenceFile()} (a missing log is a FAIL, never a crash)`);

// 23.3 ZERO-INTERFERENCE FREEZES (the contract): untagged dispatches quoting
// this plan's own text verbatim are never touched, no scope armed.
reset();
const UNTOUCHED = [
  "run nuclei against https://x.example.com",                          // the fixture sentence, no tag
  "markers: `nuclei`, `sqlmap`, `ffuf`",                               // tool names in backticks
  "exploit the target, escalate, exfiltrate the data",                 // an imperative sentence
  "compare pentest benchmarks and red-team tooling coverage",          // a research-style prompt
];
for (const p of UNTOUCHED) {
  check(`untagged dispatch NEVER touched: ${JSON.stringify(p.slice(0, 40))}`,
    dispatch(p) === "");
}

// 23.4 prod is never a valid scope
reset();
writeScope({ targets: ["x.example.com"], env: "prod" });
check("tagged dispatch + scope env 'prod' -> BLOCKS", blocked(dispatch(TAGGED)));

// 23.5 UPDATED 2026-08-21 (v2.0.0 model change): the session binding is GONE —
// expiry windows replaced it, so the old wrong-session fixture (and its
// both-session-ids reason assertion) no longer models anything. A tagged
// dispatch under an EXPIRED window fails closed, reason names the expiry.
reset();
writeExpiredScope({ targets: ["x.example.com"], env: "dev" });
const expiredDispatch = dispatch(TAGGED);
check("tagged dispatch + EXPIRED scope -> BLOCKS  (model rewrite 2026-08-21)",
  blocked(expiredDispatch));
check("...and the reason contains 'expired'",
  blockReason(expiredDispatch).includes("expired"),
  blockReason(expiredDispatch));

// 23.6 an armed scope confines the prompt: an out-of-scope host blocks
reset();
writeScope({ targets: ["x.example.com"], env: "dev" });
const offTarget = dispatch("[ohmy-redteam 20260821-0900] run nuclei against https://other.example.com");
check("armed scope + tagged prompt naming an out-of-scope host -> BLOCKS",
  blocked(offTarget));
check("...and the reason contains the offending host",
  blockReason(offTarget).includes("other.example.com"));

// 23.7 payloads without a session id: tagged fails closed, untagged passes
const noSessionDispatch = (prompt) => {
  const p = spawnSync(BINARY, ["hook", "dispatch"], {
    input: JSON.stringify({
      cwd: WS,
      tool_name: "Agent",
      tool_input: { prompt, description: prompt, subagent_type: "beast" },
    }),
    encoding: "utf8",
  });
  if (p.status !== 0) throw new Error(`exit code ${p.status} (must always be 0): ${p.stderr}`);
  return (p.stdout ?? "").trim();
};
reset();
check("tagged dispatch with NO session_id -> BLOCKS (fail closed)",
  blocked(noSessionDispatch(TAGGED)));
check("untagged fixture with NO session_id -> passes (untouched)",
  noSessionDispatch("run nuclei against https://x.example.com") === "");

// 23.8 malformed scope file fails closed
reset();
mkdirSync(join(WS, ".oh-my-zcode", "security"), { recursive: true });
writeFileSync(scopeFile(), "\x00\x01 not json \x02", "utf8");
check("garbage active_scope.json + tagged dispatch -> BLOCKS (fail closed)",
  blocked(dispatch(TAGGED)));

// 23.9 every block reason carries the /ohmy-redteam pointer
// (UPDATED 2026-08-21, v2 refonte: SCOPE_POINTER names /ohmy-redteam)
reset();
deleteScope();
const noScopeBlock = dispatch(TAGGED);
check("every block reason contains '/ohmy-redteam'",
  blocked(noScopeBlock) && blockReason(noScopeBlock).includes("/ohmy-redteam"));

// 23.10 a blocked tagged dispatch lands in the evidence log
check("a blocked tagged dispatch is logged as kind=dispatch_block",
  existsSync(evidenceFile())
  && readFileSync(evidenceFile(), "utf8").includes('"kind":"dispatch_block"'),
  `expected ${evidenceFile()} (a missing log is a FAIL, never a crash)`);

// 23.11 the tag is inherited: the passing path emits NOTHING (no rewriting —
// the tag/prompt reach the beast unchanged)
reset();
writeScope({ targets: ["x.example.com"], env: "dev" });
check("passing tagged dispatch emits NOTHING (stdout empty)",
  dispatch(TAGGED) === "");

// 23.12 THE INCIDENT REGRESSION (run 20260819-2107): a subfolder with its own
// package.json must no longer hide the parent .oh-my-zcode — the walk passes
// OVER nearer markers and prefers the nearest .oh-my-zcode ancestor.
reset();
mkdirSync(join(WS, "incident", "app"), { recursive: true });
writeFileSync(join(WS, "incident", "app", "package.json"), "{}\n"); // the hiding marker
writeScope({ targets: ["x.example.com"], env: "dev" });
// writeScope writes at WS level; the scope file must move to the WS/incident root
mkdirSync(join(WS, "incident", ".oh-my-zcode", "security"), { recursive: true });
writeFileSync(join(WS, "incident", ".oh-my-zcode", "security", "active_scope.json"),
  JSON.stringify({ targets: ["x.example.com"], env: "dev", granted_at: "2026-08-21T00:00:00Z", expires_at: "2099-01-01T00:00:00Z", source: "invocation" }), "utf8");
const fromApp = (kind, toolInput) => {
  const p = spawnSync(BINARY, ["hook", kind], {
    input: JSON.stringify({
      session_id: SID,
      cwd: join(WS, "incident", "app"),
      tool_name: "Bash",
      tool_input: toolInput,
    }),
    encoding: "utf8",
  });
  if (p.status !== 0) throw new Error(`exit code ${p.status}: ${p.stderr}`);
  return (p.stdout ?? "").trim();
};
check("incident: scope armed at the parent root, cwd in a subfolder with its own package.json -> attack PASSES",
  fromApp("scope", { command: "nuclei -u https://x.example.com" }) === "");
check("incident: evidence lands in the parent .oh-my-zcode (no split)",
  existsSync(join(WS, "incident", ".oh-my-zcode", "evidence", `${SID}.jsonl`))
  && !existsSync(join(WS, "incident", "app", ".oh-my-zcode")));
// nearest-wins: a .oh-my-zcode at WS/incident/app now shadows the parent — the
// scope written only at WS/incident is no longer found, the attack blocks.
mkdirSync(join(WS, "incident", "app", ".oh-my-zcode"), { recursive: true });
check("nearest-wins: a nearer .oh-my-zcode shadows the parent scope -> attack BLOCKS",
  blocked(fromApp("scope", { command: "nuclei -u https://x.example.com" })));
rmSync(join(WS, "incident"), { recursive: true, force: true });

// ---------------------------------------------------------------------------
// 24. BOUNDARY BOOTSTRAP + DEFAULT PORTS
// 24.1-24.3 freeze the v1.9.3 Verifier finding (bootstrap poisoning): an
// evidence bootstrap at the NEAREST marker creates an orphan .oh-my-zcode that
// nearest-wins promotes to a permanent shadow of the true root. Evidence
// writes therefore bootstrap at the WORKSPACE boundary (highest .git ancestor,
// else highest marker ancestor) when no .oh-my-zcode ancestor exists.
// 24.4-24.6 freeze default-port normalization: a target whose explicit port
// equals the scheme default matches an implicit-port URL of that scheme, and
// a ported target never authorizes a different explicit port.
// ---------------------------------------------------------------------------

const hookRun = (kind, payload) => {
  const p = spawnSync(BINARY, ["hook", kind], {
    input: JSON.stringify({ session_id: SID, ...payload }),
    encoding: "utf8",
  });
  if (p.status !== 0) throw new Error(`exit code ${p.status}: ${p.stderr}`);
  return (p.stdout ?? "").trim();
};
const attackFrom = (cwd) =>
  hookRun("scope", { cwd, tool_name: "Bash", tool_input: { command: "nuclei -u https://x.example.com" } });
const evFile = (root) => join(root, ".oh-my-zcode", "evidence", `${SID}.jsonl`);

// 24.1 WS and WS/app both carry package.json, no .oh-my-zcode anywhere:
// a scope BLOCK (evidence write) bootstraps at WS, NOT at the nearest marker.
const W1 = mkdtempSync(join(tmpdir(), "gate-boot-"));
mkdirSync(join(W1, "app"), { recursive: true });
writeFileSync(join(W1, "package.json"), "{}\n");
writeFileSync(join(W1, "app", "package.json"), "{}\n");
check("24.1 poison-free bootstrap: block from WS/app writes evidence at WS",
  blocked(attackFrom(join(W1, "app")))
  && existsSync(evFile(W1))
  && !existsSync(join(W1, "app", ".oh-my-zcode")));

// 24.3 the incident's happy ending: with the bootstrap landed at WS, arming the
// scope at WS works from WS/app — no orphan shadow, no fail-closed lockout.
mkdirSync(join(W1, ".oh-my-zcode", "security"), { recursive: true });
writeFileSync(join(W1, ".oh-my-zcode", "security", "active_scope.json"),
  JSON.stringify({ targets: ["x.example.com"], env: "dev", granted_at: "2026-08-21T00:00:00Z", expires_at: "2099-01-01T00:00:00Z", source: "invocation" }), "utf8");
check("24.3 scope armed at WS is honoured from WS/app (attack PASSES)",
  attackFrom(join(W1, "app")) === "");
rmSync(W1, { recursive: true, force: true });

// 24.2 same setup + .git at WS: the bootstrap lands at WS even though app is
// the nearest marker (repository edge preferred).
const W2 = mkdtempSync(join(tmpdir(), "gate-git-"));
mkdirSync(join(W2, "app"), { recursive: true });
mkdirSync(join(W2, ".git"), { recursive: true });
writeFileSync(join(W2, "package.json"), "{}\n");
writeFileSync(join(W2, "app", "package.json"), "{}\n");
check("24.2 .git ancestor wins over the nearest marker",
  blocked(attackFrom(join(W2, "app")))
  && existsSync(evFile(W2))
  && !existsSync(join(W2, "app", ".oh-my-zcode")));
rmSync(W2, { recursive: true, force: true });

// 24.7 fresh workspace unchanged: cwd == WS root, no .oh-my-zcode -> the first
// session_start log write creates WS/.oh-my-zcode (the SessionStart case).
const W3 = mkdtempSync(join(tmpdir(), "gate-fresh-"));
writeFileSync(join(W3, "package.json"), "{}\n");
hookRun("session_start", { cwd: W3, source: "startup" });
check("24.7 fresh workspace: first log write creates WS/.oh-my-zcode",
  existsSync(evFile(W3)));
rmSync(W3, { recursive: true, force: true });

// 24.4 default-port normalization: target :443 + implicit-port https URL
reset();
writeScope({ targets: ["example.com:443"], env: "dev" });
check("24.4 target example.com:443 + https://example.com/x -> PASSES (gap closed)",
  scopeCmd("curl -s https://example.com/x") === "");

// 24.5 the http counterpart
writeScope({ targets: ["example.com:80"], env: "dev" });
check("24.5 target example.com:80 + http://example.com/x -> PASSES",
  scopeCmd("curl -s http://example.com/x") === "");

// 24.6 NO WIDENING: an explicit non-default port never matches the target port
writeScope({ targets: ["example.com:443"], env: "dev" });
check("24.6 target example.com:443 + https://example.com:8443/x -> BLOCKS (no widening)",
  blocked(scopeCmd("curl -s https://example.com:8443/x")));

// re-assert: a portless target matches any port (unchanged behavior)
writeScope({ targets: ["example.com"], env: "dev" });
check("portless target still matches a ported URL host",
  scopeCmd("curl -s https://example.com:8443/x") === "");

// ---------------------------------------------------------------------------
// 25. TOKEN-MATCHED SCOPE GATE (v1.9.5)
// Incident 2026-08-19, smoke test sess_1ba6b6da: `grep nuclei README.md` was
// BLOCKED by the old substring ATTACK_RE. The gate now matches attack tools on
// parsed command words: quotes, assignment
// prefixes, wrappers, interpreters, pipes and $(...) cannot hide the tool word,
// and a tool name that is merely an ARGUMENT no longer trips the gate.
// Malformed shell syntax must never authorize an attack command.
// ---------------------------------------------------------------------------

const ATTACK = "nuclei -u https://x.example.com";
const armScope = () =>
  writeScope({ targets: ["x.example.com"], env: "dev" });

// 25.1 THE INCIDENT: `nuclei` as an argument is not an attack
reset();
check("25.1 'grep nuclei README.md' with NO scope -> PASSES  (the 2026-08-19 incident, sess_1ba6b6da)",
  scopeCmd("grep nuclei README.md") === "");

// 25.2 the tool as the command word still fails closed
reset();
check("25.2 'nuclei -u https://x.example.com' with NO scope -> BLOCKS",
  blocked(scopeCmd(ATTACK)));

// 25.3 armed scope: the attack passes AND is observably an attack
reset();
armScope();
check("25.3 armed scope + attack -> passes",
  scopeCmd(ATTACK) === "");
check("25.3 ...and is logged as kind=scope_attack_pass  (the LMS BOOSTER ghost, resolved)",
  existsSync(evidenceFile())
  && readFileSync(evidenceFile(), "utf8").includes('"kind":"scope_attack_pass"'));

// 25.4 an ordinary command under the same armed scope is a plain scope_pass
reset();
armScope();
scopeCmd("ls -la");
check("25.4 ordinary command under armed scope -> kind=scope_pass (not attack)",
  readFileSync(evidenceFile(), "utf8").includes('"kind":"scope_pass"')
  && !readFileSync(evidenceFile(), "utf8").includes('"kind":"scope_attack_pass"'));

// 25.5-25.14 hiding the tool word: everything still blocks (or passes, when
// the tool word is only an argument)
reset();
check("25.5 'FOO=1 nuclei -u ...' -> BLOCKS  (assignment prefix skipped)",
  blocked(scopeCmd(`FOO=1 ${ATTACK}`)));
check("25.6 'sudo nuclei ...' -> BLOCKS  (POSIX wrapper unwrapped)",
  blocked(scopeCmd(`sudo ${ATTACK}`)));
check("25.7 'env nuclei ...' -> BLOCKS  (POSIX wrapper unwrapped)",
  blocked(scopeCmd(`env ${ATTACK}`)));
check("25.8 '/usr/bin/nuclei -u ...' -> BLOCKS  (basename comparison)",
  blocked(scopeCmd("/usr/bin/nuclei -u https://x.example.com")));
check("25.9 \"bash -c 'nuclei -u ...'\" -> BLOCKS  (interpreter, single quotes)",
  blocked(scopeCmd(`bash -c '${ATTACK}'`)));
check("25.10 'sh -c \"nuclei ...\"' -> BLOCKS  (interpreter, double quotes)",
  blocked(scopeCmd(`sh -c "${ATTACK}"`)));
check("25.11 'echo x | nuclei -u ...' -> BLOCKS  (pipe segment head)",
  blocked(scopeCmd(`echo x | ${ATTACK}`)));
check("25.12 'cat file | grep nuclei' -> PASSES  (argument, not a command word)",
  scopeCmd("cat file | grep nuclei") === "");
check("25.13 'echo $(nuclei -u ...)' -> BLOCKS  ($( ) op-split, GuardFall classes B/C)",
  blocked(scopeCmd(`echo $(${ATTACK})`)));
check("25.14 'nucl\"ei\" -u https://x.example.com' -> BLOCKS  (GuardFall class A: parse pre-joins the quoted word)",
  blocked(scopeCmd('nucl"ei" -u https://x.example.com')));

// 25.15-25.18 Windows wrappers and non-command nodes
check("25.15 'powershell -Command \"nuclei ...\"' -> BLOCKS  (payload arrives as ONE token, re-parsed)",
  blocked(scopeCmd(`powershell -Command "${ATTACK}"`)));
check("25.16 'cmd /c nuclei -u ...' -> BLOCKS  (Windows wrapper)",
  blocked(scopeCmd(`cmd /c ${ATTACK}`)));
check("25.17 malformed 'nuclei ${' -> BLOCKS (fail closed)",
  blocked(scopeCmd("nuclei ${")));
check("25.18 '# nuclei -u https://x.example.com' -> PASSES  (comment node, never a command)",
  scopeCmd(`# ${ATTACK}`) === "");

check("25.19 attack after a semicolon -> BLOCKS",
  blocked(scopeCmd(`echo ready; ${ATTACK}`)));
check("25.19 quoted attack name used only as an argument -> PASSES",
  scopeCmd('printf "%s" "nuclei"') === "");

// 25.20 wrappers carrying flags (Reviewer A r1 finding, escalated by the
// orchestrator 2026-08-20): value-bearing flags must not stop the unwrap
check("25.20 'sudo -u root nuclei ...' -> BLOCKS  (wrapper with a value flag)",
  blocked(scopeCmd(`sudo -u root ${ATTACK}`)));
check("25.20 'nice -n 5 nuclei ...' -> BLOCKS  (wrapper with a value flag)",
  blocked(scopeCmd(`nice -n 5 ${ATTACK}`)));
check("25.20 'env -u VAR nuclei ...' -> BLOCKS  (wrapper with a value flag)",
  blocked(scopeCmd(`env -u VAR ${ATTACK}`)));

// 25.21 zero-interference counterweight: the flag fix must not promote
// arguments to command heads
reset();
check("25.21 'sudo -u root grep nuclei README.md' -> PASSES  (grep is the head, nuclei an argument)",
  scopeCmd("sudo -u root grep nuclei README.md") === "");

// ---------------------------------------------------------------------------
// 26. Native MCP scope server. Arming is by invocation; the server only
// reports and revokes current-format authorization. Exercise the compiled
// server over line-delimited JSON-RPC with isolated workspace roots.
// ---------------------------------------------------------------------------

// Arming env no longer exists; SCOPE_* is stripped from the parent env so
// spawns are clean — only explicit SCOPE_ROOT overrides are ever passed.
const stripScopeEnv = (env) => {
  const e = { ...env };
  for (const k of Object.keys(e)) if (k.startsWith("SCOPE_")) delete e[k];
  return e;
};
// Deterministic invocation fixture: fixed ISO dates, never "now ± epsilon".
const INVOCATION_SCOPE = {
  targets: ["x.example.com"],
  env: "staging",
  granted_at: "2026-08-21T00:00:00Z",
  expires_at: "2099-01-01T00:00:00Z",
  source: "invocation",
};
const EXPIRED_INVOCATION_SCOPE = {
  ...INVOCATION_SCOPE,
  granted_at: "2019-01-01T00:00:00Z",
  expires_at: "2020-01-01T00:00:00Z",
};
// One spawn, several frames: every frame is answered on stdout, keyed by id.
const rpc = (frames, opts = {}) => {
  const p = spawnSync(BINARY, ["scope-mcp"], {
    input: frames.map((f) => JSON.stringify(f)).join("\n") + "\n",
    encoding: "utf8",
    cwd: opts.cwd ?? WS,
    env: { ...stripScopeEnv(process.env), ...opts.env },
    timeout: 15000,
  });
  if (p.status !== 0) throw new Error(`scope-server exited ${p.status}: ${p.stderr}`);
  const byId = new Map();
  for (const line of (p.stdout ?? "").split("\n")) {
    const l = line.trim();
    if (!l) continue;
    const m = JSON.parse(l);
    if (m.id !== undefined && m.id !== null) byId.set(m.id, m);
  }
  return byId;
};
const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test_gate", version: "0" } } };
const GET_SCOPE = (id) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "get_scope", arguments: {} } });
const toolText = (resp) => {
  const t = resp?.result?.content?.[0]?.text;
  try { return JSON.parse(t); } catch { return null; }
};
const srvScopePath = (root) => join(root, ".oh-my-zcode", "security", "active_scope.json");
const writeServerScope = (root, scope) => {
  mkdirSync(join(root, ".oh-my-zcode", "security"), { recursive: true });
  writeFileSync(srvScopePath(root), JSON.stringify(scope), "utf8");
};

// 26.1-26.2 handshake + exact tool set, in a fresh UNARMED workspace
const SRV = mkdtempSync(join(tmpdir(), "gate-srv-"));
writeFileSync(join(SRV, "package.json"), "{}\n");
const hs = rpc([
  INIT,
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
], { cwd: SRV });
check("26.1 initialize handshake answers with serverInfo",
  hs.get(1)?.result?.serverInfo?.name === "oh-my-zcode-scope"
  && hs.get(1)?.result?.serverInfo?.version === PLUGIN_VERSION,
  JSON.stringify(hs.get(1)?.result?.serverInfo));
const listedTools = hs.get(2)?.result?.tools ?? [];
check("26.2 tools/list = exactly get_scope + revoke (no authorize tool)",
  JSON.stringify(listedTools.map((t) => t.name).sort())
    === JSON.stringify(["get_scope", "revoke"]),
  JSON.stringify(listedTools.map((t) => t.name)));
check("26.2 ...and EVERY tool carries inputSchema {type:'object',properties:{}}  (the published-defect fix, frozen 2026-08-21)",
  listedTools.length === 2
  && listedTools.every((t) =>
    t.inputSchema?.type === "object"
    && Object.keys(t.inputSchema).sort().join(',') === 'properties,type'
    && t.inputSchema.properties !== null
    && typeof t.inputSchema.properties === 'object'
    && !Array.isArray(t.inputSchema.properties)
    && Object.keys(t.inputSchema.properties).length === 0),
  JSON.stringify(listedTools.map((t) => t.inputSchema)));

// 26.3 UNARMED (no scope file — arming is by invocation, never by this
// server): get_scope says so and points at /ohmy-redteam
const unarmed = rpc([
  INIT,
  GET_SCOPE(3),
], { cwd: SRV });
const unarmedState = toolText(unarmed.get(3));
check("26.3 unarmed: get_scope -> armed:false + hint pointing at /ohmy-redteam",
  unarmedState?.armed === false && String(unarmedState?.hint ?? "").includes("/ohmy-redteam"),
  JSON.stringify(unarmedState));

// 26.4 an invocation scope WRITTEN BY THE TEST (what /ohmy-redteam produces)
// is reported armed, verbatim — the server reads, it never arms
writeServerScope(SRV, INVOCATION_SCOPE);
const armed = rpc([INIT, GET_SCOPE(4)], { cwd: SRV });
const armedState = toolText(armed.get(4));
check("26.4 invocation scope -> get_scope armed:true with targets/env/granted_at/expires_at/source",
  armedState?.armed === true
  && JSON.stringify(armedState?.targets) === JSON.stringify(["x.example.com"])
  && armedState?.env === "staging"
  && armedState?.granted_at === INVOCATION_SCOPE.granted_at
  && armedState?.expires_at === INVOCATION_SCOPE.expires_at
  && armedState?.source === "invocation",
  JSON.stringify(armedState));

// 26.5 EXPIRED invocation scope: not armed, hint, and the FILE IS LEFT IN
// PLACE (revoke is the only delete path; the read must not mutate the disk)
const SRV2 = mkdtempSync(join(tmpdir(), "gate-srv2-"));
writeFileSync(join(SRV2, "package.json"), "{}\n");
writeServerScope(SRV2, EXPIRED_INVOCATION_SCOPE);
const expiredSrv = rpc([INIT, GET_SCOPE(5)], { cwd: SRV2 });
const expiredState = toolText(expiredSrv.get(5));
check("26.5 expired scope -> get_scope armed:false + hint",
  expiredState?.armed === false && String(expiredState?.hint ?? "").includes("/ohmy-redteam"),
  JSON.stringify(expiredState));
check("26.5 ...and the expired file is LEFT IN PLACE (read path never deletes)",
  existsSync(srvScopePath(SRV2)));

// 26.6 Unsupported scope data stays unarmed. Reads do not migrate files.
const SRV3 = mkdtempSync(join(tmpdir(), "gate-srv3-"));
writeFileSync(join(SRV3, "package.json"), "{}\n");
writeServerScope(SRV3, { ...INVOCATION_SCOPE, source: "unsupported" });
const unsupportedBytes = readFileSync(srvScopePath(SRV3), "utf8");
const unsupported = rpc([INIT, GET_SCOPE(6)], { cwd: SRV3 });
check("26.6 unsupported scope source is not rewritten or migrated",
  readFileSync(srvScopePath(SRV3), "utf8") === unsupportedBytes);
check("26.6 unsupported scope source remains unarmed",
  toolText(unsupported.get(6))?.armed === false,
  JSON.stringify(toolText(unsupported.get(6))));

// 26.7 revoke: the file is gone and get_scope reports unarmed
const revoked = rpc([
  INIT,
  { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "revoke", arguments: {} } },
  GET_SCOPE(8),
], { cwd: SRV });
check("26.7 revoke -> active_scope.json gone, get_scope unarmed",
  !existsSync(srvScopePath(SRV))
  && toolText(revoked.get(8))?.armed === false,
  JSON.stringify(toolText(revoked.get(8))));

// 26.8 ROOT RESOLUTION (server and gate must agree on the workspace root)
// a) cwd = deep subdir of a workspace whose marker is at the root: the
//    server spawned there reads the ROOT scope, and the hook — invoked from
//    that same root — honours it (server/gate accord).
const R1 = mkdtempSync(join(tmpdir(), "gate-root1-"));
writeFileSync(join(R1, "package.json"), "{}\n");
mkdirSync(join(R1, "sub", "deep", "dir"), { recursive: true });
writeServerScope(R1, INVOCATION_SCOPE);
check("26.8a spawned from a deep subdir -> reads the scope at the workspace ROOT",
  toolText(rpc([INIT, GET_SCOPE(9)], { cwd: join(R1, "sub", "deep", "dir") }).get(9))?.armed === true);
check("26.8a ...and the gate invoked from that root honours the same file",
  hookRun("scope", { cwd: R1, tool_name: "Bash", tool_input: { command: "nuclei -u https://x.example.com" } }) === "");

// b) SCOPE_ROOT override wins even from a marker-less cwd
const R2 = mkdtempSync(join(tmpdir(), "gate-root2-")); // marker-less spawn cwd
const R3 = mkdtempSync(join(tmpdir(), "gate-root3-")); // override target
writeFileSync(join(R3, "package.json"), "{}\n");
writeServerScope(R3, INVOCATION_SCOPE);
check("26.8b SCOPE_ROOT override wins from a marker-less cwd -> reads there, creates nothing at the cwd",
  toolText(rpc([INIT, GET_SCOPE(10)], { cwd: R2, env: { SCOPE_ROOT: R3 } }).get(10))?.armed === true
  && !existsSync(join(R2, ".oh-my-zcode")));

// c) marker-less cwd, NO override -> nothing read, nothing created (fail-closed)
const R4 = mkdtempSync(join(tmpdir(), "gate-root4-")); // marker-less
check("26.8c marker-less cwd without override -> unarmed, no .oh-my-zcode created",
  toolText(rpc([INIT, GET_SCOPE(11)], { cwd: R4 }).get(11))?.armed === false
  && !existsSync(join(R4, ".oh-my-zcode")));

// 26.9 THE 2026-08-21 DEBT FIX: `command -v X` resolves a NAME, it never
// executes X — an unarmed gate must not block its own diagnostics.
reset();
check("26.9 'command -v nuclei' with NO scope -> PASSES  (name resolution, not execution)",
  scopeCmd("command -v nuclei") === "");
check("26.9 'command -V nuclei' likewise -> PASSES",
  scopeCmd("command -V nuclei") === "");

// 26.10 Only the current red-team dispatch tag activates this boundary.
const OTHER_TAGGED = "[unrelated-workflow 20260819-2048] describe nuclei at https://x.example.com";
reset();
check("26.10 unrelated dispatch tag under NO scope -> NOT blocked",
  dispatch(OTHER_TAGGED) === "");
reset();
writeScope({ targets: ["x.example.com"], env: "dev" });
check("26.10 unrelated dispatch tag under an ARMED scope -> passes with NO dispatch_pass logged",
  dispatch(OTHER_TAGGED) === ""
  && (!existsSync(evidenceFile())
      || !readFileSync(evidenceFile(), "utf8").includes('"kind":"dispatch_pass"')));

// 26.11 Incomplete authorization never arms the hook.
reset();
mkdirSync(join(WS, ".oh-my-zcode", "security"), { recursive: true });
writeFileSync(scopeFile(), JSON.stringify({ targets: ["x.example.com"], env: "dev" }), "utf8");
const incomplete = scopeCmd("nuclei -u https://x.example.com");
check("26.11 incomplete scope + attack -> BLOCKS with an actionable reason",
  blocked(incomplete) && blockReason(incomplete).length > 0,
  blockReason(incomplete));

// 26.12-26.14 SURGICAL DISARM (mixed URLs -> updatedInput)
reset();
writeScope({ targets: ["x.example.com"], env: "dev" });
const disarmOut = scopeCmd("curl -s https://x.example.com/a https://evil.com/y");
let disarm = null;
try { disarm = JSON.parse(disarmOut); } catch { /* checked below */ }
check("26.12 mixed targets reject the whole command without rewriting",
  disarm?.decision === "block"
  && !disarm?.updatedInput,
  JSON.stringify(disarm?.updatedInput));
check("26.12 rejection is logged as scope_block",
  existsSync(evidenceFile())
  && readFileSync(evidenceFile(), "utf8").includes('"kind":"scope_block"'));

const allOutOut = scopeCmd("curl -s https://evil.com/y");
let allOutParsed = null;
try { allOutParsed = JSON.parse(allOutOut); } catch { /* checked below */ }
check("26.13 ALL out-of-scope URLs -> plain block, no updatedInput (no laundering)",
  allOutParsed?.decision === "block" && allOutParsed?.updatedInput === undefined,
  JSON.stringify(allOutParsed?.updatedInput));

check("26.14 in-scope-only command -> passes untouched (empty output, no updatedInput)",
  scopeCmd("curl -s https://x.example.com/a") === "");

rmSync(SRV, { recursive: true, force: true });
rmSync(SRV2, { recursive: true, force: true });
rmSync(SRV3, { recursive: true, force: true });
rmSync(R1, { recursive: true, force: true });
rmSync(R2, { recursive: true, force: true });
rmSync(R3, { recursive: true, force: true });
rmSync(R4, { recursive: true, force: true });

deleteScope();

// 27. session-start update notice — cache-driven only (no network in tests):
// a fresh state file with a newer cached version appends the notice; an
// up-to-date cache leaves the doctrine untouched. Both spawns pin
// ZCODE_PLUGIN_ROOT + OH_MY_ZCODE_UPDATE_STATE so the real home is never read.
{
  const UPD = mkdtempSync(join(tmpdir(), "gate-upd-"));
  mkdirSync(join(UPD, ".zcode-plugin"), { recursive: true });
  writeFileSync(
    join(UPD, ".zcode-plugin", "plugin.json"),
    JSON.stringify({ name: "oh-my-zcode", version: "0.9.0" }),
  );
  const statePath = join(UPD, "update-check.json");
  const spawnStart = () => {
    const p = spawnSync(BINARY, ["hook", "session_start"], {
      input: JSON.stringify({ session_id: SID, cwd: WS, source: "startup" }),
      encoding: "utf8",
      env: {
        ...process.env,
        ZCODE_PLUGIN_ROOT: UPD,
        OH_MY_ZCODE_UPDATE_STATE: statePath,
        OH_MY_ZCODE_UPDATE_URL: "file://" + join(UPD, "marketplace.json").replace(/\\/g, "/"),
      },
    });
    if (p.status !== 0) throw new Error(`update-notice spawn failed: ${p.stderr}`);
    return JSON.parse((p.stdout ?? "").trim()).hookSpecificOutput?.additionalContext ?? "";
  };
  writeFileSync(
    statePath,
    JSON.stringify({ last_attempt_ms: Date.now(), latest: "3.1.0" }),
  );
  const updateNotice = spawnStart();
  check("27.1 newer cached version -> UPDATE notice appended to doctrine",
    updateNotice.includes("UPDATE oh-my-zcode: 3.1.0 available (installed 0.9.0)"));
  check("27.1 update notice points to Settings > Plugins without a marketplace id",
    updateNotice.includes("Settings > Plugins") && !updateNotice.includes("@unknoownu"));
  writeFileSync(
    statePath,
    JSON.stringify({ last_attempt_ms: Date.now(), latest: "0.9.0" }),
  );
  check("27.2 up-to-date cache -> doctrine unchanged, no notice",
    !spawnStart().includes("UPDATE oh-my-zcode"));
  writeFileSync(
    statePath,
    JSON.stringify({ last_attempt_ms: Date.now(), latest: "3.1.0", disabled: true }),
  );
  check("27.3 disabled kill switch -> no notice even with newer version",
    !spawnStart().includes("UPDATE oh-my-zcode"));
  rmSync(UPD, { recursive: true, force: true });
}

// 28. the multimodal locker — frozen (ported from 2.x test 25.31)
{
  const VIS = readFileSync(join(HERE, "plugin", "agents", "vision.md"), "utf8");
  const EVENTS = readFileSync(join(HERE, "src", "hook", "events.rs"), "utf8");
  check("28.1 vision frontmatter freezes the flash model (the multimodal locker)",
    VIS.includes("model: account:zai-individual-coding-plan/GLM-5.3-Flash"),
    "vision.md lost its picker-format model frontmatter");
  check("28.2 the Rust doctrine carries the image rule (never dead-end -> dispatch vision)",
    EVENTS.includes("never dead-end") && EVENTS.includes("dispatch vision"),
    "the image sentence is missing from src/hook/events.rs DOCTRINE");
}

console.log(`\n${"=".repeat(58)}\n${passed} passed, ${failed} failed`);
rmSync(WS, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
