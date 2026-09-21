import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { BINARY, fixture } from './test_proof_gate_helpers.mjs';

for (const marker of ['.oh-my-zcode', '.git', 'Cargo.toml']) {
  test(`unreadable ${marker} blocks parent scope and receipt selection`, (t) => {
    const f = fixture(t);
    f.write('.oh-my-zcode/state', 'outer workspace');
    f.write('nested/source.txt', 'child workspace');
    const child = join(f.root, 'nested');
    const link = join(child, marker);
    symlinkSync(link, link, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      const env = Object.fromEntries(Object.entries(process.env)
        .filter(([key]) => !key.startsWith('SCOPE_')));
      const mcp = spawnSync(BINARY, ['scope-mcp'], {
        cwd: child, env, encoding: 'utf8', timeout: 15000,
        input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
      assert.equal(mcp.error, undefined, mcp.error?.message);
      assert.equal(mcp.status, 1, 'unreadable boundary must not select outer scope');
      assert.equal(mcp.stdout, '');
      assert.match(mcp.stderr, /MCP I\/O failed/);
      const output = f.hook('proof_start', {
        cwd: child, tool_name: 'Bash', tool_use_id: 'unreadable-marker',
        tool_input: { command: 'npm test' },
      });
      assert.equal(JSON.parse(output).decision, 'block');
      assert.equal(existsSync(join(f.root, '.oh-my-zcode', 'receipts')), false);
    } finally {
      unlinkSync(link);
    }
  });
}
