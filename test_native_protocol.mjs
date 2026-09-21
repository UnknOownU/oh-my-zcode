import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BINARY, fixture } from './test_proof_gate_helpers.mjs';

function exchange(t, input, extraEnv = {}) {
  const f = fixture(t);
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith('SCOPE_')));
  const result = spawnSync(BINARY, ['scope-mcp'], {
    cwd: f.root, input, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.split(/\r?\n/).filter(line => line.trim()).map(JSON.parse);
  for (const response of responses) assert.equal(response.jsonrpc, '2.0');
  return { responses, root: f.root };
}

const request = (id, method, params) => JSON.stringify({ jsonrpc: '2.0', id, method, params });

test('MCP answers CRLF frames, ignores blank lines, and reads a final line without newline', (t) => {
  const input = '\r\n' + request(7, 'ping') + '\r\n\r\n' + request('last-frame', 'ping');
  assert.deepEqual(exchange(t, input).responses, [
    { jsonrpc: '2.0', id: 7, result: {} },
    { jsonrpc: '2.0', id: 'last-frame', result: {} },
  ]);
});

test('MCP emits no replies to notifications without IDs, including unknown methods', (t) => {
  const input = [
    request(undefined, 'notifications/initialized'),
    request(undefined, 'ping'),
    request(undefined, 'does-not-exist'),
    request(undefined, 'tools/call', { name: 'unknown', arguments: {} }),
    request(1, 'ping'),
  ].join('\n');
  assert.deepEqual(exchange(t, input).responses, [{ jsonrpc: '2.0', id: 1, result: {} }]);
});

test('MCP rejects explicit null and fractional IDs instead of treating them as notifications', (t) => {
  const input = [request(null, 'ping'), request(1.5, 'ping'), request('control', 'ping')].join(String.fromCharCode(10));
  const { responses } = exchange(t, input);
  assert.equal(responses.length, 3);
  for (const response of responses.slice(0, 2)) {
    assert.equal(response.id, null);
    assert.equal(response.error.code, -32600);
  }
  assert.deepEqual(responses[2], { jsonrpc: '2.0', id: 'control', result: {} });
});

test('MCP rejects non-object parameters for every built-in method', (t) => {
  const methods = ['ping', 'tools/list', 'initialize'];
  const frames = methods.flatMap(method => [42, 'invalid', false, null, []]
    .map((params, index) => request(method + index, method, params)));
  const { responses } = exchange(t, frames.join(String.fromCharCode(10)));
  assert.equal(responses.length, frames.length);
  for (const response of responses) assert.equal(response.error?.code, -32602, JSON.stringify(response));
});

test('MCP keeps object parameters valid and invalid notifications silent', (t) => {
  const frames = [
    request(undefined, 'ping', 42),
    request('ping', 'ping', {}),
    request('tools', 'tools/list', {}),
    request('initialize', 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } }),
  ];
  const { responses } = exchange(t, frames.join(String.fromCharCode(10)));
  assert.deepEqual(responses.map(response => response.id), ['ping', 'tools', 'initialize']);
  for (const response of responses) assert.equal(response.error, undefined);
});

test('MCP malformed JSON reports a parse error and continues with the next frame', (t) => {
  const { responses } = exchange(t, '{broken\n' + request(2, 'ping') + '\n');
  assert.equal(responses.length, 2);
  assert.equal(responses[0].id, null);
  assert.equal(responses[0].error.code, -32700);
  assert.deepEqual(responses[1], { jsonrpc: '2.0', id: 2, result: {} });
});

test('MCP rejects scalar and array frames as invalid requests', (t) => {
  const { responses } = exchange(t, 'null\ntrue\n42\n"request"\n[]\n');
  assert.equal(responses.length, 5);
  for (const response of responses) {
    assert.equal(response.id, null);
    assert.equal(response.error.code, -32600);
  }
});

test('MCP rejects invalid protocol, method, and ID types', (t) => {
  const invalid = [
    { jsonrpc: '1.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', id: 2, method: 9 },
    { jsonrpc: '2.0', id: true, method: 'ping' },
  ];
  const { responses } = exchange(t, invalid.map(value => JSON.stringify(value)).join('\n'));
  assert.equal(responses.length, invalid.length);
  for (const response of responses) assert.equal(response.error.code, -32600);
});

test('MCP distinguishes unknown methods from invalid tool-call parameters', (t) => {
  const frames = [
    request('missing-method', 'unknown'),
    request('missing-params', 'tools/call'),
    request('array-params', 'tools/call', []),
    request('invalid-name', 'tools/call', { name: 1, arguments: {} }),
    request('unknown-tool', 'tools/call', { name: 'authorize', arguments: {} }),
  ];
  const { responses } = exchange(t, frames.join('\n'));
  assert.deepEqual(responses.map(response => [response.id, response.error.code]), [
    ['missing-method', -32601],
    ['missing-params', -32602],
    ['array-params', -32602],
    ['invalid-name', -32602],
    ['unknown-tool', -32602],
  ]);
});

test('MCP cannot arm authorization from environment configuration', (t) => {
  const { responses, root } = exchange(t,
    request(1, 'tools/call', { name: 'get_scope', arguments: {} }),
    { SCOPE_TARGETS: 'example.com', SCOPE_ENV: 'staging', SCOPE_AUTHORIZED: 'true' });
  const scope = JSON.parse(responses[0].result.content[0].text);
  assert.equal(scope.armed, false);
  assert.equal(existsSync(join(root, '.oh-my-zcode', 'security', 'active_scope.json')), false);
});

test('MCP closes cleanly on an empty input stream', (t) => {
  assert.deepEqual(exchange(t, '').responses, []);
});
