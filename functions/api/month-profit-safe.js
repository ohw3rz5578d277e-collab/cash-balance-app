const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Pin, Authorization'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
  });
}
function text(v){ return v === undefined || v === null ? '' : String(v).trim(); }
function money(v){
  if(v === undefined || v === null || v === '') return 0;
  if(typeof v === 'number') return Number.isFinite(v) ? v : 0;
  return Number(String(v).replace(/[^0-9.-]/g,'')) || 0;
}
function jstDate(){
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0,10);
}
function getPin(request){
  const url = new URL(request.url);
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return text(request.headers.get('x-app-pin')) || text(url.searchParams.get('pin')) || bearer;
}
function parsePayload(row){
  try { return JSON.parse(row.payload || '{}') || {}; } catch (_) { return {}; }
}
function calcRecord(payload){
  const dailySales = money(payload.dailySales ?? payload.sales ?? payload.appSales ?? payload.売上 ?? 0);
  const gasItems = Array.isArray(payload.gasItems) ? payload.gasItems : [];
  const gas = gasItems.reduce((s,x)=>s + money(x && x.cost), 0);
  const explicit = money(payload.appProfit ?? payload.profit ?? payload.monthProfit ?? payload.利益 ?? 0);
  const profit = explicit || (dailySales - gas);
  return { dailySales, gas, profit };
}

export async function onRequest(context){
  const { request, env } = context;
  if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if(request.method !== 'GET') return json({ ok:false, error:'method not allowed' }, 405);
  if(!env.DB) return json({ ok:false, error:"D1 Binding 'DB' が未設定です。" }, 500);
  if(!env.APP_PIN) return json({ ok:false, error:'APP_PIN が未設定です。' }, 500);
  if(getPin(request) !== env.APP_PIN) return json({ ok:false, error:'unauthorized' }, 401);

  try{
    const url = new URL(request.url);
    const today = text(url.searchParams.get('date')) || jstDate();
    const month = text(url.searchParams.get('month')) || today.slice(0,7);

    const result = await env.DB.prepare(
      `SELECT id, work_date, payload, created_at, updated_at
       FROM cash_records
       WHERE work_date LIKE ?
       ORDER BY work_date ASC, updated_at ASC
       LIMIT 1000`
    ).bind(month + '%').all();

    const latestByDate = {};
    for(const row of (result.results || [])){
      const key = row.work_date;
      const prev = latestByDate[key];
      if(!prev || String(row.updated_at || '').localeCompare(String(prev.updated_at || '')) >= 0){
        latestByDate[key] = row;
      }
    }

    const dailyMap = {};
    for(const row of Object.values(latestByDate)){
      const payload = parsePayload(row);
      const c = calcRecord(payload);
      dailyMap[row.work_date] = {
        date: row.work_date,
        sales: c.dailySales,
        gas: c.gas,
        profit: c.profit,
        count: 1,
        id: row.id,
        updatedAt: row.updated_at
      };
    }

    const daily = Object.values(dailyMap).sort((a,b)=>a.date.localeCompare(b.date));
    const monthSales = daily.reduce((s,x)=>s+x.sales,0);
    const monthGas = daily.reduce((s,x)=>s+x.gas,0);
    const monthProfit = daily.reduce((s,x)=>s+x.profit,0);
    const todayRow = dailyMap[today] || { date: today, sales:0, gas:0, profit:0, count:0 };
    const latest = daily.length ? daily[daily.length - 1] : null;

    return json({
      ok:true,
      date: today,
      month,
      profit: monthProfit,
      monthProfit,
      todayProfit: todayRow.profit,
      sales: monthSales,
      gas: monthGas,
      todaySales: todayRow.sales,
      todayGas: todayRow.gas,
      sourceRows: (result.results || []).length,
      count: daily.length,
      daily,
      latest
    });
  }catch(error){
    return json({ ok:false, error:error?.message || String(error), hint:'cash_records テーブルと DB Binding を確認してください。' }, 500);
  }
}
