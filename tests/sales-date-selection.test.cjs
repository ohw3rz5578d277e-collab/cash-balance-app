'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('var salesDateRequest=');
const end = html.indexOf("window.addEventListener('cash-attendance-saved'", start);
assert.ok(start > 0 && end > start);
const source = html.slice(start, end);
const today = '2026-11-15';
const yesterday = '2026-11-14';
const older = '2026-10-01';

function record(date, id, dailySales, salesMemo = '') {
  return {date, id, dailySales, salesMemo, posItems: [{id: 'pos-' + id}], attendanceLogs: [{id: 'punch-' + id}]};
}

function harness({rows = [], pending = {}, response = async () => ({records: []})} = {}) {
  const visits = [];
  const saves = [];
  const nodes = {
    'view-sales': {classList: {contains: () => true, toggle() {}}},
    cashSalesDateStatus: {},
    cashSalesDateRetry: {},
  };
  const original = record(today, 'today', 12480, 'today memo');
  const scope = {
    window: {__cashSaveGuardInstalled: true}, API: '/api/records',
    state: original, pos: {}, records: rows.slice(), dirty: false, saving: false, autoTimer: 1,
    E: {salesDateMirror: {}, dailySales: {}, salesMemo: {}},
    byId: id => nodes[id],
    api(url) {visits.push(url);return response(url);},
    localStorage: {getItem: () => JSON.stringify(Object.fromEntries(
      Object.entries(pending).map(([key, value]) => [key, {record: value}])
    ))},
    clone: value => structuredClone(value), normalize: value => structuredClone(value), money: Number,
    sortUpdated: (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    currentRecordPending: id => id in pending,
    clearTimeout() {},
    emptyState: () => ({id: '', dailySales: 0, salesMemo: '', posItems: [], attendanceLogs: []}),
    fillForm() {scope.E.dailySales.value = scope.state.dailySales || '';scope.E.salesMemo.value = scope.state.salesMemo;},
    saveDraft(readOnly) {saves.push(readOnly);},
    render() {},
  };
  vm.createContext(scope);
  vm.runInContext(source, scope);
  return {scope, original, visits, saves, nodes};
}

test('loads a cached date and prefers its pending edits without posting or changing the old record', async () => {
  const cached = record(yesterday, 'yesterday', 9000, 'cloud');
  const local = {...cached, dailySales: 9500, salesMemo: 'pending'};
  const h = harness({rows: [cached], pending: {yesterday: local}});
  await h.scope.selectSalesDate(yesterday);
  assert.deepEqual(h.scope.state, local);
  assert.equal(h.original.date, today);
  assert.deepEqual(h.saves, [true]);
  assert.deepEqual(h.visits, []);
  assert.equal(h.scope.E.dailySales.disabled, false);
});

test('an uncached date uses the exact date range and a confirmed empty date starts a blank record', async () => {
  const h = harness();
  await h.scope.selectSalesDate(older);
  assert.deepEqual(h.visits, ['/api/records?start=2026-10-01&end=2026-10-01&limit=1000']);
  assert.equal(h.scope.state.date, older);
  assert.equal(h.scope.state.id, '');
  assert.equal(h.scope.state.posItems.length, 0);
  assert.equal(h.scope.state.attendanceLogs.length, 0);
  assert.equal(h.scope.E.dailySales.value, '');
  assert.deepEqual(h.saves, [true]);
});

test('a superseded date response does not replace the latest selected date', async () => {
  const replies = new Map();
  const h = harness({response: url => new Promise(resolve => replies.set(url, resolve))});
  const first = h.scope.selectSalesDate(older);
  const second = h.scope.selectSalesDate(yesterday);
  replies.get(h.visits[1])({records: [record(yesterday, 'yesterday', 6000)]});
  await second;
  replies.get(h.visits[0])({records: [record(older, 'older', 5500)]});
  await first;
  assert.equal(h.scope.state.date, yesterday);
  assert.equal(h.scope.E.dailySales.value, 6000);
  assert.deepEqual(h.saves, [true]);
});

test('a failed read leaves the old record alone, blocks sales inputs and makes retry available', async () => {
  const h = harness({response: async () => {throw new Error('network');}});
  await h.scope.selectSalesDate(older);
  assert.equal(h.scope.state, h.original);
  assert.equal(h.scope.E.dailySales.disabled, true);
  assert.equal(h.scope.E.salesMemo.disabled, true);
  assert.equal(h.nodes.cashSalesDateRetry.hidden, false);
  assert.deepEqual(h.saves, []);
});
