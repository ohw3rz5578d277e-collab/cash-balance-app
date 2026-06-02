export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  let html = await response.text();

  // ------------------------------------------------------
  // Runtime HTML/JS patch
  // - Move Uber pending/payment input from Home to Sales tab
  // - Treat combined sales as POS cash sales + Uber receivable/payment
  // - Keep cash difference calculation unchanged
  // ------------------------------------------------------
  const replacements = [
    [
      `<div><label>Uber受取待ち / 支払い予定</label><input id="uberPending" type="number" inputmode="numeric" placeholder="受取待ち: 3000 / 支払い: -1000"></div>`,
      ``
    ],
    [
      `<div class="salesInputGrid"><div><label>日付</label><input id="salesDateMirror" type="date"></div><div><label>その日のアプリ売上</label><input id="dailySales" type="number" inputmode="numeric" placeholder="例：12800"></div><div><label>売上メモ</label><input id="salesMemo" placeholder="例：雨 / クエスト込み"></div></div>`,
      `<div class="salesInputGrid"><div><label>日付</label><input id="salesDateMirror" type="date"></div><div><label>Uberアプリ売上（確認用）</label><input id="dailySales" type="number" inputmode="numeric" placeholder="例：12800"></div><div><label>Uber受取待ち / 支払い予定</label><input id="uberPending" type="number" inputmode="numeric" placeholder="受取待ち: 3000 / 支払い: -1000"></div><div><label>売上メモ</label><input id="salesMemo" placeholder="例：雨 / クエスト込み"></div></div>`
    ],
    [
      `<b>利益：</b> アプリ売上 − ガソリン代。月・週・日で自動集計します。`,
      `<b>利益：</b> 合算売上（POS売上 + Uber受取待ち/支払い予定）− ガソリン代。月・週・日で自動集計します。`
    ],
    [
      `@media(min-width:760px){.grid{grid-template-columns:repeat(4,1fr)}.salesInputGrid{grid-template-columns:1fr 1fr 1fr}.expenseGrid{grid-template-columns:1fr 1fr 1fr 1.2fr}}`,
      `@media(min-width:760px){.grid{grid-template-columns:repeat(4,1fr)}.salesInputGrid{grid-template-columns:repeat(4,1fr)}.expenseGrid{grid-template-columns:1fr 1fr 1fr 1.2fr}}`
    ],
    [
      `sales=posSales+received+tips,dailySales=money(r.dailySales),appProfit=dailySales-gasCost,expected=start+sales+exchange-gasCost-uber;`,
      `sales=posSales+received+tips,uberIncome=uber,dailySales=money(r.dailySales),combinedSales=posSales+uberIncome,appProfit=combinedSales-gasCost,expected=start+sales+exchange-gasCost-uber;`
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
      `salesCard('今日の合算売上',d.sales,'POS売上 + Uber受取/支払い','')+salesCard('今日の利益',d.profit,'合算売上 − ガソリン','profit')+salesCard('今週の合算売上',w.sales,'POS + Uberを週集計','')+salesCard('今週の利益',w.profit,'週合算売上 − 週ガソリン','profit')+salesCard('今月の合算売上',m.sales,'POS + Uberを月集計','month')+salesCard('今月の利益',m.profit,'月合算売上 − 月ガソリン','profit')`
    ],
    [
      `アプリ売上 '+yen(c.dailySales)+' / ガソリン`,
      `合算売上 '+yen(c.combinedSales)+' / Uber確認 '+yen(c.dailySales)+' / ガソリン`
    ],
    [
      `アプリ売上 '+yen(c.dailySales)+' / 差異`,
      `合算売上 '+yen(c.combinedSales)+' / 差異`
    ],
    [
      `青・紫・緑系カードはアプリ売上入力用です。金種管理とは別で集計します。`,
      `青・紫・緑系カードは売上集計用です。POS売上とUber受取/支払い予定を合算して表示します。`
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
  function monthKeyFromText(text){
    var m = String(text||'').match(/(\\d{4})年(\\d{1,2})月/);
    if(!m) return '';
    return m[1] + '-' + String(m[2]).padStart(2,'0');
  }
  function currentKey(){return currentYear + '-' + String(currentMonth).padStart(2,'0');}
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
    note.innerHTML = '<b>合算売上：</b> POS売上（登録分） + Uber受取待ち/支払い予定で計算します。支払い予定はマイナスで入力してください。';
    panel.appendChild(note);
  }
  function run(){
    filterMonthList('historyList', '前月以前の履歴');
    filterMonthList('salesHistoryList', '前月以前の売上詳細');
    labelCurrentMonthCards();
    addSalesNote();
  }
  var timer = null;
  var observer = new MutationObserver(function(){
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  window.addEventListener('DOMContentLoaded', function(){
    run();
    observer.observe(document.body, {childList:true, subtree:true});
  });
})();
</script>
`;
  html = html.replace("</body>", inject + "</body>");
  return new Response(html, response);
}
