export async function onRequest(context) {
  const response = await context.next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;

  let html = await response.text();
  const patch = `
<script>
(function(){
  'use strict';
  var PINKEY='cash_balance_app_pin_v21';
  var DRAFTKEY='cash_balance_app_draft_v21';
  var API='/api/records';
  var DENOMS=[10000,5000,2000,1000,500,100,50,10,5,1];

  function money(v){
    var n=Math.floor(Number(v||0));
    return Number.isFinite(n)&&n>0?n:0;
  }
  function parseDate(s){
    var p=String(s||'').slice(0,10).split('-').map(Number);
    return new Date(p[0]||2000,(p[1]||1)-1,p[2]||1);
  }
  function inRange(date,start,end){
    var d=parseDate(date),s=parseDate(start),e=parseDate(end);
    s.setHours(0,0,0,0);e.setHours(23,59,59,999);
    return d>=s&&d<=e;
  }
  function countTips(record){
    var total=0;
    var items=Array.isArray(record&&record.posItems)?record.posItems:[];
    items.forEach(function(x){total+=money(x&&x.tip)});
    var counts=record&&record.counts&&record.counts.tips?record.counts.tips:{};
    DENOMS.forEach(function(d){total+=money(counts[String(d)])*d});
    return total;
  }
  function draftState(){
    try{
      var box=JSON.parse(localStorage.getItem(DRAFTKEY)||'{}');
      return box&&box.state?box.state:null;
    }catch(e){return null}
  }
  async function loadRecords(){
    var pin=localStorage.getItem(PINKEY)||'';
    var current=draftState();
    if(!pin)return current?[current]:[];
    try{
      var res=await fetch(API+'?limit=5000&ts='+Date.now(),{cache:'no-store',headers:{'x-app-pin':pin}});
      var data=await res.json();
      var rows=Array.isArray(data.records)?data.records:[];
      if(current&&current.id){
        var i=rows.findIndex(function(r){return r.id===current.id});
        if(i>=0)rows[i]=current;else rows.push(current);
      }
      return rows;
    }catch(e){return current?[current]:[]}
  }
  function yen(n){return '¥'+Math.round(Number(n||0)).toLocaleString('ja-JP')}
  async function renderTipTotal(){
    var cards=document.getElementById('analysisCards');
    var start=document.getElementById('analysisStart');
    var end=document.getElementById('analysisEnd');
    if(!cards||!start||!end||!start.value||!end.value)return;
    var rows=await loadRecords();
    var total=0;
    rows.forEach(function(r){if(inRange(r.date,start.value,end.value))total+=countTips(r)});
    var card=document.getElementById('analysisTipTotalCard');
    if(!card){
      card=document.createElement('div');
      card.id='analysisTipTotalCard';
      card.className='salesCard';
      cards.appendChild(card);
    }
    card.innerHTML='<div class="label">チップ合計</div><div class="value">'+yen(total)+'</div><div class="sub">選択期間のチップ</div>';
  }
  var timer=null;
  function schedule(){clearTimeout(timer);timer=setTimeout(renderTipTotal,180)}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('change',schedule,true);
  document.addEventListener('click',schedule,true);
  window.addEventListener('DOMContentLoaded',function(){schedule();setTimeout(renderTipTotal,700);setTimeout(renderTipTotal,1600)});
})();
</script>`;
  html = html.replace('</body>', patch + '</body>');
  return new Response(html, response);
}
