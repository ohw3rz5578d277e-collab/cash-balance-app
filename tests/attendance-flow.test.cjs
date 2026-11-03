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
  const older = { disabled: false, textContent: '' };
  const wrap = {
    querySelector(selector) {
      return { '#attAllHistoryList': list, '#attAllHistoryStatus': status, '#attAllHistoryOlder': older }[selector] || null;
    }
  };
  const toast = { textContent: '', style: {} };
  const window = {
    addEventListener() {},
    dispatchEvent(event) { events.push(event); return true; }
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
    'window.__attendanceFlowHistory = {render, setRecords(rows){records=rows}};})();');
  vm.runInNewContext(exposedHistory, sandbox, { filename: 'attendance-history.js' });

  return { saved, events, list, syncIndicator, core: window.__attendanceFlowCore, history: window.__attendanceFlowHistory };
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
