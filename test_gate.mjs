#!/usr/bin/env node
/**
 * Integration tests for the evidence gate and the citation gate, run against the
 * real hook script.
 *
 * The hook contract is stdin/stdout, so this suite is runtime-agnostic: pass a
 * `.mjs` or a `.py` hook as argv[2] and the same assertions apply.
 *
 *   node test_gate.mjs                      # tests the bundled .mjs hook
 *   node test_gate.mjs path/to/hook.py      # tests any other implementation
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = process.argv[2]
  ?? join(HERE, "betterzcode", "hooks", "gate_hook.mjs");
const RUNTIME = /\.(mjs|js|cjs)$/.test(HOOK) ? "node" : "python";

const WS = mkdtempSync(join(tmpdir(), "gate-"));
// A real workspace has a project marker; the hook anchors its log to it.
writeFileSync(join(WS, "package.json"), "{}\n");
const SID = "sess-test";
let passed = 0;
let failed = 0;

function run(kind, payload) {
  const body = { session_id: SID, cwd: WS, ...payload };
  const p = spawnSync(RUNTIME, [HOOK, kind], {
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

const reset = () => rmSync(join(WS, ".betterzcode"), { recursive: true, force: true });
const evidenceFile = () =>
  join(WS, ".betterzcode", "evidence", `${SID.replace(/[^\w.-]/g, "_")}.jsonl`);

console.log(`Hook under test : ${HOOK}\nRuntime         : ${RUNTIME}\nSandbox         : ${WS}\n`);

// 1. session-start injection
const intro = run("session_start", { source: "startup" });
check("SessionStart injects the doctrine",
  intro.includes("additionalContext") && intro.includes("sealed roles"));

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

// 7. anti-loop
reset();
check("stop_hook_active -> never re-blocks",
  !blocked(stop("VERDICT: PASS", true)));

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
  const p = spawnSync(RUNTIME, [HOOK, kind], { input: data, encoding: "utf8" });
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
check("evidence written to .betterzcode/evidence/<session>.jsonl",
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
  !existsSync(join(WS, "app", "deep", ".betterzcode")));

// the gate must see that proof from the root
check("gate sees the subfolder proof and lets PASS through",
  !blocked(stop("VERDICT: PASS")));
rmSync(join(WS, "app"), { recursive: true, force: true });

// 15. probe payloads write nothing (ZCode calls hooks with an empty payload
// when the plugin loads; that used to leave junk in the home directory)
reset();
const probe = spawnSync(RUNTIME, [HOOK, "session_start"], {
  input: JSON.stringify({ source: "startup" }), encoding: "utf8",
});
check("probe payload without session_id still injects the doctrine",
  probe.stdout.includes("additionalContext"));
check("probe payload writes no log file", !existsSync(join(WS, ".betterzcode")));

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
check("fetched the PDF, cited the abstract page -> lets through",
  !blocked(stop("See https://arxiv.org/abs/2503.13657 for the taxonomy.\n\nSOURCES: VERIFIED")));

// 16.4 markdown links must yield the URL, not the bracket
reset();
fetchUrl("https://www.nature.com/articles/s41467-025-58551-6");
check("markdown link syntax is extracted, not the closing bracket",
  !blocked(stop("The [SourceCheckup study](https://www.nature.com/articles/s41467-025-58551-6) measures it.\n\nSOURCES: VERIFIED")));

// 16.5 a sentence-final URL keeps its punctuation in prose
reset();
fetchUrl("https://example.org/paper");
check("trailing punctuation after a bare URL is stripped",
  !blocked(stop("Full text at https://example.org/paper.\n\nSOURCES: VERIFIED")));

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
  !blocked(stop("The taxonomy is in https://arxiv.org/abs/2503.13657.\n\nSOURCES: VERIFIED")));

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

// 16.12 anti-loop applies to this gate too
reset();
check("stop_hook_active -> the citation gate never re-blocks either",
  !blocked(stop("No source here.\n\nSOURCES: VERIFIED", true)));

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
  !blocked(stop("Report written to .betterzcode/research/20260819-0658_x/report.md — 30 sources opened.\n\nSOURCES: VERIFIED")));

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
// 19. THE BYPASS IS RECORDED, NOT HIDDEN
// The anti-loop must never block twice, but the audit trail must still say
// whether the retry actually complied.
// ---------------------------------------------------------------------------

reset();
const bypassOut = stop("Still nothing to show.\n\nSOURCES: VERIFIED", true);
check("retry that is still non-compliant -> not blocked", !blocked(bypassOut));
check("...but the log records gate_bypassed",
  readFileSync(evidenceFile(), "utf8").includes('"gate_bypassed"'));

reset();
fetchUrl("https://example.org/ok");
stop("Read https://example.org/ok\n\nSOURCES: VERIFIED", true);
check("retry that IS compliant is logged as compliant, not as a bypass",
  readFileSync(evidenceFile(), "utf8").includes("compliant after gate retry"));

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

// 21.8 anti-loop applies to this gate too
reset();
const findingsBypass = stop("Still just an allegation.\n\nFINDINGS: VERIFIED", true);
check("stop_hook_active -> the findings gate never re-blocks",
  !blocked(findingsBypass));
check("...but the log records gate_bypassed",
  readFileSync(evidenceFile(), "utf8").includes('"gate_bypassed"'));

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

const scopeFile = () => join(WS, ".betterzcode", "security", "active_scope.json");
const writeScope = (s) => {
  mkdirSync(join(WS, ".betterzcode", "security"), { recursive: true });
  writeFileSync(scopeFile(), JSON.stringify(s), "utf8");
};
const deleteScope = () => rmSync(scopeFile(), { force: true });
const scopeCmd = (command) =>
  run("scope", { tool_name: "Bash", tool_input: { command } });

// 22.1 attack command, no scope file at all -> fail closed
reset();
check("nuclei with NO scope file -> BLOCKS", blocked(scopeCmd("nuclei -l hosts.txt")));

// 22.2 a valid scope authorizes the attack
reset();
writeScope({ targets: ["staging.example.com"], env: "staging", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("nuclei against the scoped target -> passes (no output)",
  scopeCmd("nuclei -u https://staging.example.com") === "");

// 22.3 prod is never a valid scope
reset();
writeScope({ targets: ["staging.example.com"], env: "prod", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("scope env 'prod' + attack -> BLOCKS", blocked(scopeCmd("nuclei -u https://staging.example.com")));

// 22.4 a scope from another session does not authorize this one
reset();
writeScope({ targets: ["staging.example.com"], env: "staging", session_id: "sess-someone-else", created: "2026-08-19T00:00:00Z" });
check("scope bound to ANOTHER session + attack -> BLOCKS",
  blocked(scopeCmd("nuclei -u https://staging.example.com")));

// 22.5 a valid scope confines every URL, curl included
reset();
writeScope({ targets: ["staging.example.com"], env: "staging", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("valid scope + curl to a host NOT in targets -> BLOCKS",
  blocked(scopeCmd("curl -X GET https://other.example.com/api")));

// 22.6 the declared target itself passes
check("valid scope + curl to the scoped target -> passes",
  scopeCmd("curl -X GET https://staging.example.com/api") === "");

// 22.7 wildcard targets admit subdomains but not the bare domain
reset();
writeScope({ targets: ["*.example.com"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("wildcard target admits a subdomain",
  scopeCmd("curl -X GET https://app.example.com/api") === "");
check("wildcard target does NOT admit the bare domain",
  blocked(scopeCmd("curl -X GET https://example.com/api")));
check("a target written as a full URL is honoured by its host",
  (writeScope({ targets: ["https://staging.example.com/x"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" }),
   scopeCmd("curl -X GET https://staging.example.com/api") === ""));

// 22.8 no scope file, no attack tool: the dev session is untouched
reset();
check("NO scope file + curl anywhere -> passes (normal dev session)",
  scopeCmd("curl -X GET https://anything.example.com") === "");

// 22.9 malformed scope file fails closed for attack tools
reset();
mkdirSync(join(WS, ".betterzcode", "security"), { recursive: true });
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
reset();
writeScope({ targets: ["staging.example.com"], env: "staging", session_id: SID, created: "2026-08-19T00:00:00Z" });
scopeCmd("nuclei -u https://staging.example.com");
check("a scoped pass is logged as kind=scope_pass",
  readFileSync(evidenceFile(), "utf8").includes('"kind":"scope_pass"'));

// 22.12 payloads without a session id: attack fails closed, curl passes
const noSession = (command) => {
  const p = spawnSync(RUNTIME, [HOOK, "scope"], {
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
writeScope({ targets: ["staging.example.com"], env: "staging", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("lifecycle: scope written -> attack passes",
  scopeCmd("nuclei -u https://staging.example.com") === "");
deleteScope();
check("lifecycle: scope deleted -> the SAME attack BLOCKS again",
  blocked(scopeCmd("nuclei -u https://staging.example.com")));

// 22.14 the incident repro: port-aware targets across the whole chain
reset();
writeScope({ targets: ["localhost:3000"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("ported target authorizes its own port (incident repro)",
  scopeCmd("curl -s http://localhost:3000/") === "");
check("ported target does NOT authorize a different port (no widening)",
  blocked(scopeCmd("curl -s http://localhost:4000/")));
writeScope({ targets: ["localhost"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("portless target still matches a ported URL host",
  scopeCmd("curl -s http://localhost:3000/") === "");

// 22.15 the block reason names the offending host (actionable diagnostics)
const blockReason = (out) => {
  try {
    return JSON.parse(out).reason ?? "";
  } catch {
    return "";
  }
};
reset();
writeScope({ targets: ["staging.example.com"], env: "staging", session_id: SID, created: "2026-08-19T00:00:00Z" });
const mismatch = scopeCmd("curl -X GET https://other.example.com/api");
check("host-mismatch block reason CONTAINS the offending host",
  blocked(mismatch) && blockReason(mismatch).includes("other.example.com"));

// ---------------------------------------------------------------------------
// 23. DISPATCH GATE (PreToolUse/Agent|Task)
// A tagged red-team dispatch ([betterredteam <run-id>]) is admissible only
// under a valid armed scope, and while one is armed every URL host in the
// prompt must land inside the targets. Untagged dispatches are NEVER touched,
// whatever their text — zero interference by construction (detection is by
// routing tag, not language; plan-critic round 1, 2026-08-19).
// ---------------------------------------------------------------------------

const dispatch = (prompt, extra = {}) =>
  run("dispatch", {
    tool_name: "Agent",
    tool_input: { prompt, description: prompt, subagent_type: "betterredteam-beast" },
    ...extra,
  });
const TAGGED = "[betterredteam 20260819-2048] run nuclei against https://x.example.com";

// 23.1 tagged dispatch, no scope file at all -> fail closed
reset();
check("tagged dispatch with NO scope file -> BLOCKS", blocked(dispatch(TAGGED)));

// 23.2 a valid scope authorizes the tagged dispatch (and emits nothing)
reset();
writeScope({ targets: ["x.example.com"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("tagged dispatch under a valid scope -> passes (no output)",
  dispatch(TAGGED) === "");
check("...and the pass is logged as kind=dispatch_pass",
  readFileSync(evidenceFile(), "utf8").includes('"kind":"dispatch_pass"'));

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
writeScope({ targets: ["x.example.com"], env: "prod", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("tagged dispatch + scope env 'prod' -> BLOCKS", blocked(dispatch(TAGGED)));

// 23.5 a scope from another session does not authorize this dispatch
reset();
writeScope({ targets: ["x.example.com"], env: "dev", session_id: "sess-someone-else", created: "2026-08-19T00:00:00Z" });
const wrongSession = dispatch(TAGGED);
check("tagged dispatch + scope bound to ANOTHER session -> BLOCKS",
  blocked(wrongSession));
check("...and the reason shows BOTH session ids",
  blockReason(wrongSession).includes("sess-someone-else")
  && blockReason(wrongSession).includes(SID));

// 23.6 an armed scope confines the prompt: an out-of-scope host blocks
reset();
writeScope({ targets: ["x.example.com"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
const offTarget = dispatch("[betterredteam 20260819-2048] run nuclei against https://other.example.com");
check("armed scope + tagged prompt naming an out-of-scope host -> BLOCKS",
  blocked(offTarget));
check("...and the reason contains the offending host",
  blockReason(offTarget).includes("other.example.com"));

// 23.7 payloads without a session id: tagged fails closed, untagged passes
const noSessionDispatch = (prompt) => {
  const p = spawnSync(RUNTIME, [HOOK, "dispatch"], {
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
mkdirSync(join(WS, ".betterzcode", "security"), { recursive: true });
writeFileSync(scopeFile(), "\x00\x01 not json \x02", "utf8");
check("garbage active_scope.json + tagged dispatch -> BLOCKS (fail closed)",
  blocked(dispatch(TAGGED)));

// 23.9 every block reason carries the /betterredteam pointer
reset();
deleteScope();
const noScopeBlock = dispatch(TAGGED);
check("every block reason contains '/betterredteam'",
  blocked(noScopeBlock) && blockReason(noScopeBlock).includes("/betterredteam"));

// 23.10 a blocked tagged dispatch lands in the evidence log
check("a blocked tagged dispatch is logged as kind=dispatch_block",
  readFileSync(evidenceFile(), "utf8").includes('"kind":"dispatch_block"'));

// 23.11 the tag is inherited: the passing path emits NOTHING (no rewriting —
// the tag/prompt reach the beast unchanged)
reset();
writeScope({ targets: ["x.example.com"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("passing tagged dispatch emits NOTHING (stdout empty)",
  dispatch(TAGGED) === "");

// 23.12 THE INCIDENT REGRESSION (run 20260819-2107): a subfolder with its own
// package.json must no longer hide the parent .betterzcode — the walk passes
// OVER nearer markers and prefers the nearest .betterzcode ancestor.
reset();
mkdirSync(join(WS, "incident", "app"), { recursive: true });
writeFileSync(join(WS, "incident", "app", "package.json"), "{}\n"); // the hiding marker
writeScope({ targets: ["x.example.com"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
// writeScope writes at WS level; the scope file must move to the WS/incident root
mkdirSync(join(WS, "incident", ".betterzcode", "security"), { recursive: true });
writeFileSync(join(WS, "incident", ".betterzcode", "security", "active_scope.json"),
  JSON.stringify({ targets: ["x.example.com"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" }), "utf8");
const fromApp = (kind, toolInput) => {
  const p = spawnSync(RUNTIME, [HOOK, kind], {
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
check("incident: evidence lands in the parent .betterzcode (no split)",
  existsSync(join(WS, "incident", ".betterzcode", "evidence", `${SID}.jsonl`))
  && !existsSync(join(WS, "incident", "app", ".betterzcode")));
// nearest-wins: a .betterzcode at WS/incident/app now shadows the parent — the
// scope written only at WS/incident is no longer found, the attack blocks.
mkdirSync(join(WS, "incident", "app", ".betterzcode"), { recursive: true });
check("nearest-wins: a nearer .betterzcode shadows the parent scope -> attack BLOCKS",
  blocked(fromApp("scope", { command: "nuclei -u https://x.example.com" })));
rmSync(join(WS, "incident"), { recursive: true, force: true });

// ---------------------------------------------------------------------------
// 24. BOUNDARY BOOTSTRAP + DEFAULT PORTS
// 24.1-24.3 freeze the v1.9.3 Verifier finding (bootstrap poisoning): an
// evidence bootstrap at the NEAREST marker creates an orphan .betterzcode that
// nearest-wins promotes to a permanent shadow of the true root. Evidence
// writes therefore bootstrap at the WORKSPACE boundary (highest .git ancestor,
// else highest marker ancestor) when no .betterzcode ancestor exists.
// 24.4-24.6 freeze default-port normalization: a target whose explicit port
// equals the scheme default matches an implicit-port URL of that scheme, and
// a ported target never authorizes a different explicit port.
// ---------------------------------------------------------------------------

const hookRun = (kind, payload) => {
  const p = spawnSync(RUNTIME, [HOOK, kind], {
    input: JSON.stringify({ session_id: SID, ...payload }),
    encoding: "utf8",
  });
  if (p.status !== 0) throw new Error(`exit code ${p.status}: ${p.stderr}`);
  return (p.stdout ?? "").trim();
};
const attackFrom = (cwd) =>
  hookRun("scope", { cwd, tool_name: "Bash", tool_input: { command: "nuclei -u https://x.example.com" } });
const evFile = (root) => join(root, ".betterzcode", "evidence", `${SID}.jsonl`);

// 24.1 WS and WS/app both carry package.json, no .betterzcode anywhere:
// a scope BLOCK (evidence write) bootstraps at WS, NOT at the nearest marker.
const W1 = mkdtempSync(join(tmpdir(), "gate-boot-"));
mkdirSync(join(W1, "app"), { recursive: true });
writeFileSync(join(W1, "package.json"), "{}\n");
writeFileSync(join(W1, "app", "package.json"), "{}\n");
check("24.1 poison-free bootstrap: block from WS/app writes evidence at WS",
  blocked(attackFrom(join(W1, "app")))
  && existsSync(evFile(W1))
  && !existsSync(join(W1, "app", ".betterzcode")));

// 24.3 the incident's happy ending: with the bootstrap landed at WS, arming the
// scope at WS works from WS/app — no orphan shadow, no fail-closed lockout.
mkdirSync(join(W1, ".betterzcode", "security"), { recursive: true });
writeFileSync(join(W1, ".betterzcode", "security", "active_scope.json"),
  JSON.stringify({ targets: ["x.example.com"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" }), "utf8");
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
  && !existsSync(join(W2, "app", ".betterzcode")));
rmSync(W2, { recursive: true, force: true });

// 24.7 fresh workspace unchanged: cwd == WS root, no .betterzcode -> the first
// session_start log write creates WS/.betterzcode (the SessionStart case).
const W3 = mkdtempSync(join(tmpdir(), "gate-fresh-"));
writeFileSync(join(W3, "package.json"), "{}\n");
hookRun("session_start", { cwd: W3, source: "startup" });
check("24.7 fresh workspace: first log write creates WS/.betterzcode",
  existsSync(evFile(W3)));
rmSync(W3, { recursive: true, force: true });

// 24.4 default-port normalization: target :443 + implicit-port https URL
reset();
writeScope({ targets: ["example.com:443"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("24.4 target example.com:443 + https://example.com/x -> PASSES (gap closed)",
  scopeCmd("curl -s https://example.com/x") === "");

// 24.5 the http counterpart
writeScope({ targets: ["example.com:80"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("24.5 target example.com:80 + http://example.com/x -> PASSES",
  scopeCmd("curl -s http://example.com/x") === "");

// 24.6 NO WIDENING: an explicit non-default port never matches the target port
writeScope({ targets: ["example.com:443"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("24.6 target example.com:443 + https://example.com:8443/x -> BLOCKS (no widening)",
  blocked(scopeCmd("curl -s https://example.com:8443/x")));

// re-assert: a portless target matches any port (unchanged behavior)
writeScope({ targets: ["example.com"], env: "dev", session_id: SID, created: "2026-08-19T00:00:00Z" });
check("portless target still matches a ported URL host",
  scopeCmd("curl -s https://example.com:8443/x") === "");

console.log(`\n${"=".repeat(58)}\n${passed} passed, ${failed} failed`);
rmSync(WS, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
