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
  html = html.replace(`青・紫・緑系カードはアプリ売上入力用です。金種管理とは別で集計します。`, `ホームは当日、売上タブは月トータルで表示します。売上 = アプリ売上 + Tip / 利益 = 売上 − ガソリン代。`);

  const inject = `
<style>
  #bottomNav{opacity:0!important;pointer-events:none!important;height:0!important;overflow:hidden!important;padding:0!important;border:0!important}
  .cb-custom-nav{position:fixed;left:50%;bottom:0;z-index:80;transform:translateX(-50%);width:min(1100px,100%);padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,.98);border-top:1px solid #e5e7eb;backdrop-filter:blur(16px)}
  .cb-custom-nav-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}
  .cb-nav-btn{border:1px solid #e5e7eb;border-radius:14px;background:#fff;color:#374151;padding:9px 2px;font-size:10.5px;font-weight:950;min-height:42px}
  .cb-nav-btn.active{background:#111827;color:#fff;border-color:#111827}
  .cb-menu-button{position:fixed;left:12px;top:12px;z-index:90;width:42px;height:42px;border-radius:14px;border:1px solid #e5e7eb;background:#fff;color:#111827;font-size:22px;font-weight:950;box-shadow:0 8px 22px rgba(15,23,42,.10)}
  .cb-menu-panel{position:fixed;left:12px;top:62px;z-index:91;width:min(280px,calc(100vw - 24px));background:#fff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 20px 45px rgba(15,23,42,.18);padding:10px;display:none}
  .cb-menu-panel.open{display:block}
  .cb-menu-title{font-size:12px;color:#667085;font-weight:950;margin:4px 4px 8px}
  .cb-menu-grid{display:grid;gap:8px}
  .cb-menu-item{width:100%;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;color:#111827;padding:12px;font-size:13px;font-weight:950;text-align:left}
  .cb-menu-item:active,.cb-nav-btn:active,.cb-menu-button:active{transform:scale(.985)}
  .analysis-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  @media(min-width:860px){.analysis-grid{grid-template-columns:repeat(4,1fr)}}
  body{padding-bottom:8px}
</style>
<script>
(function(){
  'use strict';

  var PINKEY = 'cash_balance_app_pin_v21';
  var DRAFTKEY = 'cash_balance_app_draft_v21';
  var API = '/api/records';
  var DENOMS = [10000,5000,2000,1000,500,100,50,10,5,1];
  var START_DEFAULTS = {10000:0,5000:1,2000:0,1000:10,500:8,100:15,50:10,10:15,5:10,1:15};

  function yen(n){
    n = Math.round(Number(n || 0));
    return '¥' + n.toLocaleString('ja-JP');
  }
  function pct(n){
    n = Number(n || 0);
    return Math.round(n * 10) / 10 + '%';
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
  function sameDay(a,b){ return String(a || '') === String(b || ''); }
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
    if(!s.counts) s.counts = {};
    return s;
  }
  function totalCounts(r, sec){
    var counts = r && r.counts && r.counts[sec] ? r.counts[sec] : {};
    return DENOMS.reduce(function(sum, den){ return sum + money(counts[String(den)]) * den; }, 0);
  }
  function minutesForRecord(r){
    var s = r && r.startTime;
    var e = r && r.endTime;
    if(!s || !e) return 0;
    var sp = String(s).split(':').map(Number), ep = String(e).split(':').map(Number);
    var sm = (sp[0]||0)*60 + (sp[1]||0);
    var em = (ep[0]||0)*60 + (ep[1]||0);
    if(em < sm) em += 24*60;
    return Math.max(0, em-sm);
  }
  function calc(r){
    r = r || {};
    var posItems = Array.isArray(r.posItems) ? r.posItems : [];
    var gasItems = Array.isArray(r.gasItems) ? r.gasItems : [];
    var posSales = posItems.reduce(function(s,x){ return s + money(x.sale); }, 0);
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
    return {appSales:appSales,tips:tips,posSales:posSales,gas:gas,sales:sales,profit:profit,cashIn:cashIn,diff:end-expected,minutes:minutesForRecord(r)};
  }
  function mergeCurrent(records){
    var cur = currentStateFromForm();
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
    var out = {sales:0,profit:0,appSales:0,tips:0,gas:0,cashIn:0,diff:0,minutes:0,count:0,posSales:0};
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
      out.minutes += c.minutes;
      out.posSales += c.posSales;
      out.count++;
    });
    return out;
  }
  function card(label,value,sub,cls){
    return '<div class="salesCard '+(cls||'')+'"><div class="label">'+label+'</div><div class="value '+(value<0?'bad':'')+'">'+yen(value)+'</div><div class="sub">'+sub+'</div></div>';
  }
  function textCard(label,value,sub,cls){
    return '<div class="salesCard '+(cls||'')+'"><div class="label">'+label+'</div><div class="value">'+value+'</div><div class="sub">'+sub+'</div></div>';
  }
  function wage(profit, minutes){
    return {hourly: minutes > 0 ? profit / (minutes/60) : 0, minutely: minutes > 0 ? profit / minutes : 0};
  }
  async function renderDashboard(){
    var records = await loadRecords();
    var base = (document.getElementById('workDate') && document.getElementById('workDate').value) || today();
    var d = period(records,'day',base);
    var w = period(records,'week',base);
    var m = period(records,'month',base);
    var dayWage = wage(d.profit, d.minutes);
    var monthWage = wage(m.profit, m.minutes);

    var homeHtml = '';
    homeHtml += card('今日の売上', d.sales, 'アプリ売上 + Tip', '');
    homeHtml += card('今日の利益', d.profit, '売上 − ガソリン', 'profit');
    homeHtml += card('今日の現金合計', d.cashIn, 'POS現金 + Tip', '');
    homeHtml += card('今日の差異', d.diff, '終了時 − 理論上', d.diff===0?'profit':'');
    homeHtml += card('時給', dayWage.hourly, '当日の利益 ÷ 当日の稼働時間', 'profit');
    homeHtml += card('分給', dayWage.minutely, '当日の稼働時間 '+d.minutes+'分', 'profit');

    var salesHtml = '';
    salesHtml += card('今月の売上', m.sales, '月トータル：アプリ売上 + Tip', 'month');
    salesHtml += card('今月の利益', m.profit, '月トータル：売上 − ガソリン', 'profit');
    salesHtml += card('今月の現金合計', m.cashIn, '月トータル：POS現金 + Tip', 'month');
    salesHtml += card('今月の差異合計', m.diff, '月トータル：終了時 − 理論上', m.diff===0?'profit':'');
    salesHtml += card('月トータル時給', monthWage.hourly, '今月の利益 ÷ 今月の稼働時間', 'profit');
    salesHtml += card('月トータル分給', monthWage.minutely, '今月の稼働時間 '+m.minutes+'分 / '+m.count+'件', 'profit');
    salesHtml += card('今週の売上', w.sales, '参考：週トータル', '');
    salesHtml += card('今週の利益', w.profit, '参考：週トータル', 'profit');

    var a = document.getElementById('salesDashboard');
    var b = document.getElementById('salesPeriodCards');
    if(a) a.innerHTML = homeHtml;
    if(b) b.innerHTML = salesHtml;
    var preview = document.getElementById('dailySalesPreview');
    if(preview) preview.textContent = yen(money(document.getElementById('dailySales') && document.getElementById('dailySales').value));
    renderAnalysis(records, d, w, m, dayWage, monthWage);
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
  function applyStartDefaults(){
    Object.keys(START_DEFAULTS).forEach(function(den){
      var input = document.getElementById('start-' + den);
      if(input){
        input.value = String(START_DEFAULTS[den]);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
      }
    });
  }
  function ensureDefaultButton(){
    var view = document.getElementById('view-start');
    if(!view || document.getElementById('start-default-cash-button')) return;
    var btn = document.createElement('button');
    btn.id = 'start-default-cash-button';
    btn.type = 'button';
    btn.className = 'btn lightbtn';
    btn.textContent = 'デフォルト値を反映';
    btn.style.margin = '0 0 12px 0';
    btn.style.width = '100%';
    btn.onclick = applyStartDefaults;
    var first = view.querySelector('.money') || view.querySelector('.mrow');
    if(first) first.insertAdjacentElement('beforebegin', btn); else view.prepend(btn);
  }
  function hideUberField(){
    var input = document.getElementById('uberPending');
    if(!input) return;
    input.value = '0';
    var wrap = input.closest('div');
    if(wrap && wrap.querySelector('label')) wrap.style.display = 'none';
  }

  function ensureAnalysisView(){
    var main = document.getElementById('mainArea');
    if(!main || document.getElementById('view-analysis')) return;
    var sec = document.createElement('section');
    sec.className = 'view';
    sec.id = 'view-analysis';
    sec.innerHTML = '<section class="panel salesPanel"><div class="head"><div><h2>分析</h2><div class="help">月トータル・当日・週の数字をもとに分析します。</div></div></div><div class="analysis-grid" id="analysisCards"></div></section><section class="panel"><div class="head"><div><h2>分析メモ</h2></div></div><div class="hint" id="analysisMemo">データを入力すると分析が表示されます。</div></section>';
    main.appendChild(sec);
  }
  function renderAnalysis(records, d, w, m, dayWage, monthWage){
    ensureAnalysisView();
    var host = document.getElementById('analysisCards');
    var memo = document.getElementById('analysisMemo');
    if(!host) return;
    var gasRate = m.sales > 0 ? (m.gas / m.sales) * 100 : 0;
    var tipRate = m.sales > 0 ? (m.tips / m.sales) * 100 : 0;
    var cashRate = m.sales > 0 ? (m.cashIn / m.sales) * 100 : 0;
    var html = '';
    html += card('今月売上', m.sales, 'アプリ売上 + Tip', 'month');
    html += card('今月利益', m.profit, '売上 − ガソリン', 'profit');
    html += card('月時給', monthWage.hourly, '月利益 ÷ 月稼働時間', 'profit');
    html += card('月分給', monthWage.minutely, '月稼働 '+m.minutes+'分', 'profit');
    html += textCard('ガソリン率', pct(gasRate), 'ガソリン ÷ 売上', '');
    html += textCard('Tip率', pct(tipRate), 'Tip ÷ 売上', '');
    html += textCard('現金比率', pct(cashRate), '現金合計 ÷ 売上', '');
    html += card('差異合計', m.diff, '0円に近いほど良い', m.diff===0?'profit':'');
    host.innerHTML = html;
    if(memo){
      var notes = [];
      if(m.minutes === 0) notes.push('開始時刻・終了時刻を入れると、月トータル時給が出ます。');
      if(m.diff !== 0) notes.push('差異が出ています。終了時の現金・チップ・ガソリンを確認してください。');
      if(gasRate > 15) notes.push('ガソリン率が高めです。稼働エリアや移動距離を確認してください。');
      if(notes.length === 0) notes.push('大きな問題はありません。月トータルの時給・分給を見ながら稼働時間を調整できます。');
      memo.innerHTML = '<ol><li>' + notes.join('</li><li>') + '</li></ol>';
    }
  }
  function ensureCustomNav(){
    if(!document.getElementById('cb-custom-nav')){
      var nav = document.createElement('nav');
      nav.id = 'cb-custom-nav';
      nav.className = 'cb-custom-nav';
      nav.innerHTML = '<div class="cb-custom-nav-grid"><button class="cb-nav-btn active" data-cb-view="home">ホーム</button><button class="cb-nav-btn" data-cb-view="start">開始時</button><button class="cb-nav-btn" data-cb-view="pos">POS</button><button class="cb-nav-btn" data-cb-view="sales">売上</button><button class="cb-nav-btn" data-cb-view="end">終了時</button><button class="cb-nav-btn" data-cb-view="analysis">分析</button></div>';
      document.body.appendChild(nav);
      nav.addEventListener('click', function(e){
        var btn = e.target.closest('[data-cb-view]');
        if(!btn) return;
        openCustomView(btn.dataset.cbView);
      });
    }
    if(!document.getElementById('cb-menu-button')){
      var b = document.createElement('button');
      b.id = 'cb-menu-button';
      b.className = 'cb-menu-button';
      b.type = 'button';
      b.textContent = '☰';
      document.body.appendChild(b);
      var p = document.createElement('div');
      p.id = 'cb-menu-panel';
      p.className = 'cb-menu-panel';
      p.innerHTML = '<div class="cb-menu-title">その他メニュー</div><div class="cb-menu-grid"><button class="cb-menu-item" data-cb-view="received">受取金</button><button class="cb-menu-item" data-cb-view="tips">チップ</button><button class="cb-menu-item" data-cb-view="gas">ガソリン</button><button class="cb-menu-item" data-cb-view="exchange">両替</button><button class="cb-menu-item" data-cb-action="reload">最新読込</button></div>';
      document.body.appendChild(p);
      b.onclick = function(){ p.classList.toggle('open'); };
      p.addEventListener('click', function(e){
        var item = e.target.closest('.cb-menu-item');
        if(!item) return;
        p.classList.remove('open');
        if(item.dataset.cbAction === 'reload'){
          var r = document.getElementById('reloadButton');
          if(r) r.click();
          return;
        }
        openCustomView(item.dataset.cbView);
      });
    }
  }
  function setCustomActive(view){
    document.querySelectorAll('.cb-nav-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.cbView === view); });
  }
  function openCustomView(view){
    ensureAnalysisView();
    if(view === 'analysis'){
      document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
      var a = document.getElementById('view-analysis');
      if(a) a.classList.add('active');
      document.body.classList.remove('pos-active');
      setCustomActive('analysis');
      renderDashboard();
      return;
    }
    var original = document.querySelector('#bottomNav .navbtn[data-view="'+view+'"]');
    if(original) original.click();
    setTimeout(function(){ setCustomActive(view); renderDashboard(); }, 80);
  }
  function syncCustomNavVisibility(){
    var main = document.getElementById('mainArea');
    var loggedIn = main && !main.classList.contains('hidden');
    ['cb-custom-nav','cb-menu-button'].forEach(function(id){ var el = document.getElementById(id); if(el) el.style.display = loggedIn ? '' : 'none'; });
    var panel = document.getElementById('cb-menu-panel');
    if(panel && !loggedIn) panel.classList.remove('open');
  }
  function run(){ ensureCustomNav(); ensureAnalysisView(); ensureTipButton(); ensureDefaultButton(); hideUberField(); syncCustomNavVisibility(); renderDashboard(); }
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
