'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Test the shipped history code with deterministic in-memory storage.
// No Cloudflare, production D1 or user records are accessed.
const raw = fs.readFileSync(path.join(__dirname, '..', 'attendance-history.js'), 'utf8');
const source = raw.replace(/\}\)\(\);\s*$/, 'window.__historyTests = {mergeDraft, flatten};})();');
assert.notEqual(source, raw, 'test seam should expose history helpers');

function harness() {
  const storage = new Map();
  const windowStub = {};
  const sandbox = {
    window: windowStub,
    document: { readyState: 'loading', addEventListener() {} },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); }
    }
  };
  vm.runInNewContext(source, sandbox, { filename: 'attendance-history.js' });
  const saveDraft = (state) => storage.set('cash_balance_app_draft_v21', JSON.stringify({ state }));
  const setPending = (id, pending) => storage.set('cash_balance_app_save_outbox_v1', JSON.stringify(pending ? { [id]: { queuedAt: new Date().toISOString() } } : {}));
  return { ...windowStub.__historyTests, saveDraft, setPending };
}

const earlier = '2026-11-03T01:00:00.000Z';
const later = '2026-11-03T02:00:00.000Z';
const entry = (id, type, time) => ({ id, type, date: '2026-11-03', time });
const inLog = entry('att-in', 'clockIn', '09:00');
const outLog = entry('att-out', 'clockOut', '17:00');
const record = (updatedAt, attendanceLogs, id = 'rec-test') => ({ id, date: '2026-11-03', updatedAt, attendanceLogs });

test('new local punches appear despite stale cloud history when no outbox exists', () => {
  const h = harness();
  h.saveDraft(record(later, [inLog, outLog]));
  h.setPending('rec-test', false);
  const visible = h.flatten(h.mergeDraft([record(earlier, [inLog])]));
  assert.deepEqual(Array.from(visible, x => x.log.id), ['att-out', 'att-in']);
});

test('pending local punches override cloud snapshots', () => {
  const h = harness();
  h.saveDraft(record(earlier, [inLog, outLog]));
  h.setPending('rec-test', true);
  assert.equal(h.flatten(h.mergeDraft([record(later, [inLog])])).length, 2);
});

test('an unsynced local-only record is visible even if API fetch is empty', () => {
  const h = harness();
  h.saveDraft(record(later, [inLog]));
  assert.equal(h.flatten(h.mergeDraft([])).length, 1);
});

test('a newer cloud snapshot wins over stale local history, including deletions', () => {
  const h = harness();
  h.saveDraft(record(earlier, [inLog, outLog]));
  h.setPending('rec-test', false);
  const visible = h.flatten(h.mergeDraft([record(later, [inLog])]));
  assert.deepEqual(Array.from(visible, x => x.log.id), ['att-in']);
});

test('the remote history survives when no local draft is present', () => {
  const h = harness();
  h.saveDraft(null);
  assert.equal(h.flatten(h.mergeDraft([record(later, [outLog])])).length, 1);
});

test('local records of a different ID never replace cloud history', () => {
  const h = harness();
  h.saveDraft(record(later, [outLog], 'other'));
  const visible = h.mergeDraft([record(earlier, [inLog])]);
  assert.equal(visible.length, 2);
});
