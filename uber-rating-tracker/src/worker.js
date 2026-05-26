const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...corsHeaders
    }
  });
}

function uid() {
  return crypto.randomUUID();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/') {
      return new Response(htmlPage(env.APP_NAME || 'Uber Rating Tracker'), {
        headers: {
          'content-type': 'text/html; charset=UTF-8'
        }
      });
    }

    if (url.pathname === '/api/ratings' && request.method === 'GET') {
      const rows = await env.DB.prepare(`
        SELECT *
        FROM rating_snapshots
        ORDER BY recorded_at DESC
        LIMIT 30
      `).all();

      return json({ ok: true, items: rows.results || [] });
    }

    if (url.pathname === '/api/ratings' && request.method === 'POST') {
      const body = await request.json();

      const now = Date.now();

      const prev = await env.DB.prepare(`
        SELECT total_good, total_bad
        FROM rating_snapshots
        ORDER BY recorded_at DESC
        LIMIT 1
      `).first();

      const deltaGood = prev ? (body.total_good - prev.total_good) : 0;
      const deltaBad = prev ? (body.total_bad - prev.total_bad) : 0;

      await env.DB.prepare(`
        INSERT INTO rating_snapshots (
          id,
          recorded_at,
          satisfaction,
          merchant_good,
          merchant_bad,
          customer_good,
          customer_bad,
          total_good,
          total_bad,
          delta_good,
          delta_bad,
          source_device,
          note,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        uid(),
        body.recorded_at || now,
        body.satisfaction || 0,
        body.merchant_good || 0,
        body.merchant_bad || 0,
        body.customer_good || 0,
        body.customer_bad || 0,
        body.total_good || 0,
        body.total_bad || 0,
        deltaGood,
        deltaBad,
        body.source_device || '',
        body.note || '',
        now,
        now
      )
      .run();

      return json({
        ok: true,
        delta_good: deltaGood,
        delta_bad: deltaBad
      });
    }

    if (url.pathname === '/api/deliveries' && request.method === 'POST') {
      const body = await request.json();
      const now = Date.now();

      await env.DB.prepare(`
        INSERT INTO deliveries (
          id,
          completed_at,
          store_name,
          area,
          memo,
          lat,
          lng,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        uid(),
        body.completed_at || now,
        body.store_name || '',
        body.area || '',
        body.memo || '',
        body.lat || null,
        body.lng || null,
        now,
        now
      )
      .run();

      return json({ ok: true });
    }

    return json({ ok: false, error: 'Not found' }, 404);
  }
};

function htmlPage(title) {
return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<link rel="manifest" href="/manifest.json">
<script src="https://unpkg.com/tesseract.js@5/dist/tesseract.min.js"></script>
<style>
body{
font-family:-apple-system,BlinkMacSystemFont,sans-serif;
background:#0f1115;
color:#fff;
padding:16px;
margin:0;
}
.card{
background:#171b22;
border-radius:18px;
padding:16px;
margin-bottom:16px;
}
button{
width:100%;
padding:16px;
border:none;
border-radius:14px;
background:#028760;
color:#fff;
font-size:16px;
font-weight:bold;
}
input{
width:100%;
padding:14px;
margin-top:10px;
border-radius:12px;
border:none;
background:#232833;
color:#fff;
}
.value{
font-size:32px;
font-weight:bold;
margin-top:8px;
}
.small{
opacity:.7;
font-size:13px;
}
</style>
</head>
<body>

<div class="card">
<div class="small">現在の評価</div>
<div class="value" id="summary">--</div>
</div>

<div class="card">
<div class="small">評価スクショOCR</div>
<input type="file" id="imageInput" accept="image/*" />
<div id="ocrResult" style="margin-top:12px"></div>
</div>

<div class="card">
<div class="small">配達完了</div>
<input id="store" placeholder="店舗名" />
<input id="memo" placeholder="メモ" />
<button id="saveDelivery">配達完了を記録</button>
</div>

<script>
async function loadRatings(){
const res = await fetch('/api/ratings');
const data = await res.json();

if(data.items?.length){
const latest = data.items[0];
document.getElementById('summary').innerHTML = `👍 ${latest.total_good} / 👎 ${latest.total_bad}`;
}
}

loadRatings();

async function parseOCR(file){
const resultEl = document.getElementById('ocrResult');
resultEl.innerHTML = 'OCR解析中...';

const result = await Tesseract.recognize(file,'eng');
const text = result.data.text;

const nums = text.match(/\d+/g) || [];

let good = 0;
let bad = 0;

if(nums.length >= 2){
good = parseInt(nums[nums.length-2] || '0');
bad = parseInt(nums[nums.length-1] || '0');
}

resultEl.innerHTML = `
<div>👍 ${good}</div>
<div>👎 ${bad}</div>
<button id="saveRatingBtn">保存</button>
`;

setTimeout(()=>{
const btn = document.getElementById('saveRatingBtn');
if(!btn) return;

btn.onclick = async ()=>{
await fetch('/api/ratings',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
recorded_at:Date.now(),
total_good:good,
total_bad:bad,
satisfaction:good,
source_device:navigator.userAgent
})
});

alert('保存しました');
loadRatings();
};
},100);
}

document.getElementById('imageInput').addEventListener('change',e=>{
const file = e.target.files[0];
if(file) parseOCR(file);
});

document.getElementById('saveDelivery').onclick = async ()=>{
const store = document.getElementById('store').value;
const memo = document.getElementById('memo').value;

let lat = null;
let lng = null;

if(navigator.geolocation){
navigator.geolocation.getCurrentPosition(async pos=>{
lat = pos.coords.latitude;
lng = pos.coords.longitude;

await fetch('/api/deliveries',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
completed_at:Date.now(),
store_name:store,
memo,
lat,
lng
})
});

alert('配達を記録しました');
});
}
};
</script>

</body>
</html>`;
}
