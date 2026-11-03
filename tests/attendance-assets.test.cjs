'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8');

function scriptFrom(source, startTag, endTag) {
  const from = source.indexOf(startTag);
  assert.ok(from >= 0, 'expected script start tag');
  const to = source.indexOf(endTag, from + startTag.length);
  assert.ok(to > from, 'expected script end tag');
  return source.slice(from + startTag.length, to);
}

test('the complete legacy inline app remains valid JavaScript', () => {
  const html = read('index.html');
  const script = scriptFrom(html, '<script>', '</script>');
  assert.doesNotThrow(() => new vm.Script(script, { filename: 'index.html inline runtime' }));
});

test('both Cloudflare-injected inline runtimes remain valid JavaScript', () => {
  for (const file of ['functions/index.js', 'functions/_middleware.js']) {
    const script = scriptFrom(read(file), '<script>\n', '\n</script>`;');
    assert.doesNotThrow(() => new vm.Script(script, { filename: file + ' injected runtime' }));
  }
});

test('every HTML delivery path loads the same versioned attendance bundle', () => {
  const loader = read('attendance.js');
  const match = loader.match(/var v='([^']+)'/);
  assert.ok(match, 'attendance.js should define a cache version');
  const version = match[1];
  for (const file of ['index.html', 'functions/index.js']) {
    assert.ok(read(file).includes('/attendance.js?v=' + version),
      file + ' should use attendance.js version ' + version);
  }
  for (const name of ['attendance-core.js', 'attendance-history.js', 'history-manager.js']) {
    assert.ok(loader.includes('/' + name + '?v='+ "'+v"),
      name + ' should be loaded with the same cache-busting version');
    assert.ok(fs.existsSync(path.join(repo, name)), name + ' must exist');
  }
});

test('attendance scripts are not duplicated by the static and injected loaders', () => {
  const loader = read('attendance.js');
  assert.match(loader, /__cashAttendanceBundleLoaded/);
  const history = read('attendance-history.js');
  assert.match(history, /__cashAttendanceHistoryLoaded/);
});
