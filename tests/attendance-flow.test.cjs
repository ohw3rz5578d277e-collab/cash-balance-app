'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = fs.readFileSync(path.join(__dirname, '..', 'attendance-core.js'), 'utf8');
const history = fs.readFileSync(path.join(__dirname, '..', 'attendance-history.js'), 'utf8');
const expose = (source, trailer) => {
  const exposed = source.replace(/\}\)\(\);\s*$/, trailer);
  assert.notEqual(exposed, source, 'browser bundle trailer should be found');
  return exposed;
};

function harness() {
  const saved = new Map();
  const events = [];
  const syncIndicator = { textContent: '', style: {} };
  const list = { innerHTML: '', querySelectorAll() { return []; } };
  const base = { style: {} };
  const status = { textContent: '' };
  const cloudStatus = { textContent: '' };
  const older = { disabled: false, textContent: '' };
  const wrap = {
    querySelector(selector) {
      return { '#attAllHistoryList': list, '#attAllHistoryStatus': status, '#attCloudCheckStatus': cloudStatus, '#attAllHistoryOlder': older }[selector] || null;
    }
  };
  const toast = { textContent: '', style: {} };
  const handlers = new Map();
  const window = {
    addEventListener(type, fn) { handlers.set(type, [...(handlers.get(type) || []), fn]); },
    dispatchEvent(event) { events.push(event); for (const fn of handlers.get(event.type) || []) fn(event); return true; }
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    querySelectorAll(query) { return query === '.att-sync' ? [syncIndicator] : []; },
    getElementById(id) {
      return {
        attToast: toast,
        attHistoryAllStyle: {},
        'view-attendance': { classList: { contains() { return true; } } },
        attendanceLogList: base,
        attendanceAllHistory: wrap
      }[id] || null;
    }
  };
  const localStorage = {
    getItem(k) { return saved.get(k) || null; },
    setItem(k, value) { saved.set(k, String(value)); }
  };
  const sandbox = {
    window,
    document,
    localStorage,
    navigator: { onLine: true },
    setTimeout: () => 0,
    clearTimeout() {},
    CustomEvent: function CustomEvent(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  };

  const exposedCore = expose(core,
    'window.__attendanceFlowCore = {add, localParts, syncD1, setRemote(id, logs){remoteAttendanceByRecord[id] = logs}}; render=function(){};})();');
  vm.runInNewContext(exposedCore, sandbox, { filename: 'attendance-core.js' });
  const exposedHistory = expose(history,
    'window.__attendanceFlowHistory = {render, setRecords(rows){records=rows}, setCloudRecords(rows){cloudRecords=rows;cloudCheckedAt=Date.now();cloudError=\'\'}};})();');
  vm.runInNewContext(exposedHistory, sandbox, { filename: 'attendance-history.js' });

  return { saved, events, window, localStorage, list, cloudStatus, syncIndicator, core: window.__attendanceFlowCore, history: window.__attendanceFlowHistory };
}

test('one-tap punch is stored and immediately shown before cloud upload', () => {
  const h = harness();
  const day = h.core.localParts().date;
  h.saved.set('cash_balance_app_draft_v21', JSON.stringify({
    state: { id: 'rec-test', date: day, updatedAt: '2026-10-01T00:00:00Z', attendanceLogs: [] }
  }));

  assert.equal(h.core.add('clockIn'), true);
  assert.equal(h.events.filter(e => e.type === 'cash-attendance-saved').length, 1);
  const state = JSON.parse(h.saved.get('cash_balance_app_draft_v21')).state;
  assert.equal(state.attendanceLogs.length, 1);
  assert.equal(state.attendanceLogs[0].type, 'clockIn');

  h.history.render();
  assert.match(h.list.innerHTML, /出勤/);
  assert.match(h.list.innerHTML, /<details class="att-all-day"[^>]* open>/);

  // A stale cloud read must not hide the punch stored on this device.
  h.history.setRecords([{ id: state.id, date: day, updatedAt: '2026-10-01T00:00:00Z', attendanceLogs: [] }]);
  h.history.render();
  assert.match(h.list.innerHTML, /出勤/);
});

test('zero punches are never reported as cloud-confirmed', async () => {
  const h = harness();
  const day = h.core.localParts().date;
  h.saved.set('cash_balance_app_draft_v21', JSON.stringify({
    state: { id: 'rec-test', date: day, updatedAt: new Date().toISOString(), attendanceLogs: [] }
  }));
  h.core.setRemote('rec-test', []);
  assert.equal(await h.core.syncD1(), false);
  assert.equal(h.syncIndicator.textContent, '打刻未登録');
});

test('cloud confirmation requires the same punch ID, type, day and time', async () => {
  const h = harness();
  const day = h.core.localParts().date;
  const log = { id: 'att-test', type: 'clockIn', date: day, time: '09:20' };
  h.saved.set('cash_balance_app_draft_v21', JSON.stringify({
    state: { id: 'rec-test', date: day, updatedAt: new Date().toISOString(), attendanceLogs: [log] }
  }));

  assert.equal(await h.core.syncD1(), false);
  assert.equal(h.syncIndicator.textContent, '端末保存済み・クラウド確認待ち');

  h.core.setRemote('rec-test', [{ ...log, time: '09:21' }]);
  assert.equal(await h.core.syncD1(), false);
  assert.equal(h.syncIndicator.textContent, '端末保存済み・クラウド確認待ち');

  h.core.setRemote('rec-test', [log]);
  assert.equal(await h.core.syncD1(), true);
  assert.equal(h.syncIndicator.textContent, 'クラウドで打刻確認済み');
});

test('cloud and device punch totals remain independently visible even when D1 is empty', () => {
  const h = harness();
  const day = h.core.localParts().date;
  h.saved.set('cash_balance_app_draft_v21', JSON.stringify({
    state: { id: 'rec-local', date: day, updatedAt: new Date().toISOString(),
      attendanceLogs: [{ id: 'att-local', type: 'clockIn', date: day, time: '09:20', createdAt: new Date().toISOString() }] }
  }));
  h.history.setCloudRecords([]);
  h.history.render();
  assert.match(h.cloudStatus.textContent, /クラウド勤怠：0件/);
  assert.match(h.cloudStatus.textContent, /この端末：1件/);
  assert.match(h.cloudStatus.textContent, /クラウド未確認/);
  h.history.setCloudRecords([{ id: 'rec-local', date: day, attendanceLogs: [{ id: 'att-local', type: 'clockIn', date: day, time: '09:20' }] }]);
  h.history.render();
  assert.match(h.cloudStatus.textContent, /クラウド勤怠：1件/);
});

test('outbox failure after local save is never reported as cloud-ready', () => {
  const h = harness();
  h.window.__cashSaveGuardInstalled = true;
  const day = h.core.localParts().date;
  h.saved.set('cash_balance_app_draft_v21', JSON.stringify({
    state: { id: 'rec-test', date: day, attendanceLogs: [] }
  }));
  assert.equal(h.core.add('clockIn'), false);
  const local = JSON.parse(h.saved.get('cash_balance_app_draft_v21')).state;
  assert.equal(local.attendanceLogs.length, 1, 'the local punch must remain recoverable');
  assert.match(h.syncIndicator.textContent, /クラウド送信準備に失敗/);
  assert.ok(h.events.some(e => e.type === 'cash-attendance-saved'));
});

test('a matching durable outbox entry permits normal punch confirmation pending cloud', () => {
  const h = harness();
  h.window.__cashSaveGuardInstalled = true;
  const original = h.localStorage.setItem.bind(h.localStorage);
  h.localStorage.setItem = (key, value) => {
    original(key, value);
    if (key !== 'cash_balance_app_draft_v21') return;
    const state = JSON.parse(value).state;
    original('cash_balance_app_save_outbox_v1', JSON.stringify({
      [state.id]: { record: state, queuedAt: new Date().toISOString() }
    }));
  };
  const day = h.core.localParts().date;
  h.saved.set('cash_balance_app_draft_v21', JSON.stringify({
    state: { id: 'rec-test', date: day, attendanceLogs: [] }
  }));
  assert.equal(h.core.add('clockIn'), true);
  assert.match(h.syncIndicator.textContent, /クラウド同期待ち/);
  assert.equal(JSON.parse(h.saved.get('cash_balance_app_save_outbox_v1'))['rec-test'].record.attendanceLogs.length, 1);
});

test('a direct empty D1 record lookup clears an earlier false cloud-confirmed badge', async () => {
  const h = harness();
  const day = h.core.localParts().date;
  const log = { id: 'att-one', type: 'clockIn', date: day, time: '11:25' };
  h.saved.set('cash_balance_app_draft_v21', JSON.stringify({
    state: { id: 'rec-current', date: day, updatedAt: new Date().toISOString(), attendanceLogs: [log] }
  }));
  h.core.setRemote('rec-current', [log]);
  assert.equal(await h.core.syncD1(), true);
  assert.equal(h.syncIndicator.textContent, 'クラウドで打刻確認済み');
  h.window.dispatchEvent({ type: 'cash-attendance-cloud-check',
    detail: { recordId: 'rec-current', logs: [], checkedAt: Date.now() } });
  assert.equal(h.syncIndicator.textContent, '端末保存済み・クラウド確認待ち');
  assert.equal(await h.core.syncD1(), false);
});

test('direct cloud result for a different record must not change the badge', async () => {
  const h = harness();
  const day = h.core.localParts().date;
  const log = { id: 'att-one', type: 'clockIn', date: day, time: '11:25' };
  h.saved.set('cash_balance_app_draft_v21', JSON.stringify({
    state: { id: 'rec-current', date: day, updatedAt: new Date().toISOString(), attendanceLogs: [log] }
  }));
  h.core.setRemote('rec-current', [log]);
  assert.equal(await h.core.syncD1(), true);
  h.window.dispatchEvent({ type: 'cash-attendance-cloud-check',
    detail: { recordId: 'rec-another', logs: [], checkedAt: Date.now() } });
  assert.equal(h.syncIndicator.textContent, 'クラウドで打刻確認済み');
});
