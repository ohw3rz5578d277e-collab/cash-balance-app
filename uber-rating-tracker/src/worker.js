const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", ...corsHeaders }
  });
}

function html(body) {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=UTF-8", "Cache-Control": "no-store" }
  });
}

function text(body, type = "text/plain; charset=UTF-8") {
  return new Response(body, {
    headers: { "content-type": type, "Cache-Control": "no-store" }
  });
}

function uid() {
  return crypto.randomUUID();
}

const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="108" fill="#07090b"/><circle cx="256" cy="256" r="190" fill="none" stroke="#04d477" stroke-width="24"/><rect x="145" y="190" width="222" height="158" rx="38" fill="#028760"/><path d="M202 190c10-62 98-62 108 0" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round"/><text x="256" y="320" text-anchor="middle" font-size="108" font-family="Arial" font-weight="900" fill="#fff">👍</text><text x="256" y="420" text-anchor="middle" font-size="44" font-family="Arial" font-weight="900" fill="#fff">評価</text></svg>`;

async function setup(env) {
  if (!env.DB) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    status TEXT,
    seq INTEGER,
    store_name TEXT,
    area TEXT,
    memo TEXT,
    pickup_at INTEGER,
    completed_at INTEGER,
    pickup_lat REAL,
    pickup_lng REAL,
    dropoff_lat REAL,
    dropoff_lng REAL,
    pickup_display TEXT,
    dropoff_display TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    recorded_at INTEGER,
    total_good INTEGER,
    total_bad INTEGER,
    satisfaction INTEGER,
    delta_good INTEGER,
    delta_bad INTEGER,
    created_at INTEGER
  )`).run();
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
    const r = await fetch(url, { headers: { "User-Agent": "uber-rating-tracker/1.0" } });
    if (!r.ok) return null;
    const d = await r.json();
    const a = d.address || {};
    return {
      name: d.name || a.shop || a.amenity || a.restaurant || a.fast_food || a.convenience || a.building || a.road || "店舗候補なし",
      area: a.suburb || a.city_district || a.neighbourhood || a.city || a.town || a.village || "",
      display_name: d.display_name || ""
    };
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method === "GET" && url.pathname === "/") return html(page());
    if (request.method === "GET" && url.pathname === "/icon.svg") return text(appIcon, "image/svg+xml; charset=UTF-8");
    if (request.method === "GET" && url.pathname === "/manifest.json") {
      return json({
        name: "Uber Rating Tracker",
        short_name: "評価アプリ",
        start_url: "/",
        display: "standalone",
        background_color: "#080a0c",
        theme_color: "#028760",
        icons: [{ src: "/icon.svg?v=stable-buttons-v2", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      });
    }
    if (request.method === "GET" && url.pathname === "/sw.js") {
      return text("self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());", "application/javascript; charset=UTF-8");
    }
    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "uber-rating-tracker", build: "stable-buttons-v2", hasDb: !!env.DB, time: new Date().toISOString() });
    }
    if (url.pathname === "/api/reverse-geocode") {
      const lat = url.searchParams.get("lat");
      const lng = url.searchParams.get("lng");
      if (!lat || !lng) return json({ ok: false, error: "lat_lng_required" }, 400);
      return json({ ok: true, result: await reverseGeocode(lat, lng) });
    }

    if (!env.DB) return json({ ok: false, error: "DB_NOT_CONNECTED" }, 503);
    await setup(env);

    if (url.pathname === "/api/orders" && request.method === "GET") {
      const status = url.searchParams.get("status");
      let stmt;
      if (status) {
        stmt = env.DB.prepare("SELECT * FROM order_items WHERE status = ? ORDER BY created_at DESC LIMIT 200").bind(status);
      } else {
        stmt = env.DB.prepare("SELECT * FROM order_items ORDER BY created_at DESC LIMIT 200");
      }
      const rows = await stmt.all();
      return json({ ok: true, items: rows.results || [] });
    }

    if (url.pathname === "/api/orders" && request.method === "POST") {
      const body = await request.json();
      const now = Date.now();
      const id = body.id || uid();
      const row = await env.DB.prepare("SELECT COALESCE(MAX(seq),0)+1 AS n FROM order_items WHERE status='active'").first();
      const seq = Number(row?.n || 1);
      await env.DB.prepare(`INSERT INTO order_items
        (id,status,seq,store_name,area,memo,pickup_at,completed_at,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,pickup_display,dropoff_display,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id,
        "active",
        seq,
        String(body.store_name || ""),
        String(body.area || ""),
        String(body.memo || ""),
        body.pickup_at || now,
        null,
        body.pickup_lat ?? null,
        body.pickup_lng ?? null,
        null,
        null,
        String(body.pickup_display || ""),
        "",
        now,
        now
      ).run();
      return json({ ok: true, id, seq });
    }

    if (url.pathname.startsWith("/api/orders/") && request.method === "PUT") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const body = await request.json();
      const current = await env.DB.prepare("SELECT * FROM order_items WHERE id=?").bind(id).first();
      if (!current) return json({ ok: false, error: "not_found" }, 404);
      await env.DB.prepare(`UPDATE order_items SET
        status=?, store_name=?, area=?, memo=?, completed_at=?, dropoff_lat=?, dropoff_lng=?, dropoff_display=?, updated_at=?
        WHERE id=?`).bind(
        body.status ?? current.status,
        body.store_name ?? current.store_name,
        body.area ?? current.area,
        body.memo ?? current.memo,
        body.completed_at ?? current.completed_at,
        body.dropoff_lat ?? current.dropoff_lat,
        body.dropoff_lng ?? current.dropoff_lng,
        body.dropoff_display ?? current.dropoff_display,
        Date.now(),
        id
      ).run();
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/orders/") && request.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      await env.DB.prepare("DELETE FROM order_items WHERE id=?").bind(id).run();
      return json({ ok: true });
    }

    if (url.pathname === "/api/ratings" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM ratings ORDER BY recorded_at DESC LIMIT 100").all();
      return json({ ok: true, items: rows.results || [] });
    }

    if (url.pathname === "/api/ratings" && request.method === "POST") {
      const body = await request.json();
      const now = Date.now();
      const good = Number(body.total_good || 0);
      const bad = Number(body.total_bad || 0);
      const satisfaction = good + bad > 0 ? Math.round(good / (good + bad) * 100) : 0;
      const prev = await env.DB.prepare("SELECT total_good,total_bad FROM ratings ORDER BY recorded_at DESC LIMIT 1").first();
      const deltaGood = prev ? good - Number(prev.total_good || 0) : 0;
      const deltaBad = prev ? bad - Number(prev.total_bad || 0) : 0;
      const id = uid();
      await env.DB.prepare(`INSERT INTO ratings (id,recorded_at,total_good,total_bad,satisfaction,delta_good,delta_bad,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(id, now, good, bad, satisfaction, deltaGood, deltaBad, now).run();
      return json({ ok: true, id, satisfaction, delta_good: deltaGood, delta_bad: deltaBad });
    }

    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
};

function page() {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>評価アプリ</title>
<link rel="manifest" href="/manifest.json?v=stable-buttons-v2">
<link rel="icon" href="/icon.svg?v=stable-buttons-v2">
<link rel="apple-touch-icon" href="/icon.svg?v=stable-buttons-v2">
<meta name="theme-color" content="#028760">
<style>
:root{--bg:#080a0c;--card:#141820;--line:#2d3440;--green:#04b873;--green2:#028760;--red:#ff5d5d;--blue:#2b64ff;--muted:#9aa3b2;--orange:#ff9f43}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:radial-gradient(circle at top,#123326 0,#080a0c 38%);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;padding:12px 12px 94px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.title{font-size:20px;font-weight:950}.sync{font-size:12px;border:1px solid #245c45;background:#10261d;color:#69efa9;border-radius:999px;padding:7px 10px}
.card,.hero{background:rgba(20,24,32,.96);border:1px solid var(--line);border-radius:22px;padding:15px;margin-bottom:12px}.hero{border-color:#245c45;background:linear-gradient(160deg,#06291e,#141820 65%)}
.cap{color:var(--muted);font-size:12px;font-weight:800}.sat{font-size:58px;font-weight:950}.grid,.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box{background:rgba(255,255,255,.06);border-radius:18px;padding:13px}.num{font-size:30px;font-weight:950}.ok{color:#5be39a}.bad{color:var(--red)}
.big{width:100%;border:0;border-radius:24px;min-height:118px;padding:20px;text-align:left;color:#fff;font-size:25px;font-weight:950;box-shadow:0 10px 24px rgba(0,0,0,.28);margin-bottom:12px}.big small{display:block;font-size:13px;margin-top:8px;opacity:.85}.pickup{background:linear-gradient(135deg,#ffb03a,#e66f00)}.save{background:linear-gradient(135deg,var(--green),var(--green2))}.ocr{background:linear-gradient(135deg,var(--blue),#182a70)}
button{border:0;border-radius:15px;background:var(--green2);color:#fff;padding:13px;font-size:15px;font-weight:900;margin-top:8px}.danger{background:#633039}.secondary{background:#273142}
.order{border:1px solid #303848;background:#10151d;border-radius:18px;padding:13px;margin-top:10px}.orderTop{display:flex;justify-content:space-between;gap:10px}.badge{background:#243327;color:#6bf3aa;border:1px solid #245c45;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:900}.hint{font-size:13px;color:var(--muted);line-height:1.6}
.tabs{position:fixed;left:10px;right:10px;bottom:8px;background:rgba(8,10,12,.95);border:1px solid var(--line);border-radius:20px;padding:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.tab{border-radius:14px;background:#202631;padding:12px 4px;font-size:12px}.screen{display:none}.screen.active{display:block}
input{width:100%;background:#10151d;border:1px solid var(--line);border-radius:14px;color:#fff;font-size:16px;padding:13px;margin-top:9px}.toast{display:none;position:fixed;top:10px;left:12px;right:12px;background:#202631;border:1px solid var(--line);border-radius:16px;padding:13px;z-index:99}.toast.show{display:block}.file{display:none}
</style>
</head>
<body>
<div id="toast" class="toast"></div>
<div class="top"><div class="title">評価アプリ</div><div id="sync" class="sync">起動中</div></div>

<section id="home" class="screen active">
  <div class="hero"><div class="cap">今の満足度</div><div id="sat" class="sat">--%</div><div class="grid"><div class="box"><div class="cap">GOOD</div><div id="good" class="num ok">--</div></div><div class="box"><div class="cap">BAD</div><div id="bad" class="num bad">--</div></div></div></div>
  <button id="pickupBtn" class="big pickup" type="button">店舗ピックアップ追加<small>複数店舗OK / 押すと必ず反応します</small></button>
  <button id="ocrHome" class="big ocr" type="button">評価を読む<small>まずはボタン反応確認</small></button>
  <input id="homeFile" class="file" type="file" accept="image/*">
  <div class="card"><div class="cap">未配達リスト</div><div id="activeList"></div></div>
  <div class="card"><div class="cap">今日</div><div class="two"><div><div class="hint">未配達</div><div id="activeCount" class="num">0</div></div><div><div class="hint">完了</div><div id="doneCount" class="num">0</div></div></div></div>
</section>

<section id="ocr" class="screen"><div class="card"><div class="cap">OCR</div><button id="pickImage" class="ocr" type="button">スクショを選ぶ</button><input id="imageFile" class="file" type="file" accept="image/*"><div id="ocrBox" class="hint">OCRは次段階で再有効化します。</div></div><div class="card"><div class="cap">手動入力テスト</div><div class="two"><input id="manualGood" type="number" placeholder="GOOD"><input id="manualBad" type="number" placeholder="BAD"></div><button id="manualSave" type="button">保存</button></div></section>
<section id="orders" class="screen"><div class="card"><div class="cap">未配達</div><div id="activeList2"></div></div></section>
<section id="history" class="screen"><div class="card"><div class="cap">配達履歴</div><div id="doneList"></div></div><div class="card"><div class="cap">評価履歴</div><div id="ratingList"></div></div></section>
<div class="tabs"><button class="tab" data-tab="home" type="button">ホーム</button><button class="tab" data-tab="ocr" type="button">OCR</button><button class="tab" data-tab="orders" type="button">配達</button><button class="tab" data-tab="history" type="button">履歴</button></div>

<script>
var active = [];
var done = [];
var ratings = [];
function el(id){ return document.getElementById(id); }
function toast(message){ var t=el('toast'); t.textContent=message; t.classList.add('show'); setTimeout(function(){t.classList.remove('show');},2200); }
function fmt(time){ return new Date(Number(time)).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function esc(s){ return String(s || '').replace(/[&<>'"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]; }); }
function vibrate(){ try{ if(navigator.vibrate) navigator.vibrate([30]); }catch(e){} }
async function api(path, options){ var r = await fetch(path, options); if(!r.ok) throw new Error(String(r.status)); return await r.json(); }
async function loadData(){
  try{
    el('sync').textContent='DB同期中';
    active=(await api('/api/orders?status=active')).items || [];
    done=(await api('/api/orders?status=done')).items || [];
    ratings=(await api('/api/ratings')).items || [];
    el('sync').textContent='DB同期OK';
  }catch(e){
    el('sync').textContent='DB読込エラー';
    toast('DB読込エラー');
  }
  render();
}
function render(){
  var latest=ratings[0];
  if(latest){ el('sat').textContent=latest.satisfaction+'%'; el('good').textContent=latest.total_good; el('bad').textContent=latest.total_bad; }
  else { el('sat').textContent='--%'; el('good').textContent='--'; el('bad').textContent='--'; }
  el('activeCount').textContent=active.length;
  el('doneCount').textContent=done.length;
  var activeHtml=active.map(function(x){
    return '<div class="order"><div class="orderTop"><div><span class="badge">#'+x.seq+'</span> <b>'+esc(x.store_name||'店舗未入力')+'</b><div class="hint">'+fmt(x.pickup_at)+' '+esc(x.area||'')+'</div></div></div><button class="save" type="button" onclick="completeOrder(\''+x.id+'\')">この注文を配達完了</button><button class="secondary" type="button" onclick="editOrder(\''+x.id+'\',true)">編集</button><button class="danger" type="button" onclick="deleteOrder(\''+x.id+'\')">削除</button></div>';
  }).join('') || '<div class="hint">未配達はありません</div>';
  el('activeList').innerHTML=activeHtml;
  el('activeList2').innerHTML=activeHtml;
  el('doneList').innerHTML=done.map(function(x){ return '<div class="order"><span class="badge">完了</span> <b>'+esc(x.store_name||'店舗未入力')+'</b><div class="hint">'+fmt(x.completed_at)+' '+esc(x.area||'')+'</div><button class="secondary" type="button" onclick="editOrder(\''+x.id+'\',false)">編集</button><button class="danger" type="button" onclick="deleteOrder(\''+x.id+'\')">削除</button></div>'; }).join('') || '<div class="hint">履歴なし</div>';
  el('ratingList').innerHTML=ratings.map(function(x){ return '<div class="order"><b>👍 '+x.total_good+' / 👎 '+x.total_bad+'</b><div class="hint">'+fmt(x.recorded_at)+'</div></div>'; }).join('') || '<div class="hint">評価履歴なし</div>';
}
async function addPickup(){
  toast('店舗ピックアップ反応OK');
  vibrate();
  var store = prompt('店舗名を入力してください', '店舗未入力');
  if(store === null) return;
  try{
    await api('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store_name:store,area:'',memo:'手動テスト登録',pickup_at:Date.now()})});
    toast('ピックアップ追加しました');
    await loadData();
  }catch(e){ toast('追加エラー: '+e.message); }
}
async function completeOrder(id){
  toast('配達完了ボタン反応OK');
  vibrate();
  try{
    await api('/api/orders/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'done',completed_at:Date.now(),memo:'配達完了テスト'})});
    toast('配達完了しました');
    await loadData();
  }catch(e){ toast('完了エラー: '+e.message); }
}
async function editOrder(id,isActive){
  var list=isActive?active:done;
  var x=list.find(function(v){return v.id===id;});
  if(!x) return;
  var s=prompt('店舗名',x.store_name||''); if(s===null)return;
  var a=prompt('エリア',x.area||''); if(a===null)return;
  try{
    await api('/api/orders/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({store_name:s,area:a})});
    toast('編集しました');
    await loadData();
  }catch(e){ toast('編集エラー: '+e.message); }
}
async function deleteOrder(id){
  if(!confirm('削除しますか？')) return;
  try{ await api('/api/orders/'+encodeURIComponent(id),{method:'DELETE'}); toast('削除しました'); await loadData(); }
  catch(e){ toast('削除エラー: '+e.message); }
}
async function saveRatingManual(){
  var g=Number(el('manualGood').value || 0);
  var b=Number(el('manualBad').value || 0);
  if(g+b===0){ toast('数字を入力してください'); return; }
  try{ await api('/api/ratings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({total_good:g,total_bad:b})}); toast('評価を保存しました'); await loadData(); }
  catch(e){ toast('評価保存エラー: '+e.message); }
}
window.completeOrder=completeOrder;
window.editOrder=editOrder;
window.deleteOrder=deleteOrder;
function bindButtons(){
  el('pickupBtn').onclick=addPickup;
  el('ocrHome').onclick=function(){ toast('評価を読む反応OK'); document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');}); el('ocr').classList.add('active'); };
  el('pickImage').onclick=function(){ toast('スクショボタン反応OK'); };
  el('manualSave').onclick=saveRatingManual;
  document.querySelectorAll('.tab').forEach(function(btn){ btn.onclick=function(){ toast(btn.textContent+'反応OK'); document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');}); el(btn.dataset.tab).classList.add('active'); }; });
}
bindButtons();
loadData();
toast('ボタン準備OK');
</script>
</body>
</html>`;
}
