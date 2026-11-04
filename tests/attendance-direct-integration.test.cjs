'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'attendance-history.js'), 'utf8')
  .replace(/\}\)\(\);\s*$/, 'window.__directTest={loadHistory, getDirect:()=>directCloud, getCloud:()=>cloudRecords};})();');
const today = new Date();
const day = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
const punch = { id: 'att-1125', type: 'clockIn', date: day, time: '11:25', createdAt: new Date().toISOString() };
const local = { id: 'rec-device', date: day, updatedAt: new Date().toISOString(), attendanceLogs: [punch] };
const cloud = { ...local, attendanceLogs: [punch] };

function create({ range = [], exact = null, tombstone = false } = {}) {
  const storage = new Map([
    ['cash_balance_app_pin_v21', 'not-a-production-pin'],
    ['cash_balance_app_draft_v21', JSON.stringify({ state: local })]
  ]);
  const events = [], requests = [], retried = [], scheduled = [];
  const list = { innerHTML: '', querySelectorAll() { return []; } };
  const header = { textContent: '' };
  const cloudLabel = { textContent: '' };
  const older = { disabled: false, textContent: '' };
  const resend = { style: { display: 'none' }, onclick: null };
  const refresh = { onclick: null };
  const wrap = { querySelector(key) {
    return { '#attAllHistoryList': list, '#attAllHistoryStatus': header,
      '#attCloudCheckStatus': cloudLabel, '#attAllHistoryOlder': older,
      '#attAllHistoryResend': resend, '#attAllHistoryRefresh': refresh }[key] || null;
  }};
  const base = { style: {} };
  const notice = { style: {}, textContent: '' };
  const view = { classList: { contains() { return true; } } };
  const window = {
    __cashSaveGuardInstalled: true,
    __cashRetryAttendanceUpload(id) { retried.push(id); return true; },
    dispatchEvent(event) { events.push(event); return true; },
    addEventListener() {}
  };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    getElementById(key) { return {
      attHistoryAllStyle: {}, 'view-attendance': view,
      attendanceLogList: base, attendanceAllHistory: wrap,
      attHistoryToast: notice
    }[key] || null; }
  };
  const response = exact && tombstone ? { ...exact, attendanceLogs: [], attendanceDeletedIds: [punch.id] } : exact;
  const fetch = async (url) => {
    requests.push(String(url));
    const records = String(url).includes('?id=') ? (response ? [response] : []) : range;
    return { ok: true, async json() { return { ok: true, records }; } };
  };
  const sandbox = { window, document, localStorage: {
    getItem(k) { return storage.get(k) || null; },
    setItem(k,v) { storage.set(k, String(v)); }
  }, fetch, CustomEvent: function(type, options) { this.type=type;this.detail=options.detail; },
  clearTimeout() {}, setTimeout(fn, ms) { scheduled.push(ms); return scheduled.length; },
  confirm() { return true; }, Date, JSON };
  vm.runInNewContext(source, sandbox, { filename: 'attendance-history.js' });
  return { api: window.__directTest, list, cloudLabel, resend, requests, retried, events, storage, scheduled };
}

test('empty date-range list but exact matching D1 record renders cloud punch and hides resend', async () => {
  const h = create({ range: [], exact: cloud });
  await h.api.loadHistory(true);
  assert.equal(h.requests.length, 2);
  assert.match(h.requests[0], /start=/);
  assert.match(h.requests[1], /\?id=rec-device/);
  assert.match(h.cloudLabel.textContent, /クラウド勤怠：1件/);
  assert.match(h.cloudLabel.textContent, /記録IDを直接照合済み/);
  assert.equal(h.resend.style.display, 'none');
  assert.match(h.list.innerHTML, /11:25/);
});

test('both D1 reads missing the local punch expose a guarded recovery button', async () => {
  const h = create({ range: [], exact: null });
  await h.api.loadHistory(true);
  assert.match(h.cloudLabel.textContent, /この端末の打刻1件がクラウドで未確認/);
  assert.equal(h.resend.style.display, 'block');
  h.resend.onclick();
  assert.deepEqual(h.retried, ['rec-device']);
  assert.ok(h.events.some(e => e.type === 'cash-attendance-cloud-check' && e.detail.logs.length === 0));
});

test('server-side tombstone prevents a deleted punch from being resurrected', async () => {
  const h = create({ range: [], exact: cloud, tombstone: true });
  await h.api.loadHistory(true);
  assert.match(h.cloudLabel.textContent, /削除済み/);
  assert.equal(h.resend.style.display, 'none');
});
