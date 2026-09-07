import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../usage-report.mjs', import.meta.url), 'utf8');
const reader = source.slice(source.indexOf('function getTokensFromTranscript('), source.indexOf('// ─── OAuth credentials'));
function parse(rows) {
  const context = vm.createContext({ existsSync: () => true, readFileSync: () => rows.map(JSON.stringify).join('\n') });
  vm.runInContext(reader, context);
  return context.getTokensFromTranscript('synthetic');
}
const row = (id, output, sessionId = 's') => ({ type: 'assistant', sessionId,
  message: { id, usage: { input_tokens: 10, output_tokens: output } } });
test('growing output, stale replay and equal distinct messages', () => {
  const result = parse([row('a', 3), row('a', 2055), row('a', 3), row('b', 2055)]);
  assert.equal(result.outputTokens, 4110);
  assert.equal(result.inputTokens, 20);
  assert.equal(result.requestCount, 2);
});
test('session identity and anonymous messages remain independent', () => {
  const result = parse([row('a', 20), row('a', 20, 'other'), row(null, 20), row(null, 20)]);
  assert.equal(result.outputTokens, 80);
  assert.equal(result.requestCount, 4);
});
