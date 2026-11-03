'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual legacy HTML refresh function without external API calls.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('async function loadRecords(opts){');
const end = html.indexOf('async function deleteRecord(){', start);
assert.ok(start > 0 && end > start, 'legacy loadRecords code boundary');
const source = html.slice(start, end) + '\nwindow.__testLoadRecords=loadRecords;';

function record(id, time, updatedAt) {
  return {
    id, date: '2026-11-03', updatedAt,
    attendanceLogs: [{ id: 'att-clockin', type: 'clockIn', date: '2026-11-03', time,
      createdAt: '2026-11-03T00:00:00.000Z' }]
  };
}

function harness({ dirty = false, pending = false, local, remote, error = null, openLatest = false }) {
  const status = [];
  const notices = [];
  const sandbox = {
    window: {}, API: '/api/records',
    appPin: 'test-pin', loading: false, dirty,
    state: local, records: [],
    Date,
    api: async () => {
      if (error) throw error;
      return { records: remote };
    },
    normalize: r => JSON.parse(JSON.stringify(r)),
    clone: r => JSON.parse(JSON.stringify(r)),
    sortUpdated: (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    currentRecordPending: () => pending,
    latestRecord() {
      return sandbox.records[0] || null;
    },
    fillForm() { sandbox.forms = (sandbox.forms || 0) + 1; },
    saveDraft() { sandbox.drafts = (sandbox.drafts || 0) + 1; },
    render() { sandbox.renders = (sandbox.renders || 0) + 1; },
    setStatus(ok, message) { status.push({ ok, message }); },
    toast(message) { notices.push(message); },
    alert() { throw new Error('unexpected alert'); },
    // enable immediate date-based request and no production access
  };
  vm.runInNewContext(source, sandbox, { filename: 'legacy-loadRecords.js' });
  return {
    sandbox, status, notices,
    async refresh() { await sandbox.window.__testLoadRecords({ openLatest, show: true }); },
    current() { return sandbox.state; },
    rows() { return sandbox.records; }
  };
}

const earlier = '2026-11-03T00:01:00.000Z';
const later = '2026-11-03T00:02:00.000Z';

test('unflushed attendance outbox wins over old cloud data even when dirty was reset', async () => {
  const local = record('rec-current', '09:25', later);
  const remote = record('rec-current', '09:00', earlier);
  const h = harness({ local, remote: [remote], dirty: false, pending: true, openLatest: true });
  await h.refresh();
  assert.equal(h.current().attendanceLogs[0].time, '09:25');
  assert.equal(h.rows()[0].attendanceLogs[0].time, '09:25');
  assert.deepEqual(h.status.at(-1), { ok: false, message: '端末保存済み・クラウド同期待ち' });
  assert.equal(h.sandbox.forms || 0, 0);
});

test('an unsaved legacy edit stays visible in history while remote fetch completes', async () => {
  const h = harness({ local: record('rec-current', '09:25', later),
    remote: [record('rec-current', '09:00', earlier)], dirty: true, pending: false });
  await h.refresh();
  assert.equal(h.rows()[0].attendanceLogs[0].time, '09:25');
  assert.deepEqual(h.status.at(-1), { ok: false, message: '変更を保存待ち' });
});

test('the unsynced current record survives if it is not yet present on D1', async () => {
  const local = record('rec-new', '09:25', later);
  const h = harness({ local, remote: [], dirty: false, pending: true });
  await h.refresh();
  assert.equal(h.rows().length, 1);
  assert.equal(h.rows()[0].id, 'rec-new');
  assert.equal(h.rows()[0].attendanceLogs[0].time, '09:25');
});

test('without pending edits the latest cloud record is loaded as before', async () => {
  const local = record('rec-current', '09:00', earlier);
  const remote = record('rec-current', '09:25', later);
  const h = harness({ local, remote: [remote], dirty: false, pending: false });
  await h.refresh();
  assert.equal(h.current().attendanceLogs[0].time, '09:25');
  assert.equal(h.rows()[0].attendanceLogs[0].time, '09:25');
  assert.deepEqual(h.status.at(-1), { ok: true, message: '同期済み / 1件' });
  assert.equal(h.sandbox.forms, 1);
});

test('a failed cloud refresh never claims synchronization', async () => {
  const h = harness({ local: record('rec-current', '09:25', later), remote: [],
    error: new Error('offline'), dirty: false, pending: false });
  await h.refresh();
  assert.deepEqual(h.status.at(-1), { ok: false, message: '読込エラー' });
});
