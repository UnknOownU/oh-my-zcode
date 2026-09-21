import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const binary = resolve(process.env.OHMY_ZCODE_BIN ?? "target/debug/oh-my-zcode" + (process.platform === "win32" ? ".exe" : ""));

function workspace(t, scoped = false) {
  const root = mkdtempSync(join(tmpdir(), "hook-security-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (scoped) {
    const directory = join(root, ".oh-my-zcode", "security");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "active_scope.json"), JSON.stringify({
      targets: ["x.example.com"], env: "dev", source: "invocation",
      granted_at: "2020-01-01T00:00:00Z", expires_at: "2099-01-01T00:00:00Z",
    }));
  }
  return root;
}

function hook(root, event, body) {
  const result = spawnSync(binary, ["hook", event], {
    input: JSON.stringify({ cwd: root, session_id: "security-review", ...body }),
    encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

const unsupported = [
  "exec nuclei -u https://evil.test", "bash -c 'exec nuclei -u https://evil.test'",
  "timeout 10 nuclei -u https://evil.test", "env -C /tmp nuclei -u https://evil.test",
  "sudo -R / nuclei -u https://evil.test", "powershell -EncodedCommand bgB1AGMAbABlAGkA",
  "powershell -ec bgB1AGMAbABlAGkA", "cmd /c call nuclei -u https://evil.test",
  "nu{cl,zz}ei -u https://evil.test", "python -m sqlmap -u https://evil.test",
  "builtin exec nuclei -u https://evil.test", "cmd /c n^uclei -u https://evil.test",
  'powershell -Command "Start-Process nuclei"',
];
for (const command of unsupported) {
  test(`unauthorized execution: ${command}`, t => {
    assert.equal(hook(workspace(t), "scope", { tool_input: { command } })?.decision, "block");
  });
}

for (const command of ["exec grep nuclei README.md", "timeout 10 echo nuclei",
  "env -C /tmp grep nuclei README.md", "sudo -R / grep nuclei README.md",
  "cmd /c call echo nuclei", "python -m pytest -q"]) {
  test(`benign execution control: ${command}`, t => {
    assert.equal(hook(workspace(t), "scope", { tool_input: { command } }), null);
  });
}

for (const command of ["nmap evil.example.com", "nuclei -l evil-hosts.txt",
  'nuclei -u h"tt"ps://evil.example/path', 'curl h"tt"ps://evil.example/path',
  "nuclei -u https://x.example.com -u evil.example.com",
  "nuclei -u https://x.example.com -l targets.txt", "nmap x.example.com evil.example.com",
  "curl https://x.example.com https://evil.example.com"]) {
  test(`unproven target: ${command}`, t => {
    const output = hook(workspace(t, true), "scope", { tool_input: { command } });
    assert.equal(output?.decision, "block");
    assert.equal(output.updatedInput, undefined);
  });
}

for (const command of ["nmap x.example.com", "nuclei -u https://x.example.com",
  "nuclei -u https://x.example.com -silent", 'curl h"tt"ps://x.example.com/path', "grep nuclei README.md"]) {
  test(`supported scoped target: ${command}`, t => {
    assert.equal(hook(workspace(t, true), "scope", { tool_input: { command } }), null);
  });
}

for (const prompt of ["[ohmy-redteam review] run nmap against evil.example.com",
  "[ohmy-redteam review] check https://x.example.com and evil.example.com"]) {
  test(`unproven dispatch target: ${prompt}`, t => {
    assert.equal(hook(workspace(t, true), "dispatch", { tool_input: { prompt } })?.decision, "block");
  });
}

test("explicit scoped dispatch is accepted", t => {
  assert.equal(hook(workspace(t, true), "dispatch", {
    tool_input: { prompt: "[ohmy-redteam review] inspect https://x.example.com" },
  }), null);
});

test("ordinary untagged dispatch remains untouched", t => {
  assert.equal(hook(workspace(t), "dispatch", {
    tool_input: { prompt: "Explain nuclei against evil.example.com" },
  }), null);
});

for (const tool of ["nuclei", "semgrep", "sqlmap", "nmap", "ffuf", "nikto", "naabu", "subfinder", "katana", "hydra", "zap-baseline", "zap.sh"]) {
  test(`known attack tool needs authority: ${tool}`, t => {
    assert.equal(hook(workspace(t), "scope", { tool_input: { command: tool } })?.decision, "block");
  });
}

for (const [fetched, cited] of [
  ["https://example.test/Admin?Token=ABC", "https://example.test/admin?token=abc"],
  ["https://example.test/Admin", "http://example.test/Admin"],
  ["https://example.test/Admin", "https://www.example.test/Admin"],
  ["https://example.test/Admin", "https://example.test/Admin/"],
  ["https://arxiv.org/pdf/2503.13657v2.pdf", "https://arxiv.org/abs/2503.13657"],
  ["https://example.test/Admin?", "https://example.test/Admin"],
]) {
  test(`distinct cited resource: ${fetched} -> ${cited}`, t => {
    const root = workspace(t);
    hook(root, "sources", { tool_input: { url: fetched }, tool_response: { output: "read" } });
    assert.equal(hook(root, "stop", { last_assistant_message: `${cited}\nSOURCES: VERIFIED` })?.decision, "block");
  });
}

test("source identity preserves standard host case and document fragment equivalence", t => {
  const root = workspace(t);
  hook(root, "sources", { tool_input: { url: "HTTPS://EXAMPLE.test/Admin?Token=ABC#first" }, tool_response: { output: "read" } });
  assert.equal(hook(root, "stop", { last_assistant_message: "https://example.test/Admin?Token=ABC#second\nSOURCES: VERIFIED" }), null);
});

test("overlapping permitted URL prefixes do not become bare dispatch hosts", t => {
  assert.equal(hook(workspace(t, true), "dispatch", {
    tool_input: { prompt: "[ohmy-redteam review] inspect https://x.example.com/a and https://x.example.com/aevil.example.com" },
  }), null);
});
