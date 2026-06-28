export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  let html = await response.text();

  html = html.replace(
    `<div class="posSubBtns"><button class="postip" id="tipChangeButton" type="button">Tip</button><button class="posclear" id="clearPosButton" type="button">入力クリア</button></div>`,
    `<div class="posSubBtns"><button class="postip" id="tipChangeButton" type="button">Tip</button><button class="postip" id="tipAmountButton" type="button">チップ指定</button><button class="posclear" id="clearPosButton" type="button">入力クリア</button></div>`
  );
  html = html.replace(`.posSubBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px}`, `.posSubBtns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}`);
  html = html.replace(
    `<div><label>Uber受取待ち / 支払い予定</label><input id="uberPending" type="number" inputmode="numeric" placeholder="受取待ち: 3000 / 支払い: -1000"></div>`,
    ``
  );
  html = html.replace(`青・紫・緑系カードはアプリ売上入力用です。金種管理とは別で集計します。`, `売上 = アプリ売上 + Tip / 利益 = 売上 − ガソリン代で計算します。`);

  const inject = `
<script>
(function(){
  'use strict';

  var PINKEY = 'cash_balance_app_pin_v21';
  var DRAFTKEY = 'cash_balance_app_draft_v21';
  var API = '/api/records';
  var DENOMS = [10000,5000,2000,1000,500,100,50,10,5,1];

  function yen(n){
    n = Math.round(Number(n || 0));
    return '¥' + n.toLocaleString('ja-JP');
  }
  function money(v){
    var n = Math.floor(Number(v || 0));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function today(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function parseDate(s){
    var p = String(s || today()).split('-').map(Number);
    return new Date(p[0] || new Date().getFullYear(), (p[1] || 1)-1, p[2] || 1);
  }
  function sameDay(a,b){ return String(a) === String(b); }
  function sameMonth(a,b){
    var da = parseDate(a), db = parseDate(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
  }
  function weekStart(d){
    var x = new Date(d);
    var diff = (x.getDay()+6)%7;
    x.setDate(x.getDate()-diff);
    x.setHours(0,0,0,0);
    return x;
  }
  function sameWeek(a,b){ return weekStart(parseDate(a)).getTime() === weekStart(parseDate(b)).getTime(); }
  function getDraftState(){
    try{
      var raw = localStorage.getItem(DRAFTKEY);
      if(!raw) return null;
      var d = JSON.parse(raw);
      return d && d.state ? d.state : null;
    }catch(e){ return null; }
  }
  function currentStateFromForm(){
    var draft = getDraftState() || {};
    var s = JSON.parse(JSON.stringify(draft || {}));
    var date = document.getElementById('workDate');
    var startTime = document.getElementById('startTime');
    var endTime = document.getElementById('endTime');
    var dailySales = document.getElementById('dailySales');
    var salesMemo = document.getElementById('salesMemo');
    if(date) s.date = date.value || s.date || today();
    if(startTime) s.startTime = startTime.value || '';
    if(endTime) s.endTime = endTime.value || '';
    if(dailySales) s.dailySales = money(dailySales.value);
    if(salesMemo) s.salesMemo = salesMemo.value || '';
    s.uberPending = 0;
    return s;
  }
  function totalCounts(r, sec){
    var counts = r && r.counts && r.counts[sec] ? r.counts[sec] : {};
    return DENOMS.reduce(function(sum, den){ return sum + money(counts[String(den)]) * den; }, 0);
  }
  function calc(r){
    r = r || {};
    var posItems = Array.isArray(r.posItems) ? r.posItems : [];
    var gasItems = Array.isArray(r.gasItems) ? r.gasItems : [];
    var posSales = posItems.reduce(function(s,x){ return s + money(x.sale); }, 0);
    var posPaid = posItems.reduce(function(s,x){ return s + money(x.paid); }, 0);
    var posChange = posItems.reduce(function(s,x){ return s + money(x.change); }, 0);
    var posTips = posItems.reduce(function(s,x){ return s + money(x.tip); }, 0);
    var coinTips = totalCounts(r, 'tips');
    var tips = posTips + coinTips;
    var appSales = money(r.dailySales);
    var gas = gasItems.reduce(function(s,x){ return s + money(x.cost); }, 0);
    var sales = appSales + tips;
    var profit = sales - gas;
    var cashIn = posSales + tips;
    var start = totalCounts(r,'start');
    var received = totalCounts(r,'received');
    var exchange = totalCounts(r,'exchange');
    var end = totalCounts(r,'end');
    var expected = start + posSales + received + tips + exchange - gas;
    return {appSales:appSales,tips:tips,posSales:posSales,posPaid:posPaid,posChange:posChange,gas:gas,sales:sales,profit:profit,cashIn:cashIn,diff:end-expected};
  }
  function mergeCurrent(records){
    var cur = currentStateFromForm();
    if(!cur) return records || [];
    var out = Array.isArray(records) ? records.slice() : [];
    var idx = out.findIndex(function(r){ return cur.id && r.id === cur.id; });
    if(idx >= 0) out[idx] = cur; else out.push(cur);
    return out;
  }
  async function loadRecords(){
    var pin = localStorage.getItem(PINKEY) || '';
    var draft = getDraftState();
    if(!pin) return mergeCurrent(draft ? [draft] : []);
    try{
      var res = await fetch(API + '?limit=1000&ts=' + Date.now(), {cache:'no-store', headers:{'x-app-pin':pin}});
      var data = await res.json();
      return mergeCurrent(Array.isArray(data.records) ? data.records : []);
    }catch(e){
      return mergeCurrent(draft ? [draft] : []);
    }
  }
  function period(records, kind, baseDate){
    var out = {sales:0,profit:0,appSales:0,tips:0,gas:0,cashIn:0,diff:0,count:0};
    records.forEach(function(r){
      var ok = kind === 'day' ? sameDay(r.date, baseDate) : kind === 'week' ? sameWeek(r.date, baseDate) : sameMonth(r.date, baseDate);
      if(!ok) return;
      var c = calc(r);
      out.sales += c.sales;
      out.profit += c.profit;
      out.appSales += c.appSales;
      out.tips += c.tips;
      out.gas += c.gas;
      out.cashIn += c.cashIn;
      out.diff += c.diff;
      out.count++;
    });
    return out;
  }
  function workMinutes(){
    var s = document.getElementById('startTime') && document.getElementById('startTime').value;
    var e = document.getElementById('endTime') && document.getElementById('endTime').value;
    if(!s || !e) return 0;
    var sp = s.split(':').map(Number), ep = e.split(':').map(Number);
    var sm = (sp[0]||0)*60 + (sp[1]||0);
    var em = (ep[0]||0)*60 + (ep[1]||0);
    if(em < sm) em += 24*60;
    return Math.max(0, em-sm);
  }
  function card(label,value,sub,cls){
    return '<div class="salesCard '+(cls||'')+'"><div class="label">'+label+'</div><div class="value '+(value<0?'bad':'')+'">'+yen(value)+'</div><div class="sub">'+sub+'</div></div>';
  }
  async function renderDashboard(){
    var records = await loadRecords();
    var base = (document.getElementById('workDate') && document.getElementById('workDate').value) || today();
    var d = period(records,'day',base);
    var w = period(records,'week',base);
    var m = period(records,'month',base);
    var min = workMinutes();
    var hourly = min > 0 ? d.profit / (min/60) : 0;
    var minutely = min > 0 ? d.profit / min : 0;
    var html = '';
    html += card('今日の売上', d.sales, 'アプリ売上 + Tip', '');
    html += card('今日の利益', d.profit, '売上 − ガソリン', 'profit');
    html += card('今週の売上', w.sales, 'アプリ売上 + Tip', '');
    html += card('今週の利益', w.profit, '週売上 − 週ガソリン', 'profit');
    html += card('今月の売上', m.sales, 'アプリ売上 + Tip', 'month');
    html += card('今月の利益', m.profit, '月売上 − 月ガソリン', 'profit');
    html += card('今月の現金合計', m.cashIn, 'POS現金 + Tip', 'month');
    html += card('今月の差異合計', m.diff, '終了時 − 理論上', m.diff===0?'profit':'');
    html += card('時給', hourly, '今日の利益 ÷ 稼働時間', 'profit');
    html += card('分給', minutely, '稼働時間 '+min+'分', 'profit');
    var a = document.getElementById('salesDashboard');
    var b = document.getElementById('salesPeriodCards');
    if(a) a.innerHTML = html;
    if(b) b.innerHTML = html;
    var preview = document.getElementById('dailySalesPreview');
    if(preview) preview.textContent = yen(money(document.getElementById('dailySales') && document.getElementById('dailySales').value));
  }

  function amountText(text){ return Number(String(text||'').replace(/[^0-9-]/g,'') || 0); }
  function clickKey(k){ var b = document.querySelector('.key[data-key="'+k+'"]'); if(b) b.click(); }
  function typeAmount(n){ String(Math.max(0, Math.floor(Number(n||0)))).split('').forEach(function(ch){ clickKey(ch); }); }
  function setPaid(n){ var p = document.querySelector('.modeBtn[data-mode="paid"]'); if(p) p.click(); clickKey('C'); typeAmount(n); }
  function manualTip(){
    var sale = amountText(document.getElementById('posSaleView') && document.getElementById('posSaleView').textContent);
    var paid = amountText(document.getElementById('posPaidView') && document.getElementById('posPaidView').textContent);
    var change = Math.max(0, paid - sale);
    if(!sale || !paid || change <= 0){ alert('チップ指定できるおつりがありません。'); return; }
    var input = prompt('何円チップにしますか？\\n現在のおつり：' + change.toLocaleString('ja-JP') + '円', change % 1000 || '');
    if(input === null) return;
    var tip = Math.floor(Number(String(input).replace(/[^0-9]/g,'')) || 0);
    if(tip <= 0){ alert('1円以上で入力してください。'); return; }
    if(tip > change){ alert('チップはおつり以下で入力してください。'); return; }
    var tipBtn = document.getElementById('tipChangeButton');
    if(!tipBtn){ alert('Tipボタンが見つかりません。'); return; }
    setPaid(sale + tip);
    setTimeout(function(){ tipBtn.click(); setTimeout(function(){ setPaid(paid); renderDashboard(); }, 120); }, 120);
  }
  function ensureTipButton(){
    var area = document.querySelector('.posSubBtns');
    if(!area) return;
    area.style.gridTemplateColumns = '1fr 1fr 1fr';
    var old = document.getElementById('tipFractionButton');
    if(old) old.remove();
    var clear = document.getElementById('clearPosButton');
    var btn = document.getElementById('tipAmountButton');
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'tipAmountButton';
      btn.type = 'button';
      btn.className = 'postip';
      btn.textContent = 'チップ指定';
      if(clear) area.insertBefore(btn, clear); else area.appendChild(btn);
    }
    btn.textContent = 'チップ指定';
    btn.onclick = manualTip;
  }
  function run(){ ensureTipButton(); renderDashboard(); }
  var timer = null;
  var obs = new MutationObserver(function(){ clearTimeout(timer); timer = setTimeout(run, 180); });
  window.addEventListener('DOMContentLoaded', function(){
    run();
    if(document.body) obs.observe(document.body,{childList:true,subtree:true});
    ['input','change','click'].forEach(function(ev){ document.addEventListener(ev,function(){ clearTimeout(timer); timer=setTimeout(run,220); }, true); });
    setTimeout(run,500);
    setTimeout(run,1500);
  });
})();
</script>
`;

  html = html.replace("</body>", inject + "</body>");
  return new Response(html, response);
}
