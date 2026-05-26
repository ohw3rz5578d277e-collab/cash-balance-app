const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=UTF-8", ...corsHeaders }
});
const html = body => new Response(body, { headers: { "content-type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } });
const text = (body, type = "text/plain; charset=UTF-8") => new Response(body, { headers: { "content-type": type, "Cache-Control": "no-store" } });
const uid = () => crypto.randomUUID();

const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#04d477"/><stop offset="1" stop-color="#028760"/></linearGradient></defs><rect width="512" height="512" rx="108" fill="#07090b"/><circle cx="256" cy="256" r="196" fill="none" stroke="url(#g)" stroke-width="22"/><rect x="150" y="196" width="212" height="150" rx="34" fill="url(#g)"/><path d="M205 196c8-54 94-54 102 0" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round"/><text x="256" y="318" text-anchor="middle" font-size="112" font-family="Arial,sans-serif" font-weight="900" fill="#fff">👍</text><text x="256" y="420" text-anchor="middle" font-size="44" font-family="Arial,sans-serif" font-weight="900" fill="#fff">評価</text></svg>`;

async function reverseGeocode(lat, lng) {
  try {
    const api = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;
    const r = await fetch(api, { headers: { "User-Agent": "uber-rating-tracker/1.0" } });
    if (!r.ok) return null;
    const d = await r.json();
    const a = d.address || {};
    return {
      name: d.name || a.shop || a.amenity || a.restaurant || a.fast_food || a.convenience || a.building || a.road || "現在地",
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
    if (request.method === "GET" && url.pathname === "/manifest.json") return json({
      name: "Uber Rating Tracker",
      short_name: "評価アプリ",
      start_url: "/",
      display: "standalone",
      background_color: "#080a0c",
      theme_color: "#028760",
      icons: [{ src: "/icon.svg?v=stable-v13", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
    });
    if (request.method === "GET" && url.pathname === "/sw.js") return text("self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());", "application/javascript; charset=UTF-8");
    if (url.pathname === "/api/health") return json({ ok: true, service: "uber-rating-tracker", build: "stable-tap-v13", hasDb: !!env.DB, time: new Date().toISOString() });
    if (url.pathname === "/api/reverse-geocode") {
      const lat = url.searchParams.get("lat");
      const lng = url.searchParams.get("lng");
      if (!lat || !lng) return json({ ok: false, error: "lat_lng_required" }, 400);
      return json({ ok: true, result: await reverseGeocode(lat, lng) });
    }

    if (!env.DB) return json({ ok: false, error: "DB_NOT_CONNECTED" }, 503);

    if (url.pathname === "/api/ratings" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM rating_snapshots ORDER BY recorded_at DESC LIMIT 100").all();
      return json({ ok: true, items: rows.results || [] });
    }
    if (url.pathname === "/api/deliveries" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM deliveries ORDER BY completed_at DESC LIMIT 100").all();
      return json({ ok: true, items: rows.results || [] });
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
<link rel="manifest" href="/manifest.json?v=stable-v13">
<link rel="icon" href="/icon.svg?v=stable-v13">
<link rel="apple-touch-icon" href="/icon.svg?v=stable-v13">
<meta name="theme-color" content="#028760">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="評価アプリ">
<script src="https://unpkg.com/tesseract.js@5/dist/tesseract.min.js"></script>
<style>
:root{--bg:#080a0c;--card:#141820;--line:#2d3440;--green:#04b873;--green2:#028760;--red:#ff5d5d;--blue:#2b64ff;--muted:#9aa3b2;--orange:#ff9f43}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;background:radial-gradient(circle at top,#123326 0,#080a0c 38%);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;padding:12px 12px 92px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.title{font-size:18px;font-weight:900}.sync{font-size:12px;border:1px solid #245c45;background:#10261d;color:#69efa9;border-radius:999px;padding:7px 10px}.hero,.card,.stage{background:rgba(20,24,32,.96);border:1px solid var(--line);border-radius:22px;padding:15px;margin-bottom:12px}.hero{border-color:#245c45;background:linear-gradient(160deg,#06291e,#141820 65%)}.cap{color:var(--muted);font-size:12px;font-weight:800}.sat{font-size:64px;font-weight:950;letter-spacing:-4px}.counts,.two,.statusRow{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box,.mini{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:13px}.num{font-size:32px;font-weight:950}.ok{color:#5be39a}.bad{color:var(--red)}.delta{font-size:20px;font-weight:950}.hint{font-size:13px;color:var(--muted);line-height:1.7}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.big{border:0;border-radius:24px;min-height:108px;padding:18px;text-align:left;color:#fff;font-size:21px;font-weight:950;box-shadow:0 10px 24px rgba(0,0,0,.28);touch-action:manipulation;position:relative;z-index:5}.big small{display:block;font-size:12px;opacity:.82;margin-top:8px}.mainSave{grid-column:1/-1;min-height:138px;font-size:30px;padding:24px}.pickup{background:linear-gradient(135deg,#ffb03a,#e66f00)}.save{background:linear-gradient(135deg,var(--green),var(--green2))}.ocr{background:linear-gradient(135deg,var(--blue),#182a70)}.tabs{position:fixed;left:10px;right:10px;bottom:8px;background:rgba(8,10,12,.95);border:1px solid var(--line);border-radius:20px;padding:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;z-index:20}.tab{border:0;border-radius:14px;background:#202631;color:#fff;padding:12px 4px;font-size:12px;font-weight:900}.screen{display:none}.screen.active{display:block}button{width:100%;border:0;border-radius:16px;background:var(--green2);color:#fff;padding:15px;font-size:16px;font-weight:900;margin-top:10px}.danger{background:#633039}.secondary{background:#252c38}input,textarea{width:100%;background:#10151d;border:1px solid var(--line);border-radius:14px;color:#fff;font-size:17px;padding:14px;margin-top:10px}textarea{min-height:74px}.row{border-bottom:1px solid var(--line);padding:11px 0}.rowTop{display:flex;justify-content:space-between;gap:10px}.smallDel,.smallEdit{width:auto;margin:0;padding:8px 10px;font-size:12px;border-radius:10px}.smallDel{background:#633039}.smallEdit{background:#2d405d}.file{display:none}.toast{display:none;position:fixed;top:10px;left:12px;right:12px;background:#202631;border:1px solid var(--line);border-radius:16px;padding:13px;z-index:99}.toast.show{display:block}.details{display:none}.details.open{display:block}.empty{text-align:center;color:var(--muted);padding:16px}
</style>
</head>
<body>
<div id="toast" class="toast"></div>
<div class="top"><div class="title">評価アプリ</div><div id="sync" class="sync">確認中</div></div>

<section id="home" class="screen active">
  <div class="hero"><div class="cap">今の満足度</div><div id="sat" class="sat">--%</div><div class="counts"><div class="box"><div class="cap">GOOD</div><div id="good" class="num ok">--</div></div><div class="box"><div class="cap">BAD</div><div id="bad" class="num bad">--</div></div></div></div>
  <div class="statusRow"><div class="mini"><div class="cap">前回との差分</div><div id="delta" class="delta">--</div></div><div class="mini"><div class="cap">状態</div><div id="mood" class="delta">--</div></div></div>
  <div class="stage"><div class="cap">現在の流れ</div><div id="activeStage" class="hint">店舗到着から開始してください。</div></div>
  <div class="actions"><button id="flowButton" class="big pickup mainSave" type="button">店舗到着<small>まずお店で押す / GPSで店舗候補取得</small></button><button id="pickFromHome" class="big ocr" type="button">評価を読む<small>自動OCR保存</small></button><input id="homeFile" class="file" type="file" accept="image/*"></div>
  <div class="card"><div class="cap">今日の記録</div><div class="two"><div><div class="hint">配達</div><div id="todayD" class="num">0</div></div><div><div class="hint">評価</div><div id="todayR" class="num">0</div></div></div></div>
</section>

<section id="ocr" class="screen"><div class="card"><div class="cap">評価スクショOCR</div><button id="pickImage" class="ocr" type="button">スクショを選ぶ</button><input id="imageFile" class="file" type="file" accept="image/*"><div id="ocrBox"></div></div><div class="card"><div class="cap">手動入力</div><div class="two"><input id="manualGood" type="number" placeholder="GOOD"><input id="manualBad" type="number" placeholder="BAD"></div><button id="manualSave" type="button">保存</button></div></section>
<section id="delivery" class="screen"><div class="card"><div class="cap">配達記録</div><button id="flowButton2" class="big pickup mainSave" type="button">店舗到着<small>まずお店で押す</small></button><button class="secondary" id="toggleDetail" type="button">詳細入力</button><div id="detail" class="details"><button class="secondary" id="gpsFill" type="button">GPSで店舗候補を取得</button><input id="store" placeholder="店舗名"><input id="area" placeholder="エリア"><textarea id="memo" placeholder="メモ"></textarea><button id="detailSave" type="button">詳細つきで保存</button></div></div></section>
<section id="history" class="screen"><div class="card"><div class="cap">履歴管理</div><div class="two"><button class="danger" id="clearRatings" type="button">評価履歴を削除</button><button class="danger" id="clearDeliveries" type="button">配達履歴を削除</button></div><button class="danger" id="clearAll" type="button">全履歴を削除</button></div><div class="card"><div class="cap">評価履歴</div><div id="ratingList"></div></div><div class="card"><div class="cap">配達履歴</div><div id="deliveryList"></div></div></section>
<div class="tabs"><button class="tab" data-tab="home" type="button">ホーム</button><button class="tab" data-tab="ocr" type="button">OCR</button><button class="tab" data-tab="delivery" type="button">配達</button><button class="tab" data-tab="history" type="button">履歴</button></div>

<script>
const $ = id => document.getElementById(id);
let ratings = [];
let deliveries = [];
let flowLock = false;
const fmt = t => new Date(Number(t)).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
function toast(m){ $('toast').textContent=m; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2200); }
function buzz(p=[40]){ try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }
function sign(v){ v=Number(v||0); return v>0?'+'+v:String(v); }
function day0(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function localLoad(){ ratings=JSON.parse(localStorage.getItem('ratings')||'[]'); deliveries=JSON.parse(localStorage.getItem('deliveries')||'[]'); }
function localSave(){ localStorage.setItem('ratings',JSON.stringify(ratings)); localStorage.setItem('deliveries',JSON.stringify(deliveries)); }
function getActiveTrip(){ return JSON.parse(localStorage.getItem('activeTrip')||'null'); }
function setActiveTrip(v){ v ? localStorage.setItem('activeTrip',JSON.stringify(v)) : localStorage.removeItem('activeTrip'); }
function esc(s){ return String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
async function api(path,opt){ const r=await fetch(path,opt); if(!r.ok) throw new Error(String(r.status)); return r.json(); }
async function getGpsCandidate(){ return new Promise(resolve=>{ if(!navigator.geolocation) return resolve({}); navigator.geolocation.getCurrentPosition(async pos=>{ const lat=pos.coords.latitude,lng=pos.coords.longitude; let place=null; try{ place=(await api('/api/reverse-geocode?lat='+encodeURIComponent(lat)+'&lng='+encodeURIComponent(lng))).result; }catch(e){} resolve({lat,lng,store_name:place?.name||'現在地記録',area:place?.area||'',place}); },()=>resolve({}),{enableHighAccuracy:false,timeout:3500}); }); }
function updateFlow(){ const t=getActiveTrip(); [$('flowButton'),$('flowButton2')].forEach(b=>{ if(!b) return; if(t){ b.className='big save mainSave'; b.innerHTML='配達完了<small>お届け先でもGPS取得して保存</small>'; } else { b.className='big pickup mainSave'; b.innerHTML='店舗到着<small>まずお店で押す / GPSで店舗候補取得</small>'; } }); $('activeStage').innerHTML=t ? '<b>店舗取得済み：</b>'+esc(t.store_name||'店舗未入力')+'<br>配達完了を押すと保存します。' : '店舗到着から開始してください。'; }
function render(){ localLoad(); const latest=ratings[0]; if(latest){ $('sat').textContent=(latest.satisfaction||0)+'%'; $('good').textContent=latest.total_good; $('bad').textContent=latest.total_bad; $('delta').innerHTML='<span class="ok">👍 '+sign(latest.delta_good)+'</span> / <span class="bad">👎 '+sign(latest.delta_bad)+'</span>'; $('mood').innerHTML=Number(latest.delta_bad)>0?'<span class="bad">注意</span>':'<span class="ok">OK</span>'; } else { $('sat').textContent='--%'; $('good').textContent='--'; $('bad').textContent='--'; $('delta').textContent='--'; $('mood').textContent='--'; } const s=day0(); $('todayD').textContent=deliveries.filter(x=>Number(x.completed_at)>=s).length; $('todayR').textContent=ratings.filter(x=>Number(x.recorded_at)>=s).length; $('ratingList').innerHTML=ratings.map(x=>'<div class="row"><div class="rowTop"><div><b>👍 '+x.total_good+' / 👎 '+x.total_bad+'</b><div class="hint">'+fmt(x.recorded_at)+' 差分 '+sign(x.delta_good)+' / '+sign(x.delta_bad)+'</div></div><button class="smallDel" onclick="deleteRating(\''+x.id+'\')">削除</button></div></div>').join('')||'<div class="empty">まだありません</div>'; $('deliveryList').innerHTML=deliveries.map(x=>'<div class="row"><div class="rowTop"><div><b>'+esc(x.store_name||'店舗未入力')+'</b><div class="hint">'+fmt(x.completed_at)+' '+esc(x.memo||'')+'<br>'+esc(x.area||'')+'</div></div><div><button class="smallEdit" onclick="editDelivery(\''+x.id+'\')">編集</button><button class="smallDel" onclick="deleteDelivery(\''+x.id+'\')">削除</button></div></div></div>').join('')||'<div class="empty">まだありません</div>'; updateFlow(); }
async function flowAction(){ toast('反応OK'); if(flowLock) return; flowLock=true; buzz([20,30,20]); try{ const active=getActiveTrip(); toast(active?'配達完了GPS取得中...':'店舗GPS取得中...'); const gps=await getGpsCandidate(); if(!active){ setActiveTrip({id:crypto.randomUUID(),pickup_at:Date.now(),store_name:gps.store_name||'',area:gps.area||'',pickup_lat:gps.lat??null,pickup_lng:gps.lng??null,pickup_display:gps.place?.display_name||''}); toast('店舗到着を記録しました'); render(); return; } const item={id:active.id,completed_at:Date.now(),store_name:active.store_name||'',area:active.area||'',memo:'店舗到着: '+fmt(active.pickup_at)+' / 配達完了GPS: '+(gps.place?.display_name||'取得'),lat:active.pickup_lat??null,lng:active.pickup_lng??null,dropoff_lat:gps.lat??null,dropoff_lng:gps.lng??null}; deliveries.unshift(item); localSave(); setActiveTrip(null); toast('配達完了を保存しました'); render(); } finally { setTimeout(()=>flowLock=false,700); } }
async function fillGps(){ toast('GPS取得中...'); const gps=await getGpsCandidate(); if(gps.store_name) $('store').value=gps.store_name; if(gps.area) $('area').value=gps.area; if(gps.place?.display_name) $('memo').value='GPS候補: '+gps.place.display_name; toast('候補を入力しました'); }
function saveDetail(){ const item={id:crypto.randomUUID(),completed_at:Date.now(),store_name:$('store').value,area:$('area').value,memo:$('memo').value}; deliveries.unshift(item); localSave(); toast('保存しました'); render(); }
function saveRating(g,b,auto=false){ g=Number(g||0); b=Number(b||0); if(g+b===0) return toast('数字を確認してください'); const prev=ratings[0]; const item={id:crypto.randomUUID(),recorded_at:Date.now(),total_good:g,total_bad:b,satisfaction:Math.round(g/(g+b)*100),delta_good:prev?g-Number(prev.total_good||0):0,delta_bad:prev?b-Number(prev.total_bad||0):0}; ratings.unshift(item); localSave(); toast(auto?'OCRで保存しました':'評価を保存しました'); render(); }
async function parse(file){ $('ocrBox').innerHTML='<div class="hint">OCR解析中...</div>'; try{ const r=await Tesseract.recognize(file,'eng'); const nums=(r.data.text.match(/\d+/g)||[]).map(n=>parseInt(n,10)).filter(Number.isFinite); let g=0,b=0; for(let i=0;i<nums.length-1;i++){ if(nums[i]+nums[i+1]===100){ g=nums[i]; b=nums[i+1]; break; } } if(!g&&!b&&nums.length>=2){ g=nums[nums.length-2]; b=nums[nums.length-1]; } $('ocrBox').innerHTML='<div class="hint">読み取り：GOOD '+g+' / BAD '+b+'</div><div class="two"><input id="ocrGood" type="number" value="'+g+'"><input id="ocrBad" type="number" value="'+b+'"></div><button id="ocrSave">修正して保存</button>'; $('ocrSave').onclick=()=>saveRating($('ocrGood').value,$('ocrBad').value,false); if(g+b>0) saveRating(g,b,true); } catch(e){ $('ocrBox').innerHTML='<div class="bad">OCRエラー</div>'; } }
function editDelivery(id){ const x=deliveries.find(v=>v.id===id); if(!x) return; const s=prompt('店舗名',x.store_name||''); if(s===null)return; const a=prompt('エリア',x.area||''); if(a===null)return; const m=prompt('メモ',x.memo||''); if(m===null)return; Object.assign(x,{store_name:s,area:a,memo:m}); localSave(); toast('編集しました'); render(); }
function deleteRating(id){ if(!confirm('この評価履歴を削除しますか？'))return; ratings=ratings.filter(x=>x.id!==id); localSave(); render(); }
function deleteDelivery(id){ if(!confirm('この配達履歴を削除しますか？'))return; deliveries=deliveries.filter(x=>x.id!==id); localSave(); render(); }
window.editDelivery=editDelivery; window.deleteRating=deleteRating; window.deleteDelivery=deleteDelivery;
function bindButtons(){ document.querySelectorAll('.tab').forEach(b=>{ b.addEventListener('click',()=>{ toast(b.textContent+' 反応OK'); document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(b.dataset.tab).classList.add('active'); }); }); $('flowButton').addEventListener('click',flowAction); $('flowButton2').addEventListener('click',flowAction); $('pickFromHome').addEventListener('click',()=>{ toast('評価を読む 反応OK'); $('homeFile').click(); }); $('pickImage').addEventListener('click',()=>{ toast('スクショ選択 反応OK'); $('imageFile').click(); }); $('homeFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(f){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $('ocr').classList.add('active'); parse(f); } }); $('imageFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) parse(f); }); $('manualSave').addEventListener('click',()=>saveRating($('manualGood').value,$('manualBad').value,false)); $('toggleDetail').addEventListener('click',()=>$('detail').classList.toggle('open')); $('gpsFill').addEventListener('click',fillGps); $('detailSave').addEventListener('click',saveDetail); $('clearRatings').addEventListener('click',()=>{ if(confirm('評価履歴をすべて削除しますか？')){ ratings=[]; localSave(); render(); } }); $('clearDeliveries').addEventListener('click',()=>{ if(confirm('配達履歴をすべて削除しますか？')){ deliveries=[]; localSave(); render(); } }); $('clearAll').addEventListener('click',()=>{ if(confirm('全履歴を削除しますか？')){ ratings=[]; deliveries=[]; setActiveTrip(null); localSave(); render(); } }); }
window.addEventListener('DOMContentLoaded',()=>{ $('sync').textContent='端末保存'; bindButtons(); render(); toast('ボタン準備OK'); });
</script>
</body></html>`;
}
