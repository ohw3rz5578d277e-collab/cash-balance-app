'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the shipped browser bundle without loading any production data.
const source = fs.readFileSync(path.join(__dirname, '..', 'attendance-core.js'), 'utf8');
const exposed = source.replace(/\}\)\(\);\s*$/, 'window.__attendanceTestApi = {canPunch, validNext, localParts};})();');
assert.notEqual(exposed, source, 'attendance bundle must expose the test seam');

const windowStub = { addEventListener() {} };
const sandbox = {
  window: windowStub,
  document: { addEventListener() {} },
  navigator: { onLine: true },
  localStorage: { getItem() { return ''; } }
};
vm.runInNewContext(exposed, sandbox, { filename: 'attendance-core.js' });
const { canPunch, validNext, localParts } = windowStub.__attendanceTestApi;
const today = localParts().date;
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const prevDay = localParts(yesterday).date;
const twoDaysAgo = new Date();
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
const olderDay = localParts(twoDaysAgo).date;

const punch = (date, type, time = '23:50') => ({
  id: 'att-test',
  type,
  date,
  time,
  createdAt: new Date().toISOString()
});

test('only the selected, saved, current-day record can start a new punch', () => {
  assert.equal(canPunch({ id: 'r1', date: today, attendanceLogs: [] }, 'clockIn', today), true);
  assert.equal(canPunch({ id: '', date: today, attendanceLogs: [] }, 'clockIn', today), false);
  assert.equal(canPunch(null, 'clockIn', today), false);
  assert.equal(canPunch({ id: 'r1', date: prevDay, attendanceLogs: [] }, 'clockIn', today), false);
});

test('previous-day open shift can safely clock out after midnight', () => {
  const record = { id: 'r1', date: prevDay, attendanceLogs: [punch(prevDay, 'clockIn')] };
  assert.equal(canPunch(record, 'clockOut', today), true);
  assert.equal(validNext(record, 'clockOut'), true);
});

test('already closed previous-day shift cannot clock out twice', () => {
  const record = { id: 'r1', date: prevDay, attendanceLogs: [punch(prevDay, 'clockOut')] };
  assert.equal(canPunch(record, 'clockOut', today), false);
});

test('old records cannot receive unrelated punches', () => {
  const record = { id: 'r1', date: olderDay, attendanceLogs: [punch(olderDay, 'clockIn')] };
  assert.equal(canPunch(record, 'clockOut', today), false);
  assert.equal(canPunch(record, 'breakStart', today), false);
});

test('existing same-day break and resume eligibility is preserved', () => {
  const work = { id: 'r1', date: today, attendanceLogs: [punch(today, 'clockIn', '09:00')] };
  const rest = { id: 'r1', date: today, attendanceLogs: [punch(today, 'breakStart', '12:00')] };
  assert.equal(validNext(work, 'breakStart'), true);
  assert.equal(validNext(rest, 'breakEnd'), true);
});
