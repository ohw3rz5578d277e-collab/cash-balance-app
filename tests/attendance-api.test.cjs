'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Keep all D1 and HTTP operations inside in-memory fakes.
// These tests never contact production or read user records.
const source = fs.readFileSync(path.join(__dirname, '..', 'functions/api/records.js'), 'utf8')
  .replace('export async function onRequest(', 'async function onRequest(')
  + '\nwindow.__attendanceApiTest = onRequest;';

function createApi() {
  const rows = new Map();
  const DB = {
    prepare(sql) {
      let bound = [];
      return {
        bind(...params) { bound = params; return this; },
        async first() {
          const existing = rows.get(String(bound[0]));
          return existing ? { created_at: existing.created_at, updated_at: existing.updated_at, payload: existing.payload } : null;
        },
        async all() {
          const record = rows.get(String(bound[0]));
          return { results: record ? [record] : [] };
        },
        async run() {
          if (!sql.includes('INSERT INTO cash_records')) {
            throw new Error('unexpected D1 write');
          }
          const [id, workDate, payload, createdAt, updatedAt] = bound;
          rows.set(String(id), {
            id: String(id), work_date: String(workDate), payload,
            created_at: String(createdAt), updated_at: String(updatedAt)
          });
          return { success: true };
        }
      };
    }
  };
  const win = {};
  vm.runInNewContext(source, { window: win, Request, Response, URL }, { filename: 'functions/api/records.js' });
  const invoke = async (method, record, id = record && record.id) => {
    const url = 'https://example.test/api/records' + (method === 'GET' ? '?id=' + encodeURIComponent(id) : '');
    const request = new Request(url, {
      method,
      headers: { 'x-app-pin': 'test-pin', 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify({ record }) } : {})
    });
    const response = await win.__attendanceApiTest({ request, env: { DB, APP_PIN: 'test-pin' } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
    return data;
  };
  return { invoke };
}

const item = (id, type, time, createdAt = '2026-11-03T00:10:00.000Z') =>
  ({ id, type, date: '2026-11-03', time, createdAt });

test('D1 POST preserves a freshly added punch and GET returns it', async () => {
  const { invoke } = createApi();
  const clock = item('att-in', 'clockIn', '09:00');
  const record = {
    id: 'rec-test', date: '2026-11-03',
    updatedAt: '2026-11-03T01:00:00.000Z',
    attendanceLogs: [clock]
  };
  const posted = await invoke('POST', record);
  assert.equal(posted.record.attendanceLogs.length, 1);
  const read = await invoke('GET', null, 'rec-test');
  assert.deepEqual(read.records[0].attendanceLogs, [clock]);
});

test('stale client cannot overwrite an edited punch, or drop a newer punch', async () => {
  const { invoke } = createApi();
  const inClock = item('att-in', 'clockIn', '09:15');
  const breakClock = item('att-break', 'breakStart', '11:30', '2026-11-03T02:30:00.000Z');

  await invoke('POST', {
    id: 'rec-test', date: '2026-11-03',
    updatedAt: new Date().toISOString(),
    attendanceLogs: [inClock, breakClock]
  });

  const old = await invoke('POST', {
    id: 'rec-test', date: '2026-11-03',
    updatedAt: '2026-10-20T00:00:00.000Z',
    attendanceLogs: [item('att-in', 'clockIn', '09:00')]
  });
  assert.equal(old.staleMerge, true);
  const stored = (await invoke('GET', null, 'rec-test')).records[0];
  assert.equal(stored.attendanceLogs.length, 2);
  assert.equal(stored.attendanceLogs.find(x => x.id === 'att-in').time, '09:15');
  assert.equal(stored.attendanceLogs.find(x => x.id === 'att-break').time, '11:30');
});
