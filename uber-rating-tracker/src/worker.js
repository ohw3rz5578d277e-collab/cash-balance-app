export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true, build: 'debug-simple-001', hasDb: !!env.DB, time: new Date().toISOString() }), {
        headers: { 'content-type': 'application/json; charset=UTF-8', 'Access-Control-Allow-Origin': '*' }
      });
    }
    return new Response(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>評価アプリ診断</title>
<style>
body{margin:0;background:#080a0c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:16px 16px 140px}
.btn{width:100%;border:0;border-radius:24px;padding:30px 18px;margin:14px 0;color:#fff;font-size:28px;font-weight:900;text-align:left}
.orange{background:linear-gradient(135deg,#ffb03a,#e66f00)}
.blue{background:linear-gradient(135deg,#2b64ff,#182a70)}
.green{background:linear-gradient(135deg,#04b873,#028760)}
.card{background:#141820;border:1px solid #2d3440;border-radius:18px;padding:14px;margin:12px 0}
.log{position:fixed;left:8px;right:8px;bottom:8px;height:110px;overflow:auto;background:#2a1114;border:1px solid #ff6b6b;border-radius:14px;padding:8px;color:#ffd2d2;font-size:12px;white-space:pre-wrap;z-index:999}
</style>
</head>
<body>
<h1>評価アプリ 診断版</h1>
<div class="card">この画面はボタン反応確認用です。押すと下の赤い診断ログに表示されます。</div>
<button class="btn orange" onclick="testButton('店舗ピックアップ追加')">店舗ピックアップ追加</button>
<button class="btn blue" onclick="testButton('評価を読む')">評価を読む</button>
<button class="btn green" onclick="testApi()">API確認</button>
<div class="card" id="result">結果：まだ押していません</div>
<div class="log" id="log">LOG START</div>
<script>
function log(m){var e=document.getElementById('log');e.textContent='['+new Date().toLocaleTimeString()+'] '+m+'\n'+e.textContent;document.getElementById('result').textContent='結果：'+m;}
function testButton(name){log('CLICK '+name);alert(name+' 反応OK');}
async function testApi(){log('API CHECK START');try{var r=await fetch('/api/health');var t=await r.text();log('API OK '+t);}catch(e){log('API ERROR '+e.message);}}
window.addEventListener('error',function(e){log('JS ERROR '+e.message)});
log('SCRIPT LOADED');
</script>
</body>
</html>`, { headers: { 'content-type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });
  }
};
