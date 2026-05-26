const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="108" fill="#080a0c"/><circle cx="256" cy="206" r="144" fill="none" stroke="#04d477" stroke-width="22" stroke-linecap="round"/><text x="256" y="238" text-anchor="middle" font-size="132" font-family="Arial" font-weight="900" fill="#fff">👍</text><text x="256" y="365" text-anchor="middle" font-size="96" font-family="Arial, sans-serif" font-weight="900" fill="#04d477">評価</text><text x="256" y="420" text-anchor="middle" font-size="34" font-family="Arial" font-weight="800" fill="#fff" letter-spacing="5">TRACKER</text></svg>`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", ...corsHeaders }
  });
}

function html(body) {
  return new Response(body, { headers: { "content-type": "text/html; charset=UTF-8" } });
}

function text(body, type = "text/plain; charset=UTF-8") {
  return new Response(body, { headers: { "content-type": type } });
}

function uid() {
  return crypto.randomUUID();
}

async function hasDb(env) {
  return !!env.DB;
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
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      });
    }
    if (request.method === "GET" && url.pathname === "/sw.js") {
      return text("self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());", "application/javascript; charset=UTF-8");
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "uber-rating-tracker", build: "field-ux-v7", hasDb: await hasDb(env), time: new Date().toISOString() });
    }

    if (!env.DB) {
      return json({ ok: false, error: "DB_NOT_CONNECTED" }, 503);
    }

    if (url.pathname === "/api/ratings" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM rating_snapshots ORDER BY recorded_at DESC LIMIT 100").all();
      return json({ ok: true, items: rows.results || [] });
    }

    if (url.pathname === "/api/ratings" && request.method === "POST") {
      const body = await request.json();
      const now = Date.now();
      const totalGood = Number(body.total_good || 0);
      const totalBad = Number(body.total_bad || 0);
      const satisfaction = totalGood + totalBad > 0 ? Math.round(totalGood / (totalGood + totalBad) * 100) : 0;
      const prev = await env.DB.prepare("SELECT total_good,total_bad FROM rating_snapshots ORDER BY recorded_at DESC LIMIT 1").first();
      const deltaGood = prev ? totalGood - Number(prev.total_good || 0) : 0;
      const deltaBad = prev ? totalBad - Number(prev.total_bad || 0) : 0;
      await env.DB.prepare(`INSERT INTO rating_snapshots (id,recorded_at,satisfaction,merchant_good,merchant_bad,customer_good,customer_bad,total_good,total_bad,delta_good,delta_bad,source_device,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        uid(), body.recorded_at || now, satisfaction, 0, 0, 0, 0, totalGood, totalBad, deltaGood, deltaBad, String(body.source_device || ""), String(body.note || ""), now, now
      ).run();
      return json({ ok: true, satisfaction, delta_good: deltaGood, delta_bad: deltaBad });
    }

    if (url.pathname === "/api/deliveries" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM deliveries ORDER BY completed_at DESC LIMIT 100").all();
      return json({ ok: true, items: rows.results || [] });
    }

    if (url.pathname === "/api/deliveries" && request.method === "POST") {
      const body = await request.json();
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO deliveries (id,completed_at,store_name,area,memo,lat,lng,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
        uid(), body.completed_at || now, String(body.store_name || ""), String(body.area || ""), String(body.memo || "ワンタップ記録"), body.lat ?? null, body.lng ?? null, now, now
      ).run();
      return json({ ok: true });
    }

    if (url.pathname === "/api/export" && request.method === "GET") {
      const ratings = (await env.DB.prepare("SELECT * FROM rating_snapshots ORDER BY recorded_at DESC LIMIT 1000").all()).results || [];
      const deliveries = (await env.DB.prepare("SELECT * FROM deliveries ORDER BY completed_at DESC LIMIT 1000").all()).results || [];
      return json({ ok: true, exported_at: new Date().toISOString(), ratings, deliveries });
    }

    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
};

function page() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>評価アプリ</title><link rel="manifest" href="/manifest.json"><link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/icon.svg"><meta name="theme-color" content="#028760"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="評価アプリ"><script src="https://unpkg.com/tesseract.js@5/dist/tesseract.min.js"></script><style>
:root{--bg:#080a0c;--card:#141820;--card2:#1f2530;--line:#2d3440;--green:#04b873;--green2:#028760;--red:#ff5d5d;--blue:#2b64ff;--muted:#9aa3b2;--text:#fff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#123326 0,#080a0c 38%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Noto Sans JP',sans-serif;padding:12px 12px 92px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.title{font-size:18px;font-weight:900}.sync{font-size:12px;border:1px solid #245c45;background:#10261d;color:#69efa9;border-radius:999px;padding:7px 10px}.hero{border:1px solid #245c45;background:linear-gradient(160deg,#06291e,#141820 65%);border-radius:26px;padding:18px;margin-bottom:12px;box-shadow:0 12px 28px rgba(0,0,0,.25)}.cap{color:var(--muted);font-size:12px;font-weight:800}.sat{font-size:68px;font-weight:950;letter-spacing:-4px;line-height:1}.counts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.box{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:13px}.num{font-size:32px;font-weight:950}.ok{color:#5be39a}.bad{color:var(--red)}.statusRow{display:grid;grid-template-columns:1.3fr .7fr;gap:10px;margin-bottom:12px}.miniCard{background:#111720;border:1px solid var(--line);border-radius:18px;padding:13px}.delta{font-size:21px;font-weight:950;margin-top:5px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.big{border:0;border-radius:24px;min-height:108px;padding:18px;text-align:left;color:#fff;font-size:21px;font-weight:950;box-shadow:0 10px 24px rgba(0,0,0,.28)}.big small{display:block;font-size:12px;opacity:.82;margin-top:8px}.save{background:linear-gradient(135deg,var(--green),var(--green2))}.ocr{background:linear-gradient(135deg,var(--blue),#182a70)}.tabs{position:fixed;left:10px;right:10px;bottom:8px;background:rgba(8,10,12,.95);border:1px solid var(--line);border-radius:20px;padding:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;backdrop-filter:blur(12px)}.tab{border:0;border-radius:14px;background:#202631;color:#fff;padding:12px 4px;font-size:12px;font-weight:900}.screen{display:none}.screen.active{display:block}.card{background:rgba(20,24,32,.96);border:1px solid var(--line);border-radius:20px;padding:15px;margin-bottom:12px}button{width:100%;border:0;border-radius:16px;background:var(--green2);color:#fff;padding:15px;font-size:16px;font-weight:900;margin-top:10px}button.secondary{background:#252c38}input,textarea{width:100%;background:#10151d;border:1px solid var(--line);border-radius:14px;color:#fff;font-size:17px;padding:14px;margin-top:10px}textarea{min-height:74px}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hint{font-size:13px;color:var(--muted);line-height:1.7}.row{border-bottom:1px solid var(--line);padding:11px 0}.file{display:none}.toast{display:none;position:fixed;top:10px;left:12px;right:12px;background:#202631;border:1px solid var(--line);border-radius:16px;padding:13px;z-index:9;font-size:14px}.toast.show{display:block}.empty{color:var(--muted);text-align:center;padding:16px}.details{display:none}.details.open{display:block}
</style></head><body><div id="toast" class="toast"></div><div class="top"><div class="title">評価アプリ</div><div id="sync" class="sync">確認中</div></div>
<section id="home" class="screen active"><div class="hero"><div class="cap">今の満足度</div><div id="sat" class="sat">--%</div><div class="counts"><div class="box"><div class="cap">GOOD</div><div id="good" class="num ok">--</div></div><div class="box"><div class="cap">BAD</div><div id="bad" class="num bad">--</div></div></div></div><div class="statusRow"><div class="miniCard"><div class="cap">前回との差分</div><div id="delta" class="delta">--</div></div><div class="miniCard"><div class="cap">状態</div><div id="mood" class="delta">--</div></div></div><div class="actions"><button id="quickSave" class="big save">配達完了<small>ワンタップ記録</small></button><button id="pickFromHome" class="big ocr">評価を読む<small>スクショOCR</small></button><input id="homeFile" class="file" type="file" accept="image/*"></div><div class="card"><div class="cap">今日の記録</div><div class="two"><div><div class="hint">配達</div><div id="todayD" class="num">0</div></div><div><div class="hint">評価</div><div id="todayR" class="num">0</div></div></div></div></section>
<section id="ocr" class="screen"><div class="card"><div class="cap">評価スクショOCR</div><div class="hint">画像はアップロードせず、端末内でOCRします。数字は保存前に修正できます。</div><button id="pickImage" class="ocr">スクショを選ぶ</button><input id="imageFile" class="file" type="file" accept="image/*"><div id="ocrBox"></div></div><div class="card"><div class="cap">手動入力</div><div class="two"><input id="manualGood" type="number" placeholder="GOOD"><input id="manualBad" type="number" placeholder="BAD"></div><button id="manualSave">保存</button></div></section>
<section id="delivery" class="screen"><div class="card"><div class="cap">配達記録</div><button id="quickSave2" class="big save">今すぐ記録<small>店舗名なしで保存</small></button><button class="secondary" id="toggleDetail">詳細入力</button><div id="detail" class="details"><input id="store" placeholder="店舗名"><input id="area" placeholder="エリア"><textarea id="memo" placeholder="メモ"></textarea><button id="detailSave">詳細つきで保存</button></div></div></section>
<section id="history" class="screen"><div class="card"><div class="cap">評価履歴</div><div id="ratingList"></div></div><div class="card"><div class="cap">配達履歴</div><div id="deliveryList"></div></div></section>
<div class="tabs"><button class="tab" data-tab="home">ホーム</button><button class="tab" data-tab="ocr">OCR</button><button class="tab" data-tab="delivery">配達</button><button class="tab" data-tab="history">履歴</button></div>
<script>
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});const $=id=>document.getElementById(id);let ratings=[],deliveries=[];const fmt=t=>new Date(Number(t)).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});function toast(m){$('toast').textContent=m;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2300)}function sign(v){v=Number(v||0);return v>0?'+'+v:String(v)}function day0(){const d=new Date();d.setHours(0,0,0,0);return d.getTime()}async function api(path,opt){const r=await fetch(path,opt);if(!r.ok)throw new Error(String(r.status));return r.json()}function localLoad(){ratings=JSON.parse(localStorage.getItem('ratings')||'[]');deliveries=JSON.parse(localStorage.getItem('deliveries')||'[]')}function localSave(){localStorage.setItem('ratings',JSON.stringify(ratings));localStorage.setItem('deliveries',JSON.stringify(deliveries))}async function load(){try{const h=await api('/api/health');$('sync').textContent=h.hasDb?'同期OK':'端末保存';if(h.hasDb){ratings=(await api('/api/ratings')).items||[];deliveries=(await api('/api/deliveries')).items||[]}else localLoad()}catch(e){$('sync').textContent='端末保存';localLoad()}render()}function render(){const latest=ratings[0];if(latest){$('sat').textContent=(latest.satisfaction||Math.round(latest.total_good/(latest.total_good+latest.total_bad)*100)||0)+'%';$('good').textContent=latest.total_good;$('bad').textContent=latest.total_bad;$('delta').innerHTML='<span class="ok">👍 '+sign(latest.delta_good)+'</span> / <span class="bad">👎 '+sign(latest.delta_bad)+'</span>';$('mood').innerHTML=Number(latest.delta_bad)>0?'<span class="bad">注意</span>':'<span class="ok">OK</span>'}else{$('sat').textContent='--%';$('good').textContent='--';$('bad').textContent='--';$('delta').textContent='--';$('mood').textContent='--'}const s=day0();$('todayD').textContent=deliveries.filter(x=>Number(x.completed_at)>=s).length;$('todayR').textContent=ratings.filter(x=>Number(x.recorded_at)>=s).length;$('ratingList').innerHTML=ratings.map(x=>'<div class="row"><b>👍 '+x.total_good+' / 👎 '+x.total_bad+'</b><div class="hint">'+fmt(x.recorded_at)+'　差分 '+sign(x.delta_good)+' / '+sign(x.delta_bad)+'</div></div>').join('')||'<div class="empty">まだありません</div>';$('deliveryList').innerHTML=deliveries.map(x=>'<div class="row"><b>'+(x.store_name||'店舗未入力')+'</b><div class="hint">'+fmt(x.completed_at)+' '+(x.memo||'')+'</div></div>').join('')||'<div class="empty">まだありません</div>'}async function saveDelivery(detail=false){const item={id:crypto.randomUUID(),completed_at:Date.now(),store_name:detail?$('store').value:'',area:detail?$('area').value:'',memo:detail?$('memo').value:'ワンタップ記録'};try{await api('/api/deliveries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});toast('配達を記録しました')}catch(e){deliveries.unshift(item);localSave();toast('端末に保存しました')}await load()}async function saveRating(g,b){g=Number(g||0);b=Number(b||0);if(g+b===0)return toast('数字を確認してください');const prev=ratings[0];const item={id:crypto.randomUUID(),recorded_at:Date.now(),total_good:g,total_bad:b,satisfaction:Math.round(g/(g+b)*100),delta_good:prev?g-Number(prev.total_good||0):0,delta_bad:prev?b-Number(prev.total_bad||0):0};try{await api('/api/ratings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});toast('評価を保存しました')}catch(e){ratings.unshift(item);localSave();toast('端末に保存しました')}await load()}async function parse(file){$('ocrBox').innerHTML='<div class="hint">OCR解析中...</div>';try{const r=await Tesseract.recognize(file,'eng');const nums=(r.data.text.match(/\d+/g)||[]).map(n=>parseInt(n,10)).filter(Number.isFinite);let g=0,b=0;for(let i=0;i<nums.length-1;i++){if(nums[i]+nums[i+1]===100){g=nums[i];b=nums[i+1];break}}if(!g&&!b&&nums.length>=2){g=nums[nums.length-2];b=nums[nums.length-1]}$('ocrBox').innerHTML='<div class="two"><input id="ocrGood" type="number" value="'+g+'"><input id="ocrBad" type="number" value="'+b+'"></div><button id="ocrSave">この数字で保存</button>';$('ocrSave').onclick=()=>saveRating($('ocrGood').value,$('ocrBad').value)}catch(e){$('ocrBox').innerHTML='<div class="bad">OCRエラー</div>'}}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(b.dataset.tab).classList.add('active')});$('quickSave').onclick=()=>saveDelivery(false);$('quickSave2').onclick=()=>saveDelivery(false);$('detailSave').onclick=()=>saveDelivery(true);$('toggleDetail').onclick=()=>$('detail').classList.toggle('open');$('pickFromHome').onclick=()=>$('homeFile').click();$('pickImage').onclick=()=>$('imageFile').click();$('homeFile').onchange=e=>{const f=e.target.files[0];if(f){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$('ocr').classList.add('active');parse(f)}};$('imageFile').onchange=e=>{const f=e.target.files[0];if(f)parse(f)};$('manualSave').onclick=()=>saveRating($('manualGood').value,$('manualBad').value);load();
</script></body></html>`;
}
