import assert from 'node:assert/strict';
import test from 'node:test';
import { checkHandle, handleProblem, nextHandle, normalizeHandle, suggestHandle } from './profile';

test('a handle is lowercase letters, numbers and underscores, three to twenty long', () => {
  assert.equal(checkHandle('nick_cox2'), 'ok');
  assert.equal(checkHandle('ab'), 'short');
  assert.equal(checkHandle('a'.repeat(21)), 'long');
  assert.equal(checkHandle('nick cox'), 'ok', 'spaces are removed first');
  assert.equal(checkHandle('nick-cox'), 'chars');
  assert.equal(checkHandle('Admin'), 'reserved');
  assert.equal(checkHandle('trackbench'), 'reserved');
});

test('typing is tidied: an @ in front and capitals do not matter', () => {
  assert.equal(normalizeHandle('  @Nick Cox '), 'nickcox');
  assert.equal(checkHandle('@NickCox'), 'ok');
});

test('every way to be wrong has a plain sentence, and being right has none', () => {
  assert.equal(handleProblem('ok'), '');
  for (const c of ['short', 'long', 'chars', 'reserved'] as const) assert.ok(handleProblem(c).length > 10);
});

test('a first suggestion comes from the name, then the email, and is always valid', () => {
  assert.equal(suggestHandle('Nicholas Cox'), 'nicholascox');
  assert.equal(suggestHandle('Zoë Ünal'), 'zoeunal');
  assert.equal(suggestHandle('', 'sam.lee@example.com'), 'samlee');
  assert.equal(suggestHandle(''), 'tracker');
  assert.equal(suggestHandle('Al'), 'al1');
  assert.equal(suggestHandle('Admin'), 'admin1');
  assert.equal(suggestHandle('A'.repeat(40)).length, 20);
  for (const n of ['Nicholas Cox', 'Zoë', '', '李雷', 'Admin', '!!']) assert.equal(checkHandle(suggestHandle(n)), 'ok', n);
});

test('a taken handle tries the same name with a number, staying within the length', () => {
  assert.equal(nextHandle('nicholascox', 2), 'nicholascox2');
  assert.equal(nextHandle('a'.repeat(20), 12).length, 20);
  assert.equal(checkHandle(nextHandle('a'.repeat(20), 12)), 'ok');
});
