const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      ...corsHeaders
    }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=UTF-8" }
  });
}

function text(body, contentType = "text/plain; charset=UTF-8") {
  return new Response(body, { headers: { "content-type": contentType } });
}

function uid() {
  return crypto.randomUUID();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method === "GET" && url.pathname === "/") return html(htmlPage(env.APP_NAME || "Uber Rating Tracker"));
    if (request.method === "GET" && url.pathname === "/manifest.json") return json(manifestJson());
    if (request.method === "GET" && url.pathname === "/sw.js") return text(serviceWorkerJs(), "application/javascript; charset=UTF-8");

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "uber-rating-tracker", time: new Date().toISOString(), hasDb: !!env.DB });
    }

    if (url.pathname === "/api/ratings" && request.method === "GET") {
      const rows = await env.DB.prepare(`
        SELECT * FROM rating_snapshots
        ORDER BY recorded_at DESC
        LIMIT 100
      `).all();
      return json({ ok: true, items: rows.results || [] });
    }

    if (url.pathname === "/api/ratings" && request.method === "POST") {
      const body = await request.json();
      const now = Date.now();
      const totalGood = Number(body.total_good || 0);
      const totalBad = Number(body.total_bad || 0);
      const satisfaction = totalGood + totalBad > 0 ? Math.round((totalGood / (totalGood + totalBad)) * 100) : Number(body.satisfaction || 0);

      const prev = await env.DB.prepare(`
        SELECT total_good, total_bad FROM rating_snapshots
        ORDER BY recorded_at DESC
        LIMIT 1
      `).first();

      const deltaGood = prev ? totalGood - Number(prev.total_good || 0) : 0;
      const deltaBad = prev ? totalBad - Number(prev.total_bad || 0) : 0;

      await env.DB.prepare(`
        INSERT INTO rating_snapshots (
          id, recorded_at, satisfaction,
          merchant_good, merchant_bad, customer_good, customer_bad,
          total_good, total_bad, delta_good, delta_bad,
          source_device, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        uid(), body.recorded_at || now, satisfaction,
        Number(body.merchant_good || 0), Number(body.merchant_bad || 0),
        Number(body.customer_good || 0), Number(body.customer_bad || 0),
        totalGood, totalBad, deltaGood, deltaBad,
        String(body.source_device || ""), String(body.note || ""), now, now
      ).run();

      return json({ ok: true, delta_good: deltaGood, delta_bad: deltaBad, satisfaction });
    }

    if (url.pathname === "/api/deliveries" && request.method === "GET") {
      const rows = await env.DB.prepare(`
        SELECT * FROM deliveries
        ORDER BY completed_at DESC
        LIMIT 100
      `).all();
      return json({ ok: true, items: rows.results || [] });
    }

    if (url.pathname === "/api/deliveries" && request.method === "POST") {
      const body = await request.json();
      const now = Date.now();
      await env.DB.prepare(`
        INSERT INTO deliveries (
          id, completed_at, store_name, area, memo, lat, lng, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        uid(), body.completed_at || now,
        String(body.store_name || ""), String(body.area || ""), String(body.memo || ""),
        body.lat ?? null, body.lng ?? null, now, now
      ).run();
      return json({ ok: true });
    }

    if (url.pathname === "/api/analysis" && request.method === "GET") {
      const ratings = await env.DB.prepare(`
        SELECT * FROM rating_snapshots ORDER BY recorded_at DESC LIMIT 50
      `).all();
      const deliveries = await env.DB.prepare(`
        SELECT * FROM deliveries ORDER BY completed_at DESC LIMIT 100
      `).all();
      const ratingItems = ratings.results || [];
      const deliveryItems = deliveries.results || [];
      const latestBad = ratingItems.find(r => Number(r.delta_bad || 0) > 0);
      let candidates = [];
      if (latestBad) {
        const badAt = Number(latestBad.recorded_at || 0);
        candidates = deliveryItems.filter(d => Number(d.completed_at || 0) <= badAt).slice(0, 8);
      }
      return json({ ok: true, latest_bad_event: latestBad || null, bad_candidates: candidates });
    }

    return json({ ok: false, error: "Not found" }, 404);
  }
};

function manifestJson() {
  return {
    name: "Uber Rating Tracker",
    short_name: "評価Tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1115",
    theme_color: "#028760",
    icons: [
      { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='192' height='192'%3E%3Crect width='192' height='192' rx='42' fill='%23028760'/%3E%3Ctext x='96' y='118' text-anchor='middle' font-size='86' fill='white'%3E%E2%9C%93%3C/text%3E%3C/svg%3E", sizes: "192x192", type: "image/svg+xml" }
    ]
  };
}

function serviceWorkerJs() {
  return "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());";
}

function htmlPage(title) {
return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>${title}</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#028760">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="評価Tracker">
<script src="https://unpkg.com/tesseract.js@5/dist/tesseract.min.js"></script>
<style>
:root{--bg:#0f1115;--card:#171b22;--card2:#202631;--text:#fff;--muted:#9aa3b2;--green:#028760;--red:#ff5d5d;--border:#2c3340}
*{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;background:var(--bg);color:var(--text);padding:14px;margin:0} h1{font-size:20px;margin:6px 0 14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:15px;margin-bottom:12px}.label{color:var(--muted);font-size:12px}.value{font-size:30px;font-weight:800;margin-top:6px}.ok{color:#5be39a}.bad{color:var(--red)}button{width:100%;padding:15px;border:0;border-radius:14px;background:var(--green);color:#fff;font-size:15px;font-weight:800;margin-top:10px}button.secondary{background:var(--card2)}input,textarea{width:100%;padding:13px;margin-top:9px;border-radius:12px;border:1px solid var(--border);background:#11151c;color:#fff;font-size:16px}textarea{min-height:70px}.tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;position:sticky;bottom:8px;background:rgba(15,17,21,.9);backdrop-filter:blur(10px);padding:8px;border-radius:18px}.tab{font-size:12px;padding:11px 4px;background:#222936}.screen{display:none}.screen.active{display:block}.row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--border);padding:10px 0}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.hint{font-size:12px;color:var(--muted);line-height:1.7}.pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#222936;font-size:12px;margin-top:6px}.preview{white-space:pre-wrap;color:var(--muted);font-size:12px;max-height:110px;overflow:auto}
</style>
</head>
<body>
<h1>Uber評価トラッカー</h1>

<section id="home" class="screen active">
  <div class="grid">
    <div class="card"><div class="label">満足度</div><div class="value" id="sat">--%</div></div>
    <div class="card"><div class="label">最新評価</div><div class="value" id="summary">--</div></div>
  </div>
  <div class="card"><div class="label">前回との差分</div><div class="value" id="delta">--</div><div id="latestTime" class="hint"></div></div>
  <div class="card"><div class="label">BAD増加候補</div><div id="badCandidates" class="hint">まだ分析データがありません。</div></div>
</section>

<section id="ocr" class="screen">
  <div class="card">
    <div class="label">評価スクショOCR</div>
    <div class="hint">画像はアップロードしません。端末内でOCRして、保存するのは数字だけです。</div>
    <input type="file" id="imageInput" accept="image/*" />
    <div id="ocrResult" style="margin-top:12px"></div>
    <div id="ocrText" class="preview"></div>
  </div>
</section>

<section id="delivery" class="screen">
  <div class="card">
    <div class="label">配達完了記録</div>
    <input id="store" placeholder="店舗名 例：マクドナルド梅田店" />
    <input id="area" placeholder="エリア 例：梅田" />
    <textarea id="memo" placeholder="メモ 例：置き配 / 雨 / 店舗待ち10分"></textarea>
    <button id="saveDelivery">配達完了を記録</button>
  </div>
</section>

<section id="history" class="screen">
  <div class="card"><div class="label">評価履歴</div><div id="ratingList"></div></div>
  <div class="card"><div class="label">配達履歴</div><div id="deliveryList"></div></div>
</section>

<div class="tabs">
  <button class="tab" data-screen="home">ホーム</button>
  <button class="tab" data-screen="ocr">OCR</button>
  <button class="tab" data-screen="delivery">配達</button>
  <button class="tab" data-screen="history">履歴</button>
</div>

<script>
if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
const $=id=>document.getElementById(id);
const fmt=t=>new Date(Number(t)).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(b.dataset.screen).classList.add('active');});

async function loadAll(){ await Promise.all([loadRatings(),loadDeliveries(),loadAnalysis()]); }
async function loadRatings(){
  const data=await fetch('/api/ratings').then(r=>r.json());
  const items=data.items||[];
  if(items.length){
    const x=items[0];
    $('sat').textContent=(x.satisfaction||0)+'%';
    $('summary').innerHTML='<span class="ok">👍 '+x.total_good+'</span> / <span class="bad">👎 '+x.total_bad+'</span>';
    $('delta').innerHTML='<span class="ok">👍 '+signed(x.delta_good)+'</span> / <span class="bad">👎 '+signed(x.delta_bad)+'</span>';
    $('latestTime').textContent='最終記録：'+fmt(x.recorded_at);
  }
  $('ratingList').innerHTML=items.map(x=>'<div class="row"><div><b>👍 '+x.total_good+' / 👎 '+x.total_bad+'</b><div class="hint">'+fmt(x.recorded_at)+'</div></div><div class="mono">'+signed(x.delta_good)+' / '+signed(x.delta_bad)+'</div></div>').join('') || '<div class="hint">まだありません。</div>';
}
function signed(v){v=Number(v||0);return v>0?'+'+v:String(v)}
async function loadDeliveries(){
  const data=await fetch('/api/deliveries').then(r=>r.json());
  const items=data.items||[];
  $('deliveryList').innerHTML=items.map(x=>'<div class="row"><div><b>'+(x.store_name||'店舗未入力')+'</b><div class="hint">'+fmt(x.completed_at)+' / '+(x.area||'')+'<br>'+(x.memo||'')+'</div></div></div>').join('') || '<div class="hint">まだありません。</div>';
}
async function loadAnalysis(){
  const data=await fetch('/api/analysis').then(r=>r.json());
  if(!data.latest_bad_event){$('badCandidates').textContent='BAD増加はまだ記録されていません。';return;}
  $('badCandidates').innerHTML='<div class="pill bad">BAD '+signed(data.latest_bad_event.delta_bad)+'</div><div class="hint">記録時刻：'+fmt(data.latest_bad_event.recorded_at)+'</div>'+(data.bad_candidates||[]).map(d=>'<div class="row"><div><b>'+(d.store_name||'店舗未入力')+'</b><div>'+fmt(d.completed_at)+' '+(d.memo||'')+'</div></div></div>').join('');
}

async function parseOCR(file){
  $('ocrResult').innerHTML='OCR解析中...';
  const result=await Tesseract.recognize(file,'eng');
  const text=result.data.text||'';
  $('ocrText').textContent=text;
  const nums=(text.match(/\d+/g)||[]).map(n=>parseInt(n,10)).filter(n=>Number.isFinite(n));
  let good=0,bad=0;
  const pair=findLikelyPair(nums);
  if(pair){good=pair[0];bad=pair[1];}
  $('ocrResult').innerHTML='<div class="grid"><div class="card"><div class="label">👍 読み取り</div><div class="value ok">'+good+'</div></div><div class="card"><div class="label">👎 読み取り</div><div class="value bad">'+bad+'</div></div></div><button id="saveRatingBtn">この数字で保存</button>';
  $('saveRatingBtn').onclick=async()=>{
    const res=await fetch('/api/ratings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recorded_at:Date.now(),total_good:good,total_bad:bad,source_device:navigator.userAgent})}).then(r=>r.json());
    alert('保存しました：👍 '+signed(res.delta_good)+' / 👎 '+signed(res.delta_bad));
    await loadAll();
  };
}
function findLikelyPair(nums){
  if(nums.length<2)return null;
  for(let i=0;i<nums.length-1;i++){ if(nums[i]+nums[i+1]===100) return [nums[i],nums[i+1]]; }
  return [nums[nums.length-2],nums[nums.length-1]];
}
$('imageInput').addEventListener('change',e=>{const f=e.target.files[0]; if(f)parseOCR(f);});
$('saveDelivery').onclick=async()=>{
  const payload={completed_at:Date.now(),store_name:$('store').value,area:$('area').value,memo:$('memo').value,lat:null,lng:null};
  const save=async()=>{await fetch('/api/deliveries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); alert('配達を記録しました'); $('store').value=''; $('area').value=''; $('memo').value=''; await loadAll();};
  if(navigator.geolocation){navigator.geolocation.getCurrentPosition(p=>{payload.lat=p.coords.latitude;payload.lng=p.coords.longitude;save();},()=>save(),{enableHighAccuracy:false,timeout:3500});} else {save();}
};
loadAll();
</script>
</body>
</html>`;
}
