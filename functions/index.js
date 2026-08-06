export async function onRequest(context) {
  const response = await context.next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;

  let html = await response.text();
  const patch = `
<script>
(function(){
'use strict';
var PINKEY='cash_balance_app_pin_v21',DRAFTKEY='cash_balance_app_draft_v21',API='/api/records';
var OUTBOXKEY='cash_balance_app_save_outbox_v1';
var DENOMS=[10000,5000,2000,1000,500,100,50,10,5,1];
var startupDone=false,startupBusy=false,analysisBusy=false,analysisCache=null;
var flushBusy=false,flushTimer=null,lastPosCount=-1,retryStep=0;
function money(v){var n=Math.floor(Number(v||0));return Number.isFinite(n)&&n>0?n:0}
function signed(v){var n=Math.floor(Number(v||0));return Number.isFinite(n)?n:0}
function yen(n){return '¥'+Math.round(Number(n||0)).toLocaleString('ja-JP')}
function draftBox(){try{return JSON.parse(localStorage.getItem(DRAFTKEY)||'{}')||{}}catch(e){return{}}}
function draftState(){var b=draftBox();return b&&b.state?b.state:null}
function readOutbox(){try{var x=JSON.parse(localStorage.getItem(OUTBOXKEY)||'{}');return x&&typeof x==='object'?x:{}}catch(e){return{}}}
function writeOutbox(x){try{nativeSetItem.call(localStorage,OUTBOXKEY,JSON.stringify(x||{}))}catch(e){}}
function outboxCount(){return Object.keys(readOutbox()).length}
function recordSignature(r){return [String(r&&r.id||''),String(r&&r.updatedAt||''),String(r&&r.date||''),Array.isArray(r&&r.posItems)?r.posItems.length:0,Array.isArray(r&&r.gasItems)?r.gasItems.length:0].join('|')}
function setSaveStatus(ok,text){var el=document.getElementById('statusText');if(!el)return;el.textContent=text;if(ok)el.classList.add('ok');else el.classList.remove('ok')}
function queueRecord(r,immediate){if(!r||!r.id)return;var box=readOutbox();box[String(r.id)]={record:JSON.parse(JSON.stringify(r)),signature:recordSignature(r),queuedAt:new Date().toISOString(),attempts:0};writeOutbox(box);setSaveStatus(false,immediate?'POS保存中…':'保存待ち');scheduleFlush(immediate?0:250)}
function scheduleFlush(ms){clearTimeout(flushTimer);flushTimer=setTimeout(flushOutbox,Math.max(0,ms||0))}
async function postRecord(r,keepalive){var pin=localStorage.getItem(PINKEY)||'';if(!pin)throw new Error('PINなし');var res=await fetch(API,{method:'POST',cache:'no-store',keepalive:!!keepalive,headers:{'content-type':'application/json','x-app-pin':pin},body:JSON.stringify({record:r})});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)throw new Error(data.error||('保存エラー '+res.status));return data}
async function flushOutbox(){if(flushBusy)return;var pin=localStorage.getItem(PINKEY)||'';if(!pin)return;var box=readOutbox(),ids=Object.keys(box);if(!ids.length){retryStep=0;setSaveStatus(true,'同期済み');return}flushBusy=true;setSaveStatus(false,'保存中…');try{for(var i=0;i<ids.length;i++){var id=ids[i],entry=box[id];if(!entry||!entry.record)continue;await postRecord(entry.record,false);var latest=readOutbox(),now=latest[id];if(now&&now.signature===entry.signature){delete latest[id];writeOutbox(latest)}}retryStep=0;if(outboxCount()===0)setSaveStatus(true,'同期済み');else scheduleFlush(200)}catch(e){retryStep=Math.min(retryStep+1,4);var waits=[1000,3000,10000,30000,60000];setSaveStatus(false,'未送信 '+outboxCount()+'件');scheduleFlush(waits[retryStep-1]||60000)}finally{flushBusy=false}}
function emergencyFlush(){var box=readOutbox(),ids=Object.keys(box);if(!ids.length)return;ids.slice(0,3).forEach(function(id){var e=box[id];if(e&&e.record)postRecord(e.record,true).catch(function(){})})}
var nativeSetItem=Storage.prototype.setItem;
if(!window.__cashSaveGuardInstalled){window.__cashSaveGuardInstalled=true;Storage.prototype.setItem=function(key,value){nativeSetItem.call(this,key,value);if(this!==localStorage||key!==DRAFTKEY)return;try{var parsed=JSON.parse(value||'{}'),r=parsed&&parsed.state;if(!r||!r.id)return;var count=Array.isArray(r.posItems)?r.posItems.length:0;var posAdded=lastPosCount>=0&&count>lastPosCount;lastPosCount=count;queueRecord(r,posAdded)}catch(e){}}}
function seedCurrentDraft(){var r=draftState();if(!r)return;lastPosCount=Array.isArray(r.posItems)?r.posItems.length:0;if(outboxCount())scheduleFlush(0)}
function countSection(r,k){var c=r&&r.counts&&r.counts[k]?r.counts[k]:{};return DENOMS.reduce(function(s,d){return s+money(c[String(d)])*d},0)}
function countTips(r){var a=Array.isArray(r&&r.posItems)?r.posItems:[],v=0;a.forEach(function(x){v+=money(x&&x.tip)});return v+countSection(r,'tips')}
function difference(r){if(!r)return null;var end=countSection(r,'end');if(!(end>0||r.endTime))return null;var pos=Array.isArray(r.posItems)?r.posItems:[],gas=Array.isArray(r.gasItems)?r.gasItems:[];var sales=pos.reduce(function(s,x){return s+money(x&&x.sale)},0);var gasCost=gas.reduce(function(s,x){return s+money(x&&x.cost)},0);var expected=countSection(r,'start')+sales+countSection(r,'received')+countTips(r)+countSection(r,'exchange')-gasCost-signed(r.uberPending);return end-expected}
function formatDate(v){var s=String(v||'').slice(0,10),p=s.split('-');if(p.length!==3)return s;var d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));return p[0]+'/'+p[1]+'/'+p[2]+'（'+'日月火水木金土'.charAt(d.getDay())+'）'}
async function fetchRows(limit){var pin=localStorage.getItem(PINKEY)||'';if(!pin)return [];var res=await fetch(API+'?limit='+limit+'&ts='+Date.now(),{cache:'no-store',headers:{'x-app-pin':pin}});var data=await res.json();return Array.isArray(data.records)?data.records:[]}
function newest(rows){return rows.filter(function(r){return r&&r.date}).sort(function(a,b){var dc=String(b.date||'').slice(0,10).localeCompare(String(a.date||'').slice(0,10));return dc||String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))})[0]||null}
async function openLatest(){var main=document.getElementById('mainArea');if(startupDone||startupBusy||outboxCount()>0||!main||main.classList.contains('hidden'))return;startupBusy=true;try{var rows=await fetchRows(100),cur=draftState();if(cur)rows.push(cur);var latest=newest(rows);if(latest&&(!cur||String(cur.id)!==String(latest.id)||String(cur.date).slice(0,10)!==String(latest.date).slice(0,10))){var box=draftBox();box.state=latest;box.updatedAt=new Date().toISOString();nativeSetItem.call(localStorage,DRAFTKEY,JSON.stringify(box));location.reload();return}startupDone=true}catch(e){startupDone=true}finally{startupBusy=false}}
function findPosPanel(){var hs=document.querySelectorAll('#view-home h2,#view-home h3');for(var i=0;i<hs.length;i++){if(String(hs[i].textContent||'').replace(/\\s/g,'')==='POS明細')return hs[i].closest('.panel')||hs[i].parentElement}return null}
function renderPosDates(){var panel=findPosPanel(),s=draftState();if(!panel||!s)return;var rows=panel.querySelectorAll('.item'),items=Array.isArray(s.posItems)?s.posItems:[],date=formatDate(s.date);rows.forEach(function(row,i){var p=items[i]||{},time=String(p.time||'');var label=date+(time?' '+time:'');var target=row.querySelector('.row2')||row.querySelector('.itemMain')||row;var old=target.querySelector('.cb-pos-datetime');if(!old){old=document.createElement('span');old.className='cb-pos-datetime';old.style.cssText='display:block;width:100%;margin-top:3px;font-size:12px;color:#475467;font-weight:800';target.appendChild(old)}old.textContent='入力日時：'+label})}
function renderHomeDifference(){var home=document.getElementById('view-home');if(!home)return;var box=document.getElementById('homeDifferenceComment'),s=draftState(),d=difference(s);if(d===null||d===0){if(box)box.remove();return}if(!box){box=document.createElement('section');box.id='homeDifferenceComment';box.className='panel';var pos=findPosPanel();if(pos)pos.insertAdjacentElement('afterend',box);else home.appendChild(box)}var cause=d>0?'現金売上・チップ・受取金・両替の入力漏れ、お釣りを少なく渡した、終了時の金種を多く数えた可能性があります。':'お釣りの渡し過ぎ、売上の重複・過大入力、ガソリン代・銀行入金の入力漏れ、未記録の現金取り出し、終了時の金種を少なく数えた可能性があります。';box.innerHTML='<div class="head"><div><h2>差異の確認</h2><div class="help">'+formatDate(s&&s.date)+' の記録</div></div><div class="total '+(d<0?'bad':'good')+'">'+(d>0?'+':'')+yen(d)+'</div></div><div class="notice"><b>考えられる原因：</b>'+cause+'</div><div class="small"><b>確認順：</b>POS明細の日付と金額 → お釣り → ガソリン・銀行入金 → 開始時・終了時の金種枚数</div>'}
function ensureCard(cards,id,label,value,sub,text){var c=document.getElementById(id);if(!c){c=document.createElement('div');c.id=id;c.className='salesCard';cards.appendChild(c)}c.innerHTML='<div class="label">'+label+'</div><div class="value '+(!text&&Number(value)<0?'bad':'')+'">'+(text?value:yen(value))+'</div><div class="sub">'+sub+'</div>'}
async function renderAnalysisExtras(){var cards=document.getElementById('analysisCards'),st=document.getElementById('analysisStart'),ed=document.getElementById('analysisEnd');if(!cards||!st||!ed||!st.value||!ed.value||analysisBusy)return;analysisBusy=true;try{if(!analysisCache)analysisCache=await fetchRows(5000);var cur=draftState(),rows=analysisCache.slice();if(cur){var i=rows.findIndex(function(r){return r.id===cur.id});if(i>=0)rows[i]=cur;else rows.push(cur)}var tips=0,total=0,pos=0,neg=0,days=0,closed=0;rows.forEach(function(r){var date=String(r.date||'').slice(0,10);if(date<st.value||date>ed.value)return;tips+=countTips(r);var d=difference(r);if(d===null)return;closed++;total+=d;if(d>0){pos+=d;days++}if(d<0){neg+=d;days++}});ensureCard(cards,'analysisTipTotalCard','チップ合計',tips,'選択期間のチップ');ensureCard(cards,'analysisDiffTotalCard','差異合計',total,'終了時入力済みの合計');ensureCard(cards,'analysisPositiveDiffCard','プラス差異',pos,'理論値より多かった現金');ensureCard(cards,'analysisNegativeDiffCard','マイナス差異',neg,'理論値より少なかった現金');ensureCard(cards,'analysisDiffDaysCard','差異発生日数',days+'日 / '+closed+'日','終了時入力済み',true)}catch(e){}finally{analysisBusy=false}}
var timer=null;function schedule(){clearTimeout(timer);timer=setTimeout(function(){renderPosDates();renderHomeDifference();renderAnalysisExtras();openLatest()},100)}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('change',function(){analysisCache=null;schedule()},true);
document.addEventListener('click',function(){schedule();setTimeout(function(){var r=draftState(),n=Array.isArray(r&&r.posItems)?r.posItems.length:0;if(n>lastPosCount){lastPosCount=n;queueRecord(r,true)}},0)},true);
window.addEventListener('online',function(){scheduleFlush(0)});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')emergencyFlush();else scheduleFlush(0)});
window.addEventListener('pagehide',emergencyFlush);
window.addEventListener('DOMContentLoaded',function(){seedCurrentDraft();schedule();setTimeout(schedule,400);setTimeout(schedule,1000);setTimeout(flushOutbox,100)});
})();
</script>`;
  html = html.replace('</body>', patch + '</body>');
  const headers = new Headers(response.headers);
  headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
