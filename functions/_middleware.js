export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  let html = await response.text();
  html = html.replace(`.posSubBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px}`, `.posSubBtns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}`);

  const inject = `
<style>
#bottomNav{opacity:0!important;pointer-events:none!important;height:0!important;overflow:hidden!important;padding:0!important;border:0!important}
body.cb-analysis-active .bottomsum{display:none!important}
.cb-menu-button{position:fixed;left:12px;top:76px;z-index:90;width:42px;height:42px;border-radius:14px;border:1px solid #e5e7eb;background:#fff;color:#111827;font-size:22px;font-weight:950;box-shadow:0 8px 22px rgba(15,23,42,.10)}
body.pos-active .cb-menu-button{top:70px}.cb-menu-panel{position:fixed;left:12px;top:124px;z-index:91;width:min(280px,calc(100vw - 24px));background:#fff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 20px 45px rgba(15,23,42,.18);padding:10px;display:none}.cb-menu-panel.open{display:block}.cb-menu-item{width:100%;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;color:#111827;padding:12px;font-size:13px;font-weight:950;text-align:left;margin-top:7px}
.cb-custom-nav{position:fixed;left:50%;bottom:0;z-index:80;transform:translateX(-50%);width:min(1100px,100%);padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,.98);border-top:1px solid #e5e7eb;backdrop-filter:blur(16px)}.cb-custom-nav-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}.cb-nav-btn{border:1px solid #e5e7eb;border-radius:14px;background:#fff;color:#374151;padding:6px 1px;font-size:9.5px;font-weight:950;min-height:46px;line-height:1.1}.cb-nav-btn .ico{display:block;font-size:16px;margin-bottom:3px}.cb-nav-btn.active{background:#111827;color:#fff;border-color:#111827}body{padding-bottom:76px!important}.analysis-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.cb-filter{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 12px}.cb-filter input,.cb-filter select{border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#fff;font-weight:800}.cb-filter button{grid-column:1/-1;border-radius:14px;padding:12px;background:#111827;color:#fff;font-weight:950}.cb-chart{margin-top:12px;border:1px solid #e5e7eb;border-radius:18px;padding:14px;background:#fff}.cb-combo-svg{min-width:560px;width:100%;height:260px}.cb-combo-wrap{overflow-x:auto}.cb-dot{display:inline-block;width:10px;height:10px;border-radius:999px;margin-right:4px}.cb-dot.sales{background:#111827}.cb-dot.time{background:#0ea5e9}
</style>
<script>
(function(){
'use strict';
var PINKEY='cash_balance_app_pin_v21',DRAFTKEY='cash_balance_app_draft_v21',API='/api/records';
var DENOMS=[10000,5000,2000,1000,500,100,50,10,5,1];
function yen(n){n=Math.round(Number(n||0));return '¥'+n.toLocaleString('ja-JP')}
function money(v){var n=Math.floor(Number(v||0));return Number.isFinite(n)&&n>0?n:0}
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function nowHM(){var d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function getDraft(){try{return JSON.parse(localStorage.getItem(DRAFTKEY)||'{}')||{}}catch(e){return{}}}
function defaultCounts(){var sections=['start','received','tips','exchange','end'],c={};sections.forEach(function(s){c[s]={};DENOMS.forEach(function(d){c[s][String(d)]=0})});return c}
function stateFromDraft(){var box=getDraft(),s=box.state||{};if(!s.id)s.id='rec_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);if(!s.date)s.date=(document.getElementById('workDate')&&document.getElementById('workDate').value)||today();if(!s.counts)s.counts=defaultCounts();if(!Array.isArray(s.posItems))s.posItems=[];if(!Array.isArray(s.gasItems))s.gasItems=[];var ds=document.getElementById('dailySales');if(ds)s.dailySales=money(ds.value);s.uberPending=0;return s}
function amountText(t){return Number(String(t||'').replace(/[^0-9-]/g,'')||0)}
async function saveRecord(s){var pin=localStorage.getItem(PINKEY)||'';if(!pin)return;try{await fetch(API,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','x-app-pin':pin},body:JSON.stringify({record:s})})}catch(e){}}
async function manualTip(){
 var sale=amountText(document.getElementById('posSaleView')&&document.getElementById('posSaleView').textContent);
 var paid=amountText(document.getElementById('posPaidView')&&document.getElementById('posPaidView').textContent);
 var change=Math.max(0,paid-sale);
 if(!sale||!paid||change<=0){alert('チップ指定できるおつりがありません。');return}
 var input=prompt('何円チップにしますか？'+String.fromCharCode(10)+'現在のおつり：'+change.toLocaleString('ja-JP')+'円',change%1000||'');
 if(input===null)return;
 var tip=Math.floor(Number(String(input).replace(/[^0-9]/g,''))||0);
 if(tip<=0){alert('1円以上で入力してください。');return}
 if(tip>change){alert('チップはおつり以下で入力してください。');return}
 var remain=change-tip;
 var s=stateFromDraft(),memo=(document.getElementById('posMemo')&&document.getElementById('posMemo').value)||'';
 var now=new Date().toISOString(); if(!s.createdAt)s.createdAt=now; s.updatedAt=now;
 s.posItems.push({id:'pos_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),sale:sale,paid:paid,change:remain,tip:tip,memo:memo,time:nowHM(),createdAt:now});
 var box=getDraft(); box.state=s; box.pos={mode:'sale',sale:'',paid:'',memo:'',tip:0}; box.currentView='pos'; box.updatedAt=now; localStorage.setItem(DRAFTKEY,JSON.stringify(box));
 await saveRecord(s);
 alert('登録しました：チップ '+yen(tip)+' / おつり '+yen(remain));
 location.reload();
}
function ensureTipButton(){var area=document.querySelector('.posSubBtns');if(!area)return;area.style.gridTemplateColumns='1fr 1fr 1fr';var old=document.getElementById('tipFractionButton');if(old)old.remove();var clear=document.getElementById('clearPosButton'),btn=document.getElementById('tipAmountButton');if(!btn){btn=document.createElement('button');btn.id='tipAmountButton';btn.type='button';btn.className='postip';btn.textContent='チップ指定';if(clear)area.insertBefore(btn,clear);else area.appendChild(btn)}btn.textContent='チップ指定';btn.onclick=function(e){e.preventDefault();e.stopPropagation();manualTip()}}
function ensureDefaultButton(){var view=document.getElementById('view-start');if(!view||document.getElementById('start-default-cash-button'))return;var defaults={10000:0,5000:1,2000:0,1000:10,500:8,100:15,50:10,10:15,5:10,1:15};var btn=document.createElement('button');btn.id='start-default-cash-button';btn.type='button';btn.className='btn lightbtn';btn.textContent='デフォルト値を反映';btn.style.cssText='width:100%;margin:0 0 12px';btn.onclick=function(){Object.keys(defaults).forEach(function(d){var i=document.getElementById('start-'+d);if(i){i.value=defaults[d];i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))}})};var first=view.querySelector('.money')||view.querySelector('.mrow');if(first)first.insertAdjacentElement('beforebegin',btn);else view.prepend(btn)}
function openView(v){document.body.classList.toggle('cb-analysis-active',v==='analysis');if(v==='analysis'){ensureAnalysis();document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active')});document.getElementById('view-analysis').classList.add('active');setActive(v);renderAnalysis();return}var b=document.querySelector('#bottomNav .navbtn[data-view="'+v+'"]');if(b)b.click();setActive(v)}
function setActive(v){document.querySelectorAll('.cb-nav-btn').forEach(function(b){b.classList.toggle('active',b.dataset.cbView===v)})}
function ensureNav(){if(!document.getElementById('cb-custom-nav')){var nav=document.createElement('nav');nav.id='cb-custom-nav';nav.className='cb-custom-nav';nav.innerHTML='<div class="cb-custom-nav-grid"><button class="cb-nav-btn active" data-cb-view="home"><span class="ico">⌂</span>ホーム</button><button class="cb-nav-btn" data-cb-view="start"><span class="ico">💴</span>開始時</button><button class="cb-nav-btn" data-cb-view="pos"><span class="ico">🧾</span>POS</button><button class="cb-nav-btn" data-cb-view="sales"><span class="ico">📊</span>売上</button><button class="cb-nav-btn" data-cb-view="end"><span class="ico">✓</span>終了時</button><button class="cb-nav-btn" data-cb-view="analysis"><span class="ico">▦</span>分析</button></div>';document.body.appendChild(nav);nav.onclick=function(e){var b=e.target.closest('[data-cb-view]');if(b)openView(b.dataset.cbView)}}if(!document.getElementById('cb-menu-button')){var mb=document.createElement('button');mb.id='cb-menu-button';mb.className='cb-menu-button';mb.type='button';mb.textContent='☰';document.body.appendChild(mb);var p=document.createElement('div');p.id='cb-menu-panel';p.className='cb-menu-panel';p.innerHTML='<button class="cb-menu-item" data-v="received">受取金</button><button class="cb-menu-item" data-v="tips">チップ</button><button class="cb-menu-item" data-v="exchange">両替</button><button class="cb-menu-item" data-v="gas">ガソリン</button><button class="cb-menu-item" data-a="reloadButton">最新読込</button><button class="cb-menu-item" data-a="logoutButton">ログアウト</button>';document.body.appendChild(p);mb.onclick=function(){p.classList.toggle('open')};p.onclick=function(e){var it=e.target.closest('.cb-menu-item');if(!it)return;p.classList.remove('open');if(it.dataset.v)openView(it.dataset.v);if(it.dataset.a){var x=document.getElementById(it.dataset.a);if(x)x.click()}}}}
function totalCounts(s,sec){var c=s.counts&&s.counts[sec]?s.counts[sec]:{};return DENOMS.reduce(function(sum,d){return sum+money(c[String(d)])*d},0)}function calc(s){var pos=Array.isArray(s.posItems)?s.posItems:[],gas=Array.isArray(s.gasItems)?s.gasItems:[];var ps=pos.reduce(function(a,x){return a+money(x.sale)},0),tip=pos.reduce(function(a,x){return a+money(x.tip)},0)+totalCounts(s,'tips'),gc=gas.reduce(function(a,x){return a+money(x.cost)},0),app=money(s.dailySales);return{sales:app+tip,profit:app+tip-gc,cash:ps+tip,gas:gc,tips:tip}}
function ensureAnalysis(){if(document.getElementById('view-analysis'))return;var main=document.getElementById('mainArea');if(!main)return;var sec=document.createElement('section');sec.className='view';sec.id='view-analysis';sec.innerHTML='<section class="panel salesPanel"><div class="head"><div><h2>分析</h2><div class="help">売上は縦棒、稼働時間は折れ線です。</div></div></div><div class="analysis-grid" id="analysisCards"></div><div id="analysisCharts"></div></section>';main.appendChild(sec)}
function renderAnalysis(){ensureAnalysis();var s=stateFromDraft(),c=calc(s),cards=document.getElementById('analysisCards'),charts=document.getElementById('analysisCharts');if(cards)cards.innerHTML='<div class="salesCard month"><div class="label">売上</div><div class="value">'+yen(c.sales)+'</div></div><div class="salesCard profit"><div class="label">利益</div><div class="value">'+yen(c.profit)+'</div></div><div class="salesCard"><div class="label">現金</div><div class="value">'+yen(c.cash)+'</div></div><div class="salesCard"><div class="label">ガソリン</div><div class="value">'+yen(c.gas)+'</div></div>';if(charts)charts.innerHTML='<div class="cb-chart"><b>売上・稼働時間グラフ</b><div class="cb-combo-wrap"><svg class="cb-combo-svg" viewBox="0 0 560 240"><rect x="80" y="60" width="70" height="140" rx="6" fill="#111827"></rect><polyline points="80,160 180,120 280,150 380,90 480,130" fill="none" stroke="#0ea5e9" stroke-width="5" stroke-linecap="round"/><text x="80" y="225" font-size="12">現在</text><text x="10" y="30" font-size="12" font-weight="900">黒=売上 / 青=稼働時間</text></svg></div></div>'}
function hideUber(){var i=document.getElementById('uberPending');if(i){i.value='0';var w=i.closest('div');if(w)w.style.display='none'}}
function syncVis(){var main=document.getElementById('mainArea'),ok=main&&!main.classList.contains('hidden');['cb-custom-nav','cb-menu-button'].forEach(function(id){var e=document.getElementById(id);if(e)e.style.display=ok?'':'none'})}
function run(){ensureNav();ensureTipButton();ensureDefaultButton();ensureAnalysis();hideUber();syncVis()}
var t=null,obs=new MutationObserver(function(){clearTimeout(t);t=setTimeout(run,120)});window.addEventListener('DOMContentLoaded',function(){run();if(document.body)obs.observe(document.body,{childList:true,subtree:true});setTimeout(run,500);setTimeout(run,1500)})
})();
</script>`;

  html = html.replace("</body>", inject + "</body>");
  return new Response(html, response);
}
