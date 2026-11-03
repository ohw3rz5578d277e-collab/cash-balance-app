'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run only the shipped client-side outbox helpers. Never call real Cloudflare.
const source = fs.readFileSync(path.join(__dirname, '..', 'functions/index.js'), 'utf8');
const begin = source.indexOf('(function(){');
const end = source.indexOf('function ensureDataCheckStyle(){', begin);
assert.ok(begin > 0 && end > begin, 'find injected outbox helper boundaries');
const exposed = source.slice(begin, end) +
  '\nwindow.__outboxTests = {queueRecord, flushOutbox, readOutbox, safeServerAdditions};})();';

const KEY = 'cash_balance_app_draft_v21';
const PINKEY = 'cash_balance_app_pin_v21';
const stamp = '2026-11-03T01:00:00.000Z';
const punch = (id, type, time, createdAt) => ({
  id, type, date: '2026-11-03', time, createdAt
});
const entryRecord = () => ({
  id: 'rec-test', date: '2026-11-03', updatedAt: stamp,
  attendanceLogs: [punch('att-in', 'clockIn', '09:00', '2026-11-03T00:00:00.000Z')]
});

function harness(reply) {
  class Storage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.get(String(key)) ?? null; }
    setItem(key, value) { if (this.rejectMergedDraft && String(key) === KEY && String(value).includes('att-break')) throw new Error('storage temporarily unavailable'); this.data.set(String(key), String(value)); }
    removeItem(key) { this.data.delete(String(key)); }
  }
  const localStorage = new Storage();
  const events = [];
  const indicator = { textContent: '', classList: { add() {}, remove() {} } };
  const window = { dispatchEvent(ev) { events.push(ev); return true; } };
  const document = { getElementById(id) { return id === 'statusText' ? indicator : null; } };
  let response = reply;
  const scheduled = [];
  const fetch = async (_, options) => ({
    ok: true,
    async json() { return await response(options); }
  });
  const sandbox = {
    window, document, localStorage, Storage, fetch,
    setTimeout(fn, ms) { scheduled.push(ms); return scheduled.length; }, clearTimeout() {},
    CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options.detail; },
    Date, JSON
  };
  localStorage.setItem(PINKEY, 'local-test-pin');
  vm.runInNewContext(exposed, sandbox, { filename: 'injected-outbox.js' });
  const api = window.__outboxTests;
  const writeDraft = record => localStorage.setItem(KEY, JSON.stringify({ state: record }));
  const readDraft = () => JSON.parse(localStorage.getItem(KEY) || '{}').state;
  return { api, localStorage, indicator, events, scheduled, writeDraft, readDraft, setReply(v) { response = v; } };
}

test('stale merge adds a proven newer punch and drains the outbox', async () => {
  const client = entryRecord();
  const extra = punch('att-break', 'breakStart', '11:30', '2026-11-03T02:00:00.000Z');
  const server = { ...client, attendanceLogs: [...client.attendanceLogs, extra], updatedAt: '2026-11-03T03:00:00.000Z' };
  const h = harness(async () => ({ ok: true, staleMerge: true, record: server }));
  h.writeDraft(client);
  assert.equal(Object.keys(h.api.readOutbox()).length, 1);
  await h.api.flushOutbox();
  assert.equal(Object.keys(h.api.readOutbox()).length, 0);
  assert.equal(h.readDraft().attendanceLogs.length, 2);
  assert.equal(h.readDraft().attendanceLogs[1].id, 'att-break');
  assert.ok(h.events.some(ev => ev.type === 'cash-record-synced'));
});

test('conflicting edit to an existing punch never silently replaces the local time', async () => {
  const client = entryRecord();
  const server = { ...client, attendanceLogs: [{ ...client.attendanceLogs[0], time: '09:15' }] };
  const h = harness(async () => ({ ok: true, staleMerge: true, record: server }));
  h.writeDraft(client);
  await h.api.flushOutbox();
  assert.equal(Object.keys(h.api.readOutbox()).length, 1);
  assert.equal(h.readDraft().attendanceLogs[0].time, '09:00');
});

test('unverifiable older server additions do not restore deleted attendance', async () => {
  const client = entryRecord();
  const extra = punch('att-old', 'clockOut', '19:00', '2026-11-02T03:00:00.000Z');
  const server = { ...client, attendanceLogs: [...client.attendanceLogs, extra] };
  const h = harness(async () => ({ ok: true, staleMerge: true, record: server }));
  h.writeDraft(client);
  await h.api.flushOutbox();
  assert.equal(Object.keys(h.api.readOutbox()).length, 1);
  assert.equal(h.readDraft().attendanceLogs.length, 1);
});

test('missing createdAt on a server-only punch is not assumed safe', async () => {
  const client = entryRecord();
  const extra = { id: 'att-unknown', type: 'clockOut', date: client.date, time: '18:00' };
  const server = { ...client, attendanceLogs: [...client.attendanceLogs, extra] };
  const h = harness(async () => ({ ok: true, staleMerge: true, record: server }));
  h.writeDraft(client);
  await h.api.flushOutbox();
  assert.equal(Object.keys(h.api.readOutbox()).length, 1);
});

test('non-stale mismatch does not qualify for reconciliation', async () => {
  const client = entryRecord();
  const extra = punch('att-new', 'clockOut', '18:00', '2026-11-03T03:00:00.000Z');
  const server = { ...client, attendanceLogs: [...client.attendanceLogs, extra] };
  const h = harness(async () => ({ ok: true, staleMerge: false, record: server }));
  h.writeDraft(client);
  await h.api.flushOutbox();
  assert.equal(Object.keys(h.api.readOutbox()).length, 1);
});

test('a second edit during POST is not erased by an earlier server reply', async () => {
  const client = entryRecord();
  const extra = punch('att-new', 'clockOut', '18:00', '2026-11-03T03:00:00.000Z');
  const server = { ...client, attendanceLogs: [...client.attendanceLogs, extra] };
  let h;
  h = harness(async () => {
    h.writeDraft({ ...client, updatedAt: '2026-11-03T04:00:00.000Z', attendanceLogs: [...client.attendanceLogs, extra] });
    return { ok: true, staleMerge: true, record: server };
  });
  h.writeDraft(client);
  await h.api.flushOutbox();
  assert.equal(Object.keys(h.api.readOutbox()).length, 1);
  assert.equal(h.readDraft().updatedAt, '2026-11-03T04:00:00.000Z');
  assert.equal(h.scheduled.at(-1), 0, 'the newer edit should be retried immediately');
});

test('exact server match still confirms the original outbox flow', async () => {
  const client = entryRecord();
  const h = harness(async () => ({ ok: true, staleMerge: false, record: client }));
  h.writeDraft(client);
  await h.api.flushOutbox();
  assert.equal(Object.keys(h.api.readOutbox()).length, 0);
  assert.equal(h.indicator.textContent, '同期済み');
});

test('failed local adoption preserves the outbox and backs off rather than retrying 5 times a second', async () => {
  const client = entryRecord();
  const extra = punch('att-break', 'breakStart', '11:30', '2026-11-03T02:00:00.000Z');
  const server = { ...client, attendanceLogs: [...client.attendanceLogs, extra], updatedAt: '2026-11-03T03:00:00.000Z' };
  const h = harness(async () => ({ ok: true, staleMerge: true, record: server }));
  h.writeDraft(client);
  h.localStorage.rejectMergedDraft = true;
  await h.api.flushOutbox();
  assert.equal(h.readDraft().attendanceLogs.length, 1, 'local data must not be falsely changed');
  assert.equal(Object.keys(h.api.readOutbox()).length, 1, 'outbox must remain retryable');
  assert.equal(h.scheduled.at(-1), 60000, 'storage failure should not create a tight retry loop');
});
