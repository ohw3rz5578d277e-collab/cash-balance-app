export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  let html = await response.text();

  // ------------------------------------------------------
  // Runtime HTML/JS patch
  // - Move Uber pending/payment input from Home to Sales tab
  // - Treat combined sales as POS cash sales + Uber receivable/payment + tips
  // - Keep cash difference calculation based on actual cash only
  // - Allow minus input for Uber receivable/payment on smartphone keyboards
  // - Add default cash count button on Start cash screen
  // ------------------------------------------------------
  const replacements = [
    [
      `<div><label>Uber受取待ち / 支払い予定</label><input id="uberPending" type="number" inputmode="numeric" placeholder="受取待ち: 3000 / 支払い: -1000"></div>`,
      ``
    ],
    [
      `<div class="salesInputGrid"><div><label>日付</label><input id="salesDateMirror" type="date"></div><div><label>その日のアプリ売上</label><input id="dailySales" type="number" inputmode="numeric" placeholder="例：12800"></div><div><label>売上メモ</label><input id="salesMemo" placeholder="例：雨 / クエスト込み"></div></div>`,
      `<div class="salesInputGrid"><div><label>日付</label><input id="salesDateMirror" type="date"></div><div><label>Uberアプリ売上（確認用）</label><input id="dailySales" type="number" inputmode="numeric" placeholder="例：12800"></div><div><label>Uber受取待ち / 支払い予定</label><input id="uberPending" type="text" inputmode="text" pattern="-?[0-9]*" placeholder="受取待ち: 3000 / 支払い: -1000"></div><div><label>売上メモ</label><input id="salesMemo" placeholder="例：雨 / クエスト込み"></div></div>`
    ],
    [
      `<b>利益：</b> アプリ売上 − ガソリン代。月・週・日で自動集計します。`,
      `<b>利益：</b> 合算売上（POS売上 + Uber受取待ち/支払い予定 + Tip）− ガソリン代。月・週・日で自動集計します。`
    ],
    [
      `@media(min-width:760px){.grid{grid-template-columns:repeat(4,1fr)}.salesInputGrid{grid-template-columns:1fr 1fr 1fr}.expenseGrid{grid-template-columns:1fr 1fr 1fr 1.2fr}}`,
      `@media(min-width:760px){.grid{grid-template-columns:repeat(4,1fr)}.salesInputGrid{grid-template-columns:repeat(4,1fr)}.expenseGrid{grid-template-columns:1fr 1fr 1fr 1.2fr}}`
    ],
    [
      `sales=posSales+received+tips,dailySales=money(r.dailySales),appProfit=dailySales-gasCost,expected=start+sales+exchange-gasCost-uber;`,
      `sales=posSales+received+tips,uberIncome=uber,dailySales=money(r.dailySales),combinedSales=posSales+uberIncome+tips,appProfit=combinedSales-gasCost,expected=start+sales+exchange-gasCost;`
    ],
    [
      `sales=posSales+received+tips,uberIncome=uber,dailySales=money(r.dailySales),combinedSales=posSales+uberIncome,appProfit=combinedSales-gasCost,expected=start+sales+exchange-gasCost;`,
      `sales=posSales+received+tips,uberIncome=uber,dailySales=money(r.dailySales),combinedSales=posSales+uberIncome+tips,appProfit=combinedSales-gasCost,expected=start+sales+exchange-gasCost;`
    ],
    [
      `['Uber調整',-c.uberPending,c.uberPending>=0?'受取待ち控除':'支払い予定加算']`,
      `['Uber受取/支払',c.uberPending,'差異には反映しない']`
    ],
    [
      `sales:sales,dailySales:dailySales,appProfit:appProfit,gasCost:gasCost`,
      `sales:sales,dailySales:dailySales,uberIncome:uberIncome,combinedSales:combinedSales,appProfit:appProfit,gasCost:gasCost`
    ],
    [
      `sales+=c.dailySales;gas+=c.gasCost;`,
      `sales+=c.combinedSales;gas+=c.gasCost;`
    ],
    [
      `salesCard('今日のアプリ売上',d.sales,'売上タブの日別入力','')+salesCard('今日の利益',d.profit,'売上 − ガソリン','profit')+salesCard('今週のアプリ売上',w.sales,'選択日の週で集計','')+salesCard('今週の利益',w.profit,'週売上 − 週ガソリン','profit')+salesCard('今月のアプリ売上',m.sales,'選択日の月で集計','month')+salesCard('今月の利益',m.profit,'月売上 − 月ガソリン','profit')`,
      `salesCard('今日の合算売上',d.sales,'POS売上 + Uber + Tip','')+salesCard('今日の利益',d.profit,'合算売上 − ガソリン','profit')+salesCard('今週の合算売上',w.sales,'POS + Uber + Tip','')+salesCard('今週の利益',w.profit,'週合算売上 − 週ガソリン','profit')+salesCard('今月の合算売上',m.sales,'POS + Uber + Tip','month')+salesCard('今月の利益',m.profit,'月合算売上 − 月ガソリン','profit')`
    ],
    [
      `salesCard('今日の合算売上',d.sales,'POS売上 + Uber受取/支払い','')+salesCard('今日の利益',d.profit,'合算売上 − ガソリン','profit')+salesCard('今週の合算売上',w.sales,'POS + Uberを週集計','')+salesCard('今週の利益',w.profit,'週合算売上 − 週ガソリン','profit')+salesCard('今月の合算売上',m.sales,'POS + Uberを月集計','month')+salesCard('今月の利益',m.profit,'月合算売上 − 月ガソリン','profit')`,
      `salesCard('今日の合算売上',d.sales,'POS売上 + Uber + Tip','')+salesCard('今日の利益',d.profit,'合算売上 − ガソリン','profit')+salesCard('今週の合算売上',w.sales,'POS + Uber + Tip','')+salesCard('今週の利益',w.profit,'週合算売上 − 週ガソリン','profit')+salesCard('今月の合算売上',m.sales,'POS + Uber + Tip','month')+salesCard('今月の利益',m.profit,'月合算売上 − 月ガソリン','profit')`
    ],
    [
      `アプリ売上 '+yen(c.dailySales)+' / ガソリン`,
      `合算売上 '+yen(c.combinedSales)+' / Uber確認 '+yen(c.dailySales)+' / Tip '+yen(c.tips)+' / ガソリン`
    ],
    [
      `合算売上 '+yen(c.combinedSales)+' / Uber確認 '+yen(c.dailySales)+' / ガソリン`,
      `合算売上 '+yen(c.combinedSales)+' / Uber確認 '+yen(c.dailySales)+' / Tip '+yen(c.tips)+' / ガソリン`
    ],
    [
      `アプリ売上 '+yen(c.dailySales)+' / 差異`,
      `合算売上 '+yen(c.combinedSales)+' / 差異`
    ],
    [
      `青・紫・緑系カードはアプリ売上入力用です。金種管理とは別で集計します。`,
      `青・紫・緑系カードは売上集計用です。POS売上、Uber受取/支払い予定、Tipを合算して表示します。`
    ],
    [
      `青・紫・緑系カードは売上集計用です。POS売上とUber受取/支払い予定を合算して表示します。`,
      `青・紫・緑系カードは売上集計用です。POS売上、Uber受取/支払い予定、Tipを合算して表示します。`
    ]
  ];

  for (const [from, to] of replacements) {
    if (html.includes(from)) html = html.replace(from, to);
  }

  const inject = `
<script>
(function(){
  'use strict';
  var current = new Date();
  var currentYear = current.getFullYear();
  var currentMonth = current.getMonth() + 1;
  var START_DEFAULTS = [
    {keys:['1万円札','10000'], count:0},
    {keys:['5千円札','5000'], count:1},
    {keys:['2千円札','2000'], count:0},
    {keys:['千円札','1000'], count:10},
    {keys:['500円玉','500'], count:8},
    {keys:['100円玉','100'], count:15},
    {keys:['50円玉','50'], count:10},
    {keys:['10円玉','10'], count:15},
    {keys:['5円玉','5'], count:10},
    {keys:['1円玉','1'], count:15}
  ];

  function monthKeyFromText(text){
    var m = String(text||'').match(/(\\d{4})年(\\d{1,2})月/);
    if(!m) return '';
    return m[1] + '-' + String(m[2]).padStart(2,'0');
  }
  function currentKey(){return currentYear + '-' + String(currentMonth).padStart(2,'0');}

  function startView(){
    var exact = document.getElementById('view-start') || document.getElementById('view-startCash') || document.getElementById('view-start-cash');
    if(exact) return exact;
    var views = Array.from(document.querySelectorAll('.view, section, .panel'));
    return views.find(function(el){
      return el.textContent && el.textContent.includes('開始時') && el.querySelector('.mrow');
    }) || null;
  }
  function setInputValue(input, value){
    if(!input) return;
    input.value = String(value);
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function defaultForRow(row){
    var text = row.textContent || '';
    for(var i=0;i<START_DEFAULTS.length;i++){
      var d = START_DEFAULTS[i];
      if(d.keys.some(function(k){return text.includes(k);})) return d.count;
    }
    return null;
  }
  function startRows(){
    var view = startView();
    if(!view) return [];
    return Array.from(view.querySelectorAll('.mrow')).map(function(row){
      return {row:row, input:row.querySelector('input.cinput, .cinput')};
    }).filter(function(x){return x.input && defaultForRow(x.row) !== null;});
  }
  function isStartAllEmpty(){
    var rows = startRows();
    return rows.length > 0 && rows.every(function(x){
      var v = String(x.input.value || '').trim();
      return v === '' || v === '0';
    });
  }
  function applyStartDefaults(force){
    var rows = startRows();
    if(!rows.length) return false;
    if(!force && !isStartAllEmpty()) return false;
    rows.forEach(function(x){
      var v = defaultForRow(x.row);
      setInputValue(x.input, v);
    });
    return true;
  }
  function ensureDefaultButton(){
    var view = startView();
    if(!view || document.getElementById('start-default-cash-button')) return;
    var btn = document.createElement('button');
    btn.id = 'start-default-cash-button';
    btn.type = 'button';
    btn.className = 'btn lightbtn';
    btn.textContent = 'デフォルト値を反映';
    btn.style.margin = '0 0 12px 0';
    btn.style.width = '100%';
    btn.addEventListener('click', function(){ applyStartDefaults(true); });
    var h = Array.from(view.querySelectorAll('h2,.head')).find(function(el){return el.textContent && el.textContent.includes('開始時');});
    if(h && h.parentElement){
      h.insertAdjacentElement('afterend', btn);
    }else{
      var firstMoney = view.querySelector('.money') || view.querySelector('.mrow');
      if(firstMoney) firstMoney.insertAdjacentElement('beforebegin', btn);
      else view.prepend(btn);
    }
  }
  function autoApplyStartDefaults(){
    var view = startView();
    if(!view) return;
    if(isStartAllEmpty()) applyStartDefaults(false);
  }

  function ensurePastBox(targetId, title){
    var target = document.getElementById(targetId);
    if(!target) return null;
    var boxId = targetId + '-past-months';
    var old = document.getElementById(boxId);
    if(old) old.remove();
    var box = document.createElement('div');
    box.id = boxId;
    box.className = 'panel';
    box.style.marginTop = '12px';
    box.innerHTML = '<div class="head"><div><h2>'+title+'</h2><div class="help">前月以前はここを開くと確認できます。</div></div></div><div class="list" data-past-list="1"></div>';
    target.parentElement.appendChild(box);
    return box.querySelector('[data-past-list]');
  }
  function filterMonthList(targetId, pastTitle){
    var list = document.getElementById(targetId);
    if(!list || list.dataset.monthFiltered === 'busy') return;
    var items = Array.from(list.children).filter(function(el){return el.classList && el.classList.contains('item');});
    if(!items.length) return;
    list.dataset.monthFiltered = 'busy';
    var ck = currentKey();
    var past = {};
    items.forEach(function(item){
      var key = monthKeyFromText(item.textContent);
      if(key && key !== ck){
        var label = key.replace('-', '年') + '月';
        if(!past[label]) past[label] = [];
        past[label].push(item.cloneNode(true));
        item.remove();
      }
    });
    if(!list.children.length){
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = currentMonth + '月のデータはまだありません。前月以前は下の詳細から確認できます。';
      list.appendChild(empty);
    }
    var labels = Object.keys(past).sort().reverse();
    if(labels.length){
      var pastList = ensurePastBox(targetId, pastTitle);
      labels.forEach(function(label){
        var details = document.createElement('details');
        details.className = 'item';
        details.style.display = 'block';
        var summary = document.createElement('summary');
        summary.className = 'date';
        summary.style.cursor = 'pointer';
        summary.textContent = label + 'の詳細（' + past[label].length + '件）';
        var inner = document.createElement('div');
        inner.className = 'list';
        inner.style.marginTop = '10px';
        past[label].forEach(function(node){inner.appendChild(node);});
        details.appendChild(summary);
        details.appendChild(inner);
        pastList.appendChild(details);
      });
    }
    setTimeout(function(){delete list.dataset.monthFiltered;}, 50);
  }
  function labelCurrentMonthCards(){
    document.querySelectorAll('.salesCard .label').forEach(function(el){
      if(el.textContent.includes('今月') && !el.textContent.includes('（'+currentMonth+'月）')){
        el.textContent = el.textContent.replace('今月', '今月（'+currentMonth+'月）');
      }
    });
  }
  function addSalesNote(){
    var panel = document.querySelector('#view-sales .salesPanel');
    if(!panel || document.getElementById('uber-sales-note')) return;
    var note = document.createElement('div');
    note.id = 'uber-sales-note';
    note.className = 'notice';
    note.innerHTML = '<b>合算売上：</b> POS売上（登録分） + Uber受取待ち/支払い予定 + Tipで計算します。<br><b>利益：</b> 合算売上からガソリン代を引いて計算します。過去分のPOS明細に入っているTipも反映されます。<br><b>差異：</b> Uber受取待ち/支払い予定は、手元の現金ではないため最終差異には反映しません。<br><b>マイナス入力：</b> 支払い予定は -537 のように半角マイナスを付けて入力してください。';
    panel.appendChild(note);
  }
  function fixUberMinusInput(){
    var input = document.getElementById('uberPending');
    if(!input || input.dataset.minusReady === '1') return;
    input.dataset.minusReady = '1';
    input.setAttribute('type','text');
    input.setAttribute('inputmode','text');
    input.setAttribute('pattern','-?[0-9]*');
    input.setAttribute('placeholder','受取待ち: 3000 / 支払い: -1000');
    input.addEventListener('input', function(){
      var v = input.value.replace(/[−－ー―]/g, '-').replace(/[^0-9-]/g, '');
      if(v.indexOf('-') > 0) v = v.replace(/-/g, '');
      if(v.length > 1) v = v.charAt(0) + v.slice(1).replace(/-/g, '');
      if(input.value !== v){
        input.value = v;
        input.dispatchEvent(new Event('input', {bubbles:true}));
      }
    });
  }
  function run(){
    ensureDefaultButton();
    autoApplyStartDefaults();
    filterMonthList('historyList', '前月以前の履歴');
    filterMonthList('salesHistoryList', '前月以前の売上詳細');
    labelCurrentMonthCards();
    addSalesNote();
    fixUberMinusInput();
  }
  var timer = null;
  var observer = new MutationObserver(function(){
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  window.addEventListener('DOMContentLoaded', function(){
    run();
    if(document.body) observer.observe(document.body, {childList:true, subtree:true});
    setTimeout(run, 400);
    setTimeout(run, 1200);
  });
})();
</script>
`;
  html = html.replace("</body>", inject + "</body>");
  return new Response(html, response);
}
