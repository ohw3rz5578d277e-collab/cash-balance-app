export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, build: 'no-js-debug-001', hasDb: !!env.DB, time: new Date().toISOString() }), {
        headers: { 'content-type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (url.pathname === '/debug-click') {
      const name = url.searchParams.get('name') || 'unknown';
      return page('CLICK OK: ' + name + ' / ' + new Date().toLocaleString('ja-JP'));
    }

    if (url.pathname === '/debug-api') {
      let dbStatus = 'DB未確認';
      try {
        if (!env.DB) {
          dbStatus = 'DB Bindingなし';
        } else {
          await env.DB.prepare('CREATE TABLE IF NOT EXISTS debug_clicks (id TEXT PRIMARY KEY, name TEXT, created_at INTEGER)').run();
          await env.DB.prepare('INSERT INTO debug_clicks (id,name,created_at) VALUES (?,?,?)').bind(crypto.randomUUID(), 'api-test', Date.now()).run();
          const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM debug_clicks').first();
          dbStatus = 'DB OK / count=' + row.count;
        }
      } catch (e) {
        dbStatus = 'DB ERROR: ' + e.message;
      }
      return page(dbStatus);
    }

    return page('NO-JS DIAGNOSTIC READY');
  }
};

function page(message) {
  const safe = String(message || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return new Response(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>評価アプリ NO-JS診断</title>
<style>
body{margin:0;background:#080a0c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:18px 18px 80px}
h1{font-size:38px;line-height:1.15;margin:30px 0}
.card{background:#141820;border:1px solid #2d3440;border-radius:22px;padding:18px;margin:18px 0;font-size:18px;line-height:1.6}
.log{background:#2a1114;border:1px solid #ff6b6b;color:#ffd2d2;border-radius:18px;padding:18px;margin:18px 0;font-size:16px;line-height:1.6;white-space:pre-wrap}
a.btn{display:block;text-decoration:none;color:#fff;border-radius:26px;padding:32px 22px;margin:18px 0;font-size:30px;font-weight:900}
.orange{background:linear-gradient(135deg,#ffb03a,#e66f00)}
.blue{background:linear-gradient(135deg,#2b64ff,#182a70)}
.green{background:linear-gradient(135deg,#04b873,#028760)}
.gray{background:#202631}
small{display:block;font-size:14px;margin-top:8px;opacity:.85}
</style>
</head>
<body>
<h1>評価アプリ<br>NO-JS診断</h1>
<div class="card">JavaScriptを使わない診断画面です。押すとページが切り替われば、タップ自体は正常です。</div>
<div class="log">${safe}</div>
<a class="btn orange" href="/debug-click?name=pickup&v=${Date.now()}">店舗ピックアップ追加<small>リンク型テスト</small></a>
<a class="btn blue" href="/debug-click?name=rating&v=${Date.now()}">評価を読む<small>リンク型テスト</small></a>
<a class="btn green" href="/debug-api?v=${Date.now()}">DB / API確認<small>D1にテスト書き込み</small></a>
<a class="btn gray" href="/?v=${Date.now()}">再読み込み<small>キャッシュ回避</small></a>
</body>
</html>`, { headers: { 'content-type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
