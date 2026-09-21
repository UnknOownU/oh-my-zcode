import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './test_proof_gate_helpers.mjs';

const finding = {
  command: 'node reproduce.mjs', claim: 'findings', expected_exit: 1,
  output_includes: ['EXPECTED'],
};

function reproduction(t) {
  const f = fixture(t);
  f.write('reproduce.mjs', "console.log('EXPECTED'); process.exit(1);\n");
  f.policy({ checks: [finding] });
  return f;
}

test('declared expected nonzero reproduction supports FINDINGS VERIFIED', (t) => {
  const f = reproduction(t);
  const result = f.execute(['reproduce.mjs']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /EXPECTED/);
  f.allowed('FINDINGS: VERIFIED');
});

test('declared expected nonzero reproduction never supports PASS', (t) => {
  const f = reproduction(t);
  f.execute(['reproduce.mjs']);
  f.denied();
});

for (const [name, response] of [
  ['wrong exit', { exit_code: 0, output: 'EXPECTED' }],
  ['missing literal', { exit_code: 1, output: 'different output' }],
  ['wrong case', { exit_code: 1, output: 'expected' }],
  ['timeout', { exit_code: 1, output: 'EXPECTED', timed_out: true }],
  ['missing status', { output: 'EXPECTED' }],
]) {
  test(`declared finding rejects ${name}`, (t) => {
    const f = reproduction(t);
    f.prove(finding.command, response);
    f.denied('FINDINGS: VERIFIED');
  });
}

test('all configured output literals are required', (t) => {
  const f = reproduction(t);
  f.policy({ checks: [{ ...finding, output_includes: ['EXPECTED', 'SECOND'] }] });
  f.prove(finding.command, { exit_code: 1, output: 'EXPECTED' });
  f.denied('FINDINGS: VERIFIED');
});

test('undeclared nonzero test cannot support FINDINGS VERIFIED', (t) => {
  const f = fixture(t);
  f.prove('npm test', { exit_code: 1, output: 'EXPECTED' });
  f.denied('FINDINGS: VERIFIED');
});

for (const phase of ['during execution', 'after execution']) {
  test(`policy changes ${phase} invalidate proof`, (t) => {
    const f = fixture(t);
    f.policy({ artifacts: ['src/app.js'] });
    const id = f.start();
    if (phase === 'after execution') f.post('npm test', id);
    f.policy({ artifacts: ['package.json'] });
    if (phase === 'during execution') f.post('npm test', id);
    f.denied();
  });
}

test('adding policy after proof invalidates proof', (t) => {
  const f = fixture(t);
  f.prove();
  f.policy({ artifacts: ['src/app.js'] });
  f.denied();
});

test('removing policy after proof invalidates proof', (t) => {
  const f = fixture(t);
  f.policy({ artifacts: ['src/app.js'] });
  f.prove();
  rmSync(join(f.root, '.oh-my-zcode/proof-policy.json'));
  f.denied();
});

test('an explicitly declared missing artifact fails closed', (t) => {
  const f = fixture(t);
  f.policy({ artifacts: ['dist/missing.js'] });
  f.prove();
  f.denied();
});

function gitFixture(t) {
  const f = fixture(t);
  f.write('.gitignore', 'dist/\n.oh-my-zcode/\n');
  f.write('dist/app.js', 'built v1\n');
  f.git('init', '--quiet');
  f.git('add', '.gitignore', 'package.json', 'src/app.js', 'verify.test.mjs');
  return f;
}

test('ignored generated files are excluded from default source snapshot', (t) => {
  const f = gitFixture(t);
  f.prove();
  f.write('dist/app.js', 'built v2\n');
  f.allowed();
});

test('nonignored untracked sources are included in git snapshot', (t) => {
  const f = gitFixture(t);
  f.prove();
  f.write('src/untracked.js', 'new source\n');
  f.denied();
});

test('deleted tracked sources invalidate git snapshot', (t) => {
  const f = gitFixture(t);
  f.prove();
  rmSync(join(f.root, 'src/app.js'));
  f.denied();
});

for (const phase of ['during execution', 'after execution']) {
  for (const mutation of ['modify', 'delete', 'restore bytes']) {
    test(`declared ignored artifact ${mutation} ${phase} invalidates proof`, (t) => {
      const f = gitFixture(t);
      f.policy({ artifacts: ['dist/app.js'] });
      const id = f.start();
      if (phase === 'after execution') f.post('npm test', id);
      const path = join(f.root, 'dist/app.js');
      const before = statSync(path);
      if (mutation === 'delete') rmSync(path);
      else {
        f.write('dist/app.js', 'built v2\n');
        if (mutation === 'restore bytes') {
          f.write('dist/app.js', 'built v1\n');
          utimesSync(path, before.atime, new Date(before.mtimeMs + 5000));
        }
      }
      if (phase === 'during execution') f.post('npm test', id);
      f.denied();
    });
  }
}

test('unchanged explicitly declared ignored output permits PASS', (t) => {
  const f = gitFixture(t);
  f.policy({ artifacts: ['dist/app.js'] });
  f.prove();
  f.allowed();
});
