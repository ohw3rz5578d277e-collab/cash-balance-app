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
          return existing ? { work_date: existing.work_date, created_at: existing.created_at, updated_at: existing.updated_at, payload: existing.payload } : null;
        },
        async all() {
          const record = rows.get(String(bound[0]));
          return { results: record ? [record] : [] };
        },
        async run() {
          if (sql.includes('INSERT INTO cash_records')) {
            const [id, workDate, payload, createdAt, updatedAt] = bound;
            if (rows.has(String(id))) return { meta: { changes: 0 } };
            rows.set(String(id), { id, work_date: workDate, payload, created_at: createdAt, updated_at: updatedAt });
          } else if (sql.includes('UPDATE cash_records')) {
            const [workDate, payload, updatedAt, id, oldDate, oldTime, oldPayload] = bound;
            const previous = rows.get(String(id));
            if (!previous || previous.work_date !== oldDate || previous.updated_at !== oldTime ||
              previous.payload !== oldPayload) return { meta: { changes: 0 } };
            rows.set(String(id), { ...previous, work_date: workDate, payload, updated_at: updatedAt });
          } else {
            throw new Error('unexpected D1 write');
          }
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  const win = {};
  vm.runInNewContext(source, { window: win, Request, Response, URL }, { filename: 'functions/api/records.js' });
  const invoke = async (method, record, id = record && record.id, posOnly = false, status = 200) => {
    const url = 'https://example.test/api/records' + (method === 'GET' ? '?id=' + encodeURIComponent(id) : '');
    const request = new Request(url, {
      method,
      headers: { 'x-app-pin': 'test-pin', 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify({ record, posOnly }) } : {})
    });
    const response = await win.__attendanceApiTest({ request, env: { DB, APP_PIN: 'test-pin' } });
    assert.equal(response.status, status);
    const data = await response.json();
    assert.equal(data.ok, status === 200);
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

test('a new device saving financial fields cannot wipe punches it did not load', async () => {
  const { invoke } = createApi();
  const a = item('att-in', 'clockIn', '09:00');
  await invoke('POST', {
    id: 'rec-test', date: '2026-11-03', updatedAt: '2026-11-03T01:00:00.000Z',
    attendanceLogs: [a], dailySales: 1000
  });
  const b = await invoke('POST', {
    id: 'rec-test', date: '2026-11-03', updatedAt: '2099-11-03T01:00:00.000Z',
    attendanceLogs: [], dailySales: 1200
  });
  assert.equal(b.record.dailySales, 1200);
  assert.equal(b.record.attendanceLogs.length, 1, 'the already saved punch must remain in D1');
  assert.equal(b.record.attendanceLogs[0].id, 'att-in');
});

test('explicit punch deletion is persisted by tombstone across devices', async () => {
  const { invoke } = createApi();
  const a = item('att-in', 'clockIn', '09:00');
  await invoke('POST', { id: 'rec-test', date: '2026-11-03', updatedAt: '2026-11-03T01:00:00.000Z', attendanceLogs: [a] });
  const deleted = await invoke('POST', { id: 'rec-test', date: '2026-11-03', updatedAt: '2099-11-03T01:00:00.000Z', attendanceLogs: [], attendanceDeletedIds: ['att-in'] });
  assert.equal(deleted.record.attendanceLogs.length, 0);
  assert.deepEqual(deleted.record.attendanceDeletedIds, ['att-in']);
  const stale = await invoke('POST', { id: 'rec-test', date: '2026-11-03', updatedAt: '2026-10-01T01:00:00.000Z', attendanceLogs: [a] });
  assert.equal(stale.record.attendanceLogs.length, 0, 'a stale device may not resurrect a deleted punch');
});

test('simultaneous POS-only additions preserve each other, existing legacy POS and non-POS fields', async () => {
  const {invoke} = createApi();
  const record = {id:'rec-shared',date:'2026-11-18',dailySales:1200,memo:'keep'};
  const legacy = {sale:550,paid:1000,change:450,time:'09:00'};
  const a = {id:'pos-A',sale:300,paid:300};
  const b = {id:'pos-B',sale:600,paid:600};
  await invoke('POST',{...record,posItems:[legacy]});
  await Promise.all([a,b].map(row=>invoke('POST',{
    id:record.id,date:record.date,posItems:[row],dailySales:0,memo:'overwrite'
  },record.id,true)));
  const saved=(await invoke('GET',null,record.id)).records[0];
  assert.equal(saved.dailySales,1200);
  assert.equal(saved.memo,'keep');
  assert.deepEqual(saved.posItems,[a,b,legacy]);
  await invoke('POST',{...record,posItems:[]},record.id);
  const after=(await invoke('GET',null,record.id)).records[0];
  assert.deepEqual(after.posItems,saved.posItems,'a stale client omitting POS cannot erase any line');
});

test('POS-only deletion is explicit and a stale retry cannot resurrect the removed line', async () => {
  const {invoke} = createApi();
  const item={id:'sold-1',sale:300,paid:300};
  const record={id:'rec-1',date:'2026-11-18',posItems:[item]};
  await invoke('POST',record);
  const deleted=await invoke('POST',{id:record.id,date:record.date,posDeletedKeys:['id:sold-1']},record.id,true);
  assert.deepEqual(deleted.record.posItems,[]);
  await invoke('POST',record);
  const saved=(await invoke('GET',null,record.id)).records[0];
  assert.deepEqual(saved.posItems,[]);
  assert.deepEqual(saved.posDeletedKeys,['id:sold-1']);
  await invoke('POST',{...record,date:'2026-11-17'},record.id,true,404);
});
