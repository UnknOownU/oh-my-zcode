import test from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture } from './test_proof_gate_helpers.mjs';

for (const response of [
  { exit_code: null, exitCode: 0 },
  { exit_code: 0, exitCode: 1 },
  { exit_code: 0, exitCode: null },
  { exit_code: '0', exitCode: 0 },
]) {
  test('unknown or contradictory exit aliases refuse proof: ' + JSON.stringify(response), (t) => {
    const f = fixture(t);
    f.prove('npm test', response);
    f.denied();
  });
}
test('matching numeric exit aliases accept proof', (t) => {
  const f = fixture(t);
  f.prove('npm test', { exit_code: 0, exitCode: 0 });
  f.allowed();
});
test('an unrelated external passing suite cannot authorize a broken workspace', (t) => {
  const f = fixture(t);
  const external = fixture(t);
  f.write('verify.test.mjs', 'throw new Error("workspace suite fails");\n');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const broken = spawnSync(process.execPath, ['--test', 'verify.test.mjs'], { cwd: f.root, env });
  assert.equal(broken.status, 1);
  const target = join(external.root, 'verify.test.mjs');
  const command = 'node --test "' + target.replaceAll('\\', '/') + '"';
  const id = f.start(command);
  const passing = spawnSync(process.execPath, ['--test', target], { cwd: f.root, env, encoding: 'utf8' });
  assert.equal(passing.status, 0);
  f.post(command, id, { exit_code: passing.status, output: passing.stdout });
  f.denied();
});
test('a real selector that skips the only failing test cannot supply proof', (t) => {
  const f = fixture(t);
  f.write('named.test.mjs', 'import test from "node:test"; test("REAL_TEST",()=>{throw new Error("must run")});\n');
  const result = f.execute(['--test', '--test-name-pattern=NEVER_MATCH', 'named.test.mjs']);
  assert.equal(result.status, 0);
  f.denied();
});
for (const command of [
  'cargo test --no-run', 'cargo test NEVER', 'go test -run "^$"',
  'mvn test -DskipTests', 'jest --passWithNoTests', 'ctest -N',
  'vitest run --testNamePattern=NEVER', 'pytest -k NEVER',
  'dotnet test --list-tests', 'dotnet test --no-build', 'make test -n', 'cmake --build . -- -n',
  'npm test -- --test-name-pattern=NEVER',
]) {
  test('selective or nonexecuting invocation requires an explicit contract: ' + command, (t) => {
    const f = fixture(t);
    f.prove(command);
    f.denied();
  });
}
test('declared artifacts work through a symlink or Windows junction root', (t) => {
  const f = fixture(t);
  const aliases = fixture(t);
  f.write('dist/app.js', 'built bytes\n');
  const alias = join(aliases.root, 'linked');
  symlinkSync(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  f.policy({ artifacts: ['dist/app.js'] });
  const id = f.start('npm test', { cwd: alias });
  f.post('npm test', id, { exit_code: 0 }, { cwd: f.root });
  f.allowed();
});
test('declared artifacts still reject a symlink escaping the workspace', (t) => {
  const f = fixture(t);
  const external = fixture(t);
  const link = join(f.root, 'linked');
  symlinkSync(external.root, link, process.platform === 'win32' ? 'junction' : 'dir');
  f.policy({ artifacts: ['linked/src/app.js'] });
  f.prove();
  f.denied();
});

test('an ignored test must be declared and stays bound to its bytes', (t) => {
  const f = fixture(t);
  f.write('dist/built.test.mjs', 'import test from "node:test"; test("built",()=>{});\n');
  assert.equal(f.execute(['--test', 'dist/built.test.mjs']).status, 0);
  f.denied();
  f.policy({ artifacts: ['dist/built.test.mjs'] });
  assert.equal(f.execute(['--test', 'dist/built.test.mjs']).status, 0);
  f.allowed();
  assert.equal(f.execute(['--test', 'dist/built.test.mjs']).status, 0);
  f.write('dist/built.test.mjs', 'throw new Error("changed");\n');
  f.denied();
});

test('an absolute test path inside the workspace is accepted', (t) => {
  const f = fixture(t);
  const command = 'node --test "' + join(f.root, 'verify.test.mjs').replaceAll('\\', '/') + '"';
  f.prove(command);
  f.allowed();
});

test('an ignored ancestor junction cannot hide an external explicit artifact', (t) => {
  const f = fixture(t);
  const external = fixture(t);
  symlinkSync(external.root, join(f.root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  f.policy({ artifacts: ['dist/src/app.js'] });
  f.prove();
  f.denied();
});

test('implicit discovery from an ignored cwd requires that artifact directory', (t) => {
  const f = fixture(t);
  f.write('verify.test.mjs', 'throw new Error("workspace suite fails");\n');
  f.write('dist/passing.test.mjs', 'import test from "node:test"; test("built artifact",()=>{});\n');
  const cwd = join(f.root, 'dist');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = () => {
    const id = f.start('node --test', { cwd });
    const result = spawnSync(process.execPath, ['--test'], { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    f.post('node --test', id, { exit_code: result.status, stdout: result.stdout }, { cwd });
  };
  run();
  f.denied();
  f.policy({ artifacts: ['dist'] });
  run();
  f.allowed();
});

test('an internal artifact alias may identify the actual tested bytes', (t) => {
  const f = fixture(t);
  f.write('dist/real.test.mjs', 'import test from "node:test"; test("aliased artifact",()=>{});\n');
  symlinkSync(join(f.root, 'dist'), join(f.root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  f.policy({ artifacts: ['alias/real.test.mjs'] });
  assert.equal(f.execute(['--test', 'alias/real.test.mjs']).status, 0);
  f.allowed();
});
