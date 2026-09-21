# Proof contract (3.0.0)

A final `VERDICT: PASS` requires a matched, completed check in the signing session and current turn. The hook records a pre-execution snapshot, the actual expected result, and a post-execution snapshot. At Stop it compares the current files again. Missing data, a failing result, an unfinished check, or a changed snapshot refuses the signature.

## Normal workflow

1. Finish edits and generate any build artifacts.
2. Run each deciding test, linter, type check or build as a **direct command** in the main session, for example `npm test`, `python -m pytest -q`, or `node --test verify.test.mjs`.
3. Require numeric exit status zero. Unknown status, process errors, interruption and timeout are not success.
4. Quote the results and conclude without changing the covered files. Rerun checks after any change.

PreToolUse and PostToolUse are paired by session, tool-use ID, command and working directory. PostToolUseFailure records a failed attempt. Replaying a result cannot reuse a consumed snapshot. The latest attempt for each check controls its result: a failure supersedes an earlier success; a successful rerun of the same command can resolve it.

Commands that merely print a test name do not count. Pipelines, shell chains, substitutions and shell wrappers are not inferred as proof: their aggregate status may hide a failed component. Prefer direct commands or declare an exact check below. Help/version/watch/collection-only invocations do not count. Automatic recognition uses conservative per-runner argument allowlists; selectors, dry runs and unknown options require an exact policy check with an output assertion. Examples include `npm test` (without forwarded arguments), `vitest run`, `cargo test --workspace`, `go test ./...`, `tsc --noEmit`, and `ruff check .`. Unsupported wrappers such as `npx` also require an explicit check.

File/directory operands of automatic checks must resolve inside this workspace and be covered by its snapshot. External test files cannot vouch for the workspace. Ignored test files must be declared in `artifacts`. Package scripts and test configuration remain trusted project inputs: their content is hashed, but the hook does not interpret their semantics.

## Expected results and built artifacts

Optional project policy: `.oh-my-zcode/proof-policy.json`. Declare the contract before executing checks; do not weaken it to turn a failed result into success. The policy itself is fingerprinted.

```json
{
  "artifacts": ["dist/app.js"],
  "checks": [
    {
      "command": "node --test acceptance.test.mjs",
      "claim": "pass",
      "expected_exit": 0,
      "output_includes": ["# pass 1\n", "# fail 0\n"]
    },
    {
      "command": "node reproduce.mjs",
      "claim": "findings",
      "expected_exit": 1,
      "output_includes": ["EXPECTED: vulnerable behavior reproduced"]
    }
  ]
}
```

The first example expects exactly one passing test. Set output assertions to the actual acceptance condition, including a positive executed-test count or an application-specific assertion marker when needed.

All configured checks for the signature's claim must complete this turn. Every specified output literal is required, case-sensitively, in stdout/stderr/output. A nonzero exit is allowed only for an explicitly configured `findings` check and never supports PASS. If the host supplies only an error string without a numeric status, wrap the reproduction in an assertion script that exits zero only when the expected behavior occurred.

Artifact paths are relative files or directories inside the workspace. They supplement the default source snapshot, including outputs ignored by Git. Missing artifacts, invalid policy, escaping/cyclic symlinks and unreadable paths refuse proof. Build first, then verify the built artifact: creating or changing a declared output during verification invalidates that run.

## Identity and freshness

The native snapshot uses a deterministic, domain-separated Rust encoding (`oh-my-zcode/fingerprint-v1`). It hashes the canonical workspace root, selection mode, sorted paths, file contents and platform file modes/attributes with SHA-256. A separate revision fingerprint includes modification/change timestamps and file identity, so editing then restoring the same bytes also invalidates the earlier proof. Checks must observe the same snapshot before execution, after execution and at signature time.

In Git workspaces, defaults cover tracked files (including tracked ignored files) plus nonignored untracked files. Without Git, the directory tree is covered except common dependency/generated directories: node_modules, .venv, venv, __pycache__, .pytest_cache, .mypy_cache, .ruff_cache, coverage, dist, build, target. Git/plugin runtime directories are excluded in both modes. Explicit artifacts include generated files. Runtime reports under .oh-my-zcode do not invalidate proof; proof-policy.json does.

Hashing is bounded to 10,000 entries, 64 MiB and 2.5 seconds per snapshot. A limit/error refuses a receipt instead of trusting a partial hash. Dependency trees, ignored outputs not explicitly listed, remote deployments, containers and external services are not covered by the default source digest.

Authoritative receipts live in `.oh-my-zcode/receipts/<session>.jsonl`. Every envelope carries `oh-my-zcode/receipt-v1`, the full session ID and canonical root. A start records its unique receipt/tool IDs, contract and fingerprint; the matched completion records the actual exit and verified fingerprint or rejection reason. Stop verifies freshness again before writing a turn boundary. The separate evidence journal records hook and citation decisions. Unknown or unversioned authoritative records refuse proof; they are never migrated or interpreted as current receipts.

## Limits and installation

These are local integrity checks, not an OS security boundary: a process with workspace write access can tamper with local logs/policy. They do not prove that a test suite is meaningful, that every requirement is covered, or that a remote service runs the local bytes. Source-reading claims and behavioral claims still require the appropriate reviewer protocol.

Only reserved final signatures invoke the gate. Unbacked PASS/FINDINGS/SOURCES signatures remain refused on retries. An honest failure can end a turn when its journal can be closed. A corrupt or unwritable journal produces an explicit block: silently continuing could reuse evidence from an unclosed turn. [ZCode itself caps Stop continuations at three](https://zcode.z.ai/en/docs/hooks), so the host can force the run to end; this never creates a valid receipt. Hooks inside subagents remain outside the main session's evidence.

Version 3.0.0 ships the Rust executable for the selected platform. Install its verified archive and start a new ZCode session; restart ZCode so its MCP processes use the installed binary. There is no JavaScript runtime fallback and no old-state migration. Third-party MCP prerequisites are described separately in [distribution.md](distribution.md).

The separate scope and citation gates use the [explicit command and resource-identity contract](scoped-execution.md). Unsupported command forms are refused; citation authority never merges different schemes, paths, queries, or document versions.
