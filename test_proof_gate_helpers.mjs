import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BINARY = process.env.OHMY_ZCODE_BIN
  ? resolve(process.env.OHMY_ZCODE_BIN)
  : join(HERE, 'target', 'debug', `oh-my-zcode${process.platform === 'win32' ? '.exe' : ''}`);

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'proof-gate-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let nextId = 0;
  const write = (name, contents) => {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    return path;
  };
  write('package.json', '{"scripts":{"test":"node --test verify.test.mjs"}}\n');
  write('src/app.js', 'export const value = 1;\n');
  write('verify.test.mjs', "import assert from 'node:assert/strict'; assert.equal(1 + 1, 2);\n");
  const hook = (kind, payload = {}) => {
    const result = spawnSync(BINARY, ['hook', kind], {
      cwd: root,
      input: JSON.stringify({ session_id: 'proof-test', cwd: root, ...payload }),
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `hook crashed: ${result.stderr}`);
    return result.stdout.trim();
  };
  const payload = (command, id, extra = {}) => ({
    tool_name: 'Bash', tool_use_id: id, tool_input: { command }, ...extra,
  });
  const start = (command = 'npm test', extra = {}) => {
    const id = `tool-${++nextId}`;
    hook('proof_start', payload(command, id, extra));
    return id;
  };
  const post = (command, id, response = { exit_code: 0, output: 'ok' }, extra = {}) =>
    hook('evidence', payload(command, id, { tool_response: response, ...extra }));
  const prove = (command = 'npm test', response = { exit_code: 0, output: 'ok' }) => {
    const id = start(command);
    post(command, id, response);
    return id;
  };
  const stop = (claim = 'VERDICT: PASS') => hook('stop', { last_assistant_message: claim });
  const denied = (claim = 'VERDICT: PASS') => {
    const out = stop(claim);
    assert.notEqual(out, '', `unbacked ${claim} was accepted`);
    assert.equal(JSON.parse(out).decision, 'block', out);
  };
  const allowed = (claim = 'VERDICT: PASS') => {
    const out = stop(claim);
    assert.equal(out, '', `valid ${claim} was blocked: ${out}`);
  };
  const execute = (args) => {
    const command = ['node', ...args].join(' ');
    const id = start(command);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // Nested node --test otherwise skips execution.
    const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined, result.error?.message);
    post(command, id, { exit_code: result.status, output: result.stdout + result.stderr });
    return result;
  };
  const policy = (value) => write('.oh-my-zcode/proof-policy.json', JSON.stringify(value));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
  };
  return { root, write, hook, start, post, prove, stop, denied, allowed, execute, policy, git };
}
