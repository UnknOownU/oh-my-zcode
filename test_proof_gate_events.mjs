import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './test_proof_gate_helpers.mjs';

test('unfinished later verification cannot borrow an older success', (t) => {
  const f = fixture(t);
  f.prove();
  f.start();
  f.denied();
});

test('PostToolUseFailure consumes the attempt and a successful rerun recovers', (t) => {
  const f = fixture(t);
  const id = f.start();
  f.hook('evidence_failure', {
    tool_name: 'Bash', tool_use_id: id, tool_input: { command: 'npm test' },
    error: 'process failed', is_interrupt: true,
  });
  f.denied();
  f.prove();
  f.allowed();
});

test('failure-event result cannot be replayed as success', (t) => {
  const f = fixture(t);
  const id = f.start();
  f.hook('evidence_failure', {
    tool_name: 'Bash', tool_use_id: id, tool_input: { command: 'npm test' }, error: 'failed',
  });
  f.post('npm test', id);
  f.denied();
});

test('configured checks are all required', (t) => {
  const f = fixture(t);
  f.policy({ checks: ['node check-a.mjs', 'node check-b.mjs'].map(command => ({
    command, claim: 'pass', expected_exit: 0, output_includes: ['OK'],
  })) });
  f.prove('node check-a.mjs', { exit_code: 0, output: 'OK' });
  f.denied();
  f.prove('node check-b.mjs', { exit_code: 0, output: 'OK' });
  f.allowed();
});

test('numeric camelCase result is accepted and error flag is rejected', (t) => {
  const f = fixture(t);
  f.prove('npm test', { exitCode: 0, output: 'ok' });
  f.allowed();
  f.prove('npm test', { exit_code: 0, isError: true });
  f.denied();
});

test('proof hooks are registered synchronously on the actual host events', async () => {
  const { readFileSync } = await import('node:fs');
  const hooks = JSON.parse(readFileSync(new URL('./plugin/hooks/hooks.json', import.meta.url), 'utf8')).hooks;
  for (const [event, handler] of [['PreToolUse', 'proof_start'], ['PostToolUse', 'evidence'], ['PostToolUseFailure', 'evidence_failure']]) {
    const configured = hooks[event].flatMap(group => group.matcher === 'Bash' ? group.hooks : []);
    assert.ok(configured.some(hook => hook.type === 'process'
      && /\/bin\/oh-my-zcode(?:\.exe)?$/.test(hook.command)
      && JSON.stringify(hook.args) === JSON.stringify(['hook', handler]) && !hook.async));
  }
});

for (const command of ['tsc -v', 'tsc --showConfig', 'eslint --print-config app.js',
  'ruff version', 'biome rage', 'semgrep login', 'cypress version', 'pre-commit install',
  'npm test --dry-run', 'jest --listTests=true']) {
  test('informational invocation is not proof: ' + command, (t) => {
    const f = fixture(t);
    f.prove(command);
    f.denied();
  });
}
