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

  const inject = `
<script>
(function(){
  'use strict';

  function yen(n){
    n = Math.round(Number(n || 0));
    return '¥' + n.toLocaleString('ja-JP');
  }
  function amount(text){
    return Number(String(text || '').replace(/[^0-9-]/g, '') || 0);
  }
  function clickKey(k){
    var b = document.querySelector('.key[data-key="' + k + '"]');
    if(b) b.click();
  }
  function typeAmount(n){
    String(Math.max(0, Math.floor(Number(n || 0)))).split('').forEach(function(ch){ clickKey(ch); });
  }
  function setPaid(n){
    var paid = document.querySelector('.modeBtn[data-mode="paid"]');
    if(paid) paid.click();
    clickKey('C');
    typeAmount(n);
  }
  function manualTip(){
    var sale = amount(document.getElementById('posSaleView') && document.getElementById('posSaleView').textContent);
    var paid = amount(document.getElementById('posPaidView') && document.getElementById('posPaidView').textContent);
    var change = Math.max(0, paid - sale);
    if(!sale || !paid || change <= 0){
      alert('チップ指定できるおつりがありません。');
      return;
    }
    var suggested = change % 1000 || '';
    var input = prompt('何円チップにしますか？\n現在のおつり：' + change.toLocaleString('ja-JP') + '円', suggested);
    if(input === null) return;
    var tip = Math.floor(Number(String(input).replace(/[^0-9]/g, '')) || 0);
    if(tip <= 0){ alert('1円以上で入力してください。'); return; }
    if(tip > change){ alert('チップはおつり以下で入力してください。'); return; }
    var tipBtn = document.getElementById('tipChangeButton');
    if(!tipBtn){ alert('Tipボタンが見つかりません。'); return; }

    setPaid(sale + tip);
    setTimeout(function(){
      tipBtn.click();
      setTimeout(function(){ setPaid(paid); }, 120);
    }, 120);
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

  function parseMoney(text){
    var m = String(text || '').replace(/,/g, '').match(/-?¥?\s*(-?\d+)/);
    return m ? Number(m[1]) : 0;
  }
  function cardValueByLabel(root, label){
    if(!root) return 0;
    var cards = Array.from(root.querySelectorAll('.salesCard'));
    for(var i=0;i<cards.length;i++){
      var l = cards[i].querySelector('.label');
      if(l && l.textContent.indexOf(label) >= 0){
        var v = cards[i].querySelector('.value');
        return parseMoney(v && v.textContent);
      }
    }
    return 0;
  }
  function workMinutes(){
    var s = document.getElementById('startTime') && document.getElementById('startTime').value;
    var e = document.getElementById('endTime') && document.getElementById('endTime').value;
    if(!s || !e) return 0;
    var sp = s.split(':').map(Number);
    var ep = e.split(':').map(Number);
    var sm = (sp[0] || 0) * 60 + (sp[1] || 0);
    var em = (ep[0] || 0) * 60 + (ep[1] || 0);
    if(em < sm) em += 24 * 60;
    return Math.max(0, em - sm);
  }
  function addWageCards(){
    var dash = document.querySelector('#view-sales .salesDash');
    if(!dash) return;
    var minutes = workMinutes();
    var profit = cardValueByLabel(dash, '今月') || cardValueByLabel(dash, '期間利益') || 0;
    if(!profit) profit = cardValueByLabel(dash, '今日の利益') || 0;
    var hourly = minutes > 0 ? profit / (minutes / 60) : 0;
    var minutely = minutes > 0 ? profit / minutes : 0;

    var h = document.getElementById('sales-hourly-card');
    if(!h){
      h = document.createElement('div');
      h.id = 'sales-hourly-card';
      h.className = 'salesCard profit';
      dash.appendChild(h);
    }
    h.innerHTML = '<div class="label">時給</div><div class="value">' + yen(hourly) + '</div><div class="sub">ホームの開始・終了時刻から計算</div>';

    var m = document.getElementById('sales-minutely-card');
    if(!m){
      m = document.createElement('div');
      m.id = 'sales-minutely-card';
      m.className = 'salesCard profit';
      dash.appendChild(m);
    }
    m.innerHTML = '<div class="label">分給</div><div class="value">' + yen(minutely) + '</div><div class="sub">稼働時間 ' + minutes + '分</div>';
  }

  function run(){
    ensureTipButton();
    addWageCards();
  }

  var timer = null;
  var obs = new MutationObserver(function(){
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  window.addEventListener('DOMContentLoaded', function(){
    run();
    if(document.body) obs.observe(document.body, {childList:true, subtree:true});
    setTimeout(run, 500);
    setTimeout(run, 1500);
  });
})();
</script>
`;

  html = html.replace("</body>", inject + "</body>");
  return new Response(html, response);
}
