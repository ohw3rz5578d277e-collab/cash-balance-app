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
  var LATESTKEY='cash_balance_app_latest_open_v1';

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
  function countSection(record,section){
    var counts=record&&record.counts&&record.counts[section]?record.counts[section]:{};
    return DENOMS.reduce(function(total,d){return total+money(counts[String(d)])*d},0);
  }
  function countTips(record){
    var total=0;
    var items=Array.isArray(record&&record.posItems)?record.posItems:[];
    items.forEach(function(x){total+=money(x&&x.tip)});
    return total+countSection(record,'tips');
  }
  function cashDifference(record){
    var end=countSection(record,'end');
    var hasEnd=end>0||!!(record&&record.endTime);
    if(!hasEnd)return null;
    var start=countSection(record,'start');
    var received=countSection(record,'received');
    var exchange=countSection(record,'exchange');
    var tips=countTips(record);
    var posItems=Array.isArray(record&&record.posItems)?record.posItems:[];
    var gasItems=Array.isArray(record&&record.gasItems)?record.gasItems:[];
    var posSales=posItems.reduce(function(total,x){return total+money(x&&x.sale)},0);
    var gas=gasItems.reduce(function(total,x){return total+money(x&&x.cost)},0);
    var bank=money(record&&record.uberPending);
    var expected=start+posSales+received+tips+exchange-gas-bank;
    return end-expected;
  }
  function draftBox(){
    try{return JSON.parse(localStorage.getItem(DRAFTKEY)||'{}')||{}}
    catch(e){return{}}
  }
  function draftState(){
    var box=draftBox();
    return box&&box.state?box.state:null;
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
  function ensureCard(cards,id,label,value,sub){
    var card=document.getElementById(id);
    if(!card){
      card=document.createElement('div');
      card.id=id;
      card.className='salesCard';
      cards.appendChild(card);
    }
    card.innerHTML='<div class="label">'+label+'</div><div class="value '+(Number(value)<0?'bad':'')+'">'+yen(value)+'</div><div class="sub">'+sub+'</div>';
  }
  function ensureTextCard(cards,id,label,value,sub){
    var card=document.getElementById(id);
    if(!card){
      card=document.createElement('div');
      card.id=id;
      card.className='salesCard';
      cards.appendChild(card);
    }
    card.innerHTML='<div class="label">'+label+'</div><div class="value">'+value+'</div><div class="sub">'+sub+'</div>';
  }
  function formatDate(date){
    var p=String(date||'').slice(0,10).split('-');
    return p.length===3?p[0]+'/'+p[1]+'/'+p[2]:String(date||'');
  }
  function renderDifferenceComment(items){
    var memo=document.getElementById('analysisMemo');
    if(!memo)return;
    var old=document.getElementById('analysisDifferenceComment');
    if(!items.length){
      if(old)old.remove();
      return;
    }
    if(!old){
      old=document.createElement('div');
      old.id='analysisDifferenceComment';
      old.style.cssText='margin-top:12px;padding-top:12px;border-top:1px solid #dbe3ec';
      memo.appendChild(old);
    }
    var positive=items.filter(function(x){return x.diff>0});
    var negative=items.filter(function(x){return x.diff<0});
    var html='<b>差異が出た場合の確認コメント</b>';
    html+='<div style="margin-top:8px;font-size:12px;color:#667085">差異が発生した日：'+items.map(function(x){return formatDate(x.date)+'（'+(x.diff>0?'+':'')+yen(x.diff)+'）'}).join('、')+'</div>';
    html+='<ul style="margin:9px 0 0;padding-left:20px">';
    if(positive.length){
      html+='<li><b>プラス差異の主な原因候補：</b>現金売上やチップの入力漏れ、受取金・両替の入力漏れ、お釣りを少なく渡した、終了時の紙幣・硬貨を多く数えた可能性があります。</li>';
    }
    if(negative.length){
      html+='<li><b>マイナス差異の主な原因候補：</b>お釣りの渡し過ぎ、売上の重複・過大入力、ガソリン代や銀行入金の入力漏れ、未記録の現金取り出し、終了時の紙幣・硬貨を少なく数えた可能性があります。</li>';
    }
    html+='<li><b>確認順：</b>POS明細の日付と金額 → お釣り → ガソリン・銀行入金 → 開始時と終了時の金種枚数、の順に確認してください。</li>';
    html+='</ul>';
    old.innerHTML=html;
  }
  async function renderExtraTotals(){
    var cards=document.getElementById('analysisCards');
    var start=document.getElementById('analysisStart');
    var end=document.getElementById('analysisEnd');
    if(!cards||!start||!end||!start.value||!end.value)return;
    var rows=await loadRecords();
    var tips=0,diff=0,positive=0,negative=0,diffDays=0,closedDays=0,diffItems=[];
    rows.forEach(function(r){
      if(!inRange(r.date,start.value,end.value))return;
      tips+=countTips(r);
      var d=cashDifference(r);
      if(d===null)return;
      closedDays++;
      diff+=d;
      if(d>0){positive+=d;diffDays++;diffItems.push({date:r.date,diff:d})}
      if(d<0){negative+=d;diffDays++;diffItems.push({date:r.date,diff:d})}
    });
    diffItems.sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))});
    ensureCard(cards,'analysisTipTotalCard','チップ合計',tips,'選択期間のチップ');
    ensureCard(cards,'analysisDiffTotalCard','差異合計',diff,'終了時入力済みの合計');
    ensureCard(cards,'analysisPositiveDiffCard','プラス差異',positive,'理論値より多かった現金');
    ensureCard(cards,'analysisNegativeDiffCard','マイナス差異',negative,'理論値より少なかった現金');
    ensureTextCard(cards,'analysisDiffDaysCard','差異発生日数',diffDays+'日 / '+closedDays+'日','終了時入力済み');
    renderDifferenceComment(diffItems);
  }
  function renderPosDateTimes(){
    var host=document.getElementById('posList');
    if(!host)return;
    var dateInput=document.getElementById('workDate');
    var state=draftState();
    var date=(dateInput&&dateInput.value)||(state&&state.date)||'';
    if(!date)return;
    Array.prototype.forEach.call(host.children,function(item){
      if(!item||!item.querySelector)return;
      var text=String(item.textContent||'');
      var match=text.match(/(?:^|\s)([01]?\d|2[0-3]):[0-5]\d(?:\s|$)/);
      var time=match?match[0].trim():'';
      var label='入力日時：'+formatDate(date)+(time?' '+time:'');
      var badge=item.querySelector('.cb-pos-datetime');
      if(!badge){
        badge=document.createElement('span');
        badge.className='badge ok cb-pos-datetime';
        var row=item.querySelector('.row2')||item.querySelector('.itemMain')||item;
        row.appendChild(badge);
      }
      if(badge.textContent!==label)badge.textContent=label;
    });
  }
  function newestRecord(rows){
    return rows.filter(function(r){return r&&r.date}).sort(function(a,b){
      var dateCompare=String(b.date||'').slice(0,10).localeCompare(String(a.date||'').slice(0,10));
      if(dateCompare)return dateCompare;
      return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''));
    })[0]||null;
  }
  var latestBusy=false;
  async function openLatestRecord(){
    var pin=localStorage.getItem(PINKEY)||'';
    var main=document.getElementById('mainArea');
    if(!pin||!main||main.classList.contains('hidden')||latestBusy)return false;
    latestBusy=true;
    try{
      var rows=await loadRecords();
      var latest=newestRecord(rows);
      if(!latest)return true;
      var token=String(latest.id||'')+'|'+String(latest.date||'')+'|'+String(latest.updatedAt||latest.createdAt||'');
      var current=draftState();
      var same=current&&String(current.id||'')===String(latest.id||'')&&String(current.date||'').slice(0,10)===String(latest.date||'').slice(0,10);
      sessionStorage.setItem(LATESTKEY,token);
      if(!same){
        var box=draftBox();
        box.state=latest;
        box.updatedAt=new Date().toISOString();
        localStorage.setItem(DRAFTKEY,JSON.stringify(box));
        location.reload();
      }
      return true;
    }catch(e){return false}
    finally{latestBusy=false}
  }
  var timer=null;
  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(function(){renderExtraTotals();renderPosDateTimes()},180);
  }
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('change',schedule,true);
  document.addEventListener('click',function(e){
    schedule();
    if(e.target&&e.target.id==='loginButton')setTimeout(openLatestRecord,500);
  },true);
  window.addEventListener('DOMContentLoaded',function(){
    schedule();
    var attempts=0;
    var startup=setInterval(function(){
      attempts++;
      openLatestRecord().then(function(done){if(done||attempts>=12)clearInterval(startup)});
    },500);
    setTimeout(renderExtraTotals,700);
    setTimeout(renderPosDateTimes,700);
    setTimeout(renderExtraTotals,1600);
    setTimeout(renderPosDateTimes,1600);
  });
})();
</script>`;
  html = html.replace('</body>', patch + '</body>');
  return new Response(html, response);
}
