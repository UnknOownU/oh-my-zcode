#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './test_proof_gate_helpers.mjs';

for (const command of ['npm test', 'python -m pytest -q', 'node --test verify.test.mjs']) {
  test(`paired successful proof accepts ${command}`, (t) => {
    const f = fixture(t);
    f.prove(command);
    f.allowed();
  });
}

for (const [name, response] of [
  ['failed', { exit_code: 1, output: 'FAIL' }],
  ['missing status', { output: 'all passed' }],
  ['null status', { exit_code: null }],
  ['string status', { exit_code: '0' }],
  ['boolean status', { exit_code: false }],
  ['error', { exit_code: 0, error: 'process failed' }],
  ['is_error', { exit_code: 0, is_error: true }],
  ['timed_out', { exit_code: 0, timed_out: true }],
  ['timeout', { exit_code: 0, timeout: true }],
]) {
  test(`${name} execution cannot back PASS`, (t) => {
    const f = fixture(t);
    f.prove('npm test', response);
    f.denied();
  });
}

for (const command of [
  'echo "npm test"', 'printf "pytest"', 'node -e "console.log(\'pytest\')"',
  'npm test | cat', 'npm test; echo success', 'npm test || true',
  'npm test && echo success',
]) {
  test(`non-proof shell expression rejected: ${command}`, (t) => {
    const f = fixture(t);
    f.prove(command);
    f.denied();
  });
}

test('real passing child process supplies evidence', (t) => {
  const f = fixture(t);
  assert.equal(f.execute(['--test', 'verify.test.mjs']).status, 0);
  f.allowed();
});

test('real failing child process cannot back PASS', (t) => {
  const f = fixture(t);
  f.write('failing.test.mjs', "import assert from 'node:assert/strict'; assert.equal(1, 2);\n");
  assert.notEqual(f.execute(['--test', 'failing.test.mjs']).status, 0);
  f.denied();
});

test('PostToolUse without matching PreToolUse is rejected', (t) => {
  const f = fixture(t);
  f.post('npm test', 'orphan');
  f.denied();
});

test('PreToolUse without completion is rejected', (t) => {
  const f = fixture(t);
  f.start();
  f.denied();
});

test('mismatched command cannot complete a proof', (t) => {
  const f = fixture(t);
  f.post('python -m pytest -q', f.start('npm test'));
  f.denied();
});

test('mismatched tool-use ID cannot complete a proof', (t) => {
  const f = fixture(t);
  f.start();
  f.post('npm test', 'other-id');
  f.denied();
});

test('missing tool-use ID is rejected', (t) => {
  const f = fixture(t);
  f.hook('proof_start', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
  f.post('npm test', undefined);
  f.denied();
});

test('concurrent IDs complete independently out of order', (t) => {
  const f = fixture(t);
  const first = f.start('npm test');
  const second = f.start('python -m pytest -q');
  f.post('python -m pytest -q', second);
  f.post('npm test', first);
  f.allowed();
});

test('one concurrent ID cannot borrow another command snapshot', (t) => {
  const f = fixture(t);
  const first = f.start('npm test');
  f.start('python -m pytest -q');
  f.post('python -m pytest -q', first);
  f.denied();
});

test('prior-turn proof is not current proof', (t) => {
  const f = fixture(t);
  f.prove();
  f.stop('interim report');
  f.denied();
});

test('replayed completion cannot renew a prior-turn proof', (t) => {
  const f = fixture(t);
  const id = f.prove();
  f.stop('interim report');
  f.post('npm test', id);
  f.denied();
});

test('a pending proof cannot cross a turn boundary', (t) => {
  const f = fixture(t);
  const id = f.start();
  f.stop('interim report');
  f.post('npm test', id);
  f.denied();
});

test('later failing check invalidates earlier success', (t) => {
  const f = fixture(t);
  f.prove();
  f.prove('python -m pytest -q', { exit_code: 1 });
  f.denied();
});

test('unrelated success does not erase a failed check', (t) => {
  const f = fixture(t);
  f.prove('python -m pytest -q', { exit_code: 1 });
  f.prove();
  f.denied();
});

test('successful rerun of exact failed command resolves failure', (t) => {
  const f = fixture(t);
  f.prove('npm test', { exit_code: 1 });
  f.prove();
  f.allowed();
});

for (const phase of ['during execution', 'after execution']) {
  for (const mutation of ['modify', 'add', 'delete', 'restore bytes', 'metadata only']) {
    test(`${mutation} ${phase} invalidates snapshot`, (t) => {
      const f = fixture(t);
      const id = f.start();
      if (phase === 'after execution') f.post('npm test', id);
      const path = join(f.root, 'src/app.js');
      const original = readFileSync(path);
      const before = statSync(path);
      if (mutation === 'add') f.write('src/new.js', 'export const fresh = true;\n');
      else if (mutation === 'delete') rmSync(path);
      else if (mutation === 'metadata only') {
        utimesSync(path, before.atime, new Date(before.mtimeMs + 5000));
      } else {
        f.write('src/app.js', 'export const value = 2;\n');
        if (mutation === 'restore bytes') {
          f.write('src/app.js', original);
          utimesSync(path, before.atime, new Date(before.mtimeMs + 5000));
        }
      }
      if (phase === 'during execution') f.post('npm test', id);
      f.denied();
    });
  }
}

test('runtime log changes do not invalidate project proof', (t) => {
  const f = fixture(t);
  f.prove();
  f.write('.oh-my-zcode/runtime.log', 'new log entry\n');
  f.allowed();
});

test('a fresh rerun after source edits accepts the current snapshot', (t) => {
  const f = fixture(t);
  f.prove();
  f.write('src/app.js', 'export const value = 2;\n');
  f.prove();
  f.allowed();
});

for (const claim of ['VERDICT: PASS', 'FINDINGS: VERIFIED']) {
  test(`stop-hook retry cannot bypass missing proof for ${claim}`, (t) => {
    const f = fixture(t);
    const out = f.hook('stop', { last_assistant_message: claim, stop_hook_active: true });
    assert.notEqual(out, '', 'retry silently accepted an unbacked claim');
    assert.equal(JSON.parse(out).decision, 'block');
  });
}

test('VERDICT FAIL remains permitted without proof', (t) => {
  const f = fixture(t);
  f.allowed('VERDICT: FAIL');
});
