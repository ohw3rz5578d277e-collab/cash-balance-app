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
var DENOMS=[10000,5000,2000,1000,500,100,50,10,5,1];
var startupDone=false,startupBusy=false,analysisBusy=false,analysisCache=null;
function money(v){var n=Math.floor(Number(v||0));return Number.isFinite(n)&&n>0?n:0}
function signed(v){var n=Math.floor(Number(v||0));return Number.isFinite(n)?n:0}
function yen(n){return '¥'+Math.round(Number(n||0)).toLocaleString('ja-JP')}
function draftBox(){try{return JSON.parse(localStorage.getItem(DRAFTKEY)||'{}')||{}}catch(e){return{}}}
function draftState(){var b=draftBox();return b&&b.state?b.state:null}
function countSection(r,k){var c=r&&r.counts&&r.counts[k]?r.counts[k]:{};return DENOMS.reduce(function(s,d){return s+money(c[String(d)])*d},0)}
function countTips(r){var a=Array.isArray(r&&r.posItems)?r.posItems:[],v=0;a.forEach(function(x){v+=money(x&&x.tip)});return v+countSection(r,'tips')}
function difference(r){if(!r)return null;var end=countSection(r,'end');if(!(end>0||r.endTime))return null;var pos=Array.isArray(r.posItems)?r.posItems:[],gas=Array.isArray(r.gasItems)?r.gasItems:[];var sales=pos.reduce(function(s,x){return s+money(x&&x.sale)},0);var gasCost=gas.reduce(function(s,x){return s+money(x&&x.cost)},0);var expected=countSection(r,'start')+sales+countSection(r,'received')+countTips(r)+countSection(r,'exchange')-gasCost-signed(r.uberPending);return end-expected}
function formatDate(v){var s=String(v||'').slice(0,10),p=s.split('-');if(p.length!==3)return s;var d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));return p[0]+'/'+p[1]+'/'+p[2]+'（'+'日月火水木金土'.charAt(d.getDay())+'）'}
async function fetchRows(limit){var pin=localStorage.getItem(PINKEY)||'';if(!pin)return [];var res=await fetch(API+'?limit='+limit+'&ts='+Date.now(),{cache:'no-store',headers:{'x-app-pin':pin}});var data=await res.json();return Array.isArray(data.records)?data.records:[]}
function newest(rows){return rows.filter(function(r){return r&&r.date}).sort(function(a,b){var dc=String(b.date||'').slice(0,10).localeCompare(String(a.date||'').slice(0,10));return dc||String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))})[0]||null}
async function openLatest(){var main=document.getElementById('mainArea');if(startupDone||startupBusy||!main||main.classList.contains('hidden'))return;startupBusy=true;try{var rows=await fetchRows(100),cur=draftState();if(cur)rows.push(cur);var latest=newest(rows);if(latest&&(!cur||String(cur.id)!==String(latest.id)||String(cur.date).slice(0,10)!==String(latest.date).slice(0,10))){var box=draftBox();box.state=latest;box.updatedAt=new Date().toISOString();localStorage.setItem(DRAFTKEY,JSON.stringify(box));location.reload();return}startupDone=true}catch(e){startupDone=true}finally{startupBusy=false}}
function findPosPanel(){var hs=document.querySelectorAll('#view-home h2,#view-home h3');for(var i=0;i<hs.length;i++){if(String(hs[i].textContent||'').replace(/\s/g,'')==='POS明細')return hs[i].closest('.panel')||hs[i].parentElement}return null}
function renderPosDates(){var panel=findPosPanel(),s=draftState();if(!panel||!s)return;var rows=panel.querySelectorAll('.item'),items=Array.isArray(s.posItems)?s.posItems:[],date=formatDate(s.date);rows.forEach(function(row,i){var p=items[i]||{},time=String(p.time||'');var label=date+(time?' '+time:'');var target=row.querySelector('.row2')||row.querySelector('.itemMain')||row;var old=target.querySelector('.cb-pos-datetime');if(!old){old=document.createElement('span');old.className='cb-pos-datetime';old.style.cssText='display:block;width:100%;margin-top:3px;font-size:12px;color:#475467;font-weight:800';target.appendChild(old)}old.textContent='入力日時：'+label})}
function renderHomeDifference(){var home=document.getElementById('view-home');if(!home)return;var box=document.getElementById('homeDifferenceComment'),s=draftState(),d=difference(s);if(d===null||d===0){if(box)box.remove();return}if(!box){box=document.createElement('section');box.id='homeDifferenceComment';box.className='panel';var pos=findPosPanel();if(pos)pos.insertAdjacentElement('afterend',box);else home.appendChild(box)}var cause=d>0?'現金売上・チップ・受取金・両替の入力漏れ、お釣りを少なく渡した、終了時の金種を多く数えた可能性があります。':'お釣りの渡し過ぎ、売上の重複・過大入力、ガソリン代・銀行入金の入力漏れ、未記録の現金取り出し、終了時の金種を少なく数えた可能性があります。';box.innerHTML='<div class="head"><div><h2>差異の確認</h2><div class="help">'+formatDate(s&&s.date)+' の記録</div></div><div class="total '+(d<0?'bad':'good')+'">'+(d>0?'+':'')+yen(d)+'</div></div><div class="notice"><b>考えられる原因：</b>'+cause+'</div><div class="small"><b>確認順：</b>POS明細の日付と金額 → お釣り → ガソリン・銀行入金 → 開始時・終了時の金種枚数</div>'}
function ensureCard(cards,id,label,value,sub,text){var c=document.getElementById(id);if(!c){c=document.createElement('div');c.id=id;c.className='salesCard';cards.appendChild(c)}c.innerHTML='<div class="label">'+label+'</div><div class="value '+(!text&&Number(value)<0?'bad':'')+'">'+(text?value:yen(value))+'</div><div class="sub">'+sub+'</div>'}
async function renderAnalysisExtras(){var cards=document.getElementById('analysisCards'),st=document.getElementById('analysisStart'),ed=document.getElementById('analysisEnd');if(!cards||!st||!ed||!st.value||!ed.value||analysisBusy)return;analysisBusy=true;try{if(!analysisCache)analysisCache=await fetchRows(5000);var cur=draftState(),rows=analysisCache.slice();if(cur){var i=rows.findIndex(function(r){return r.id===cur.id});if(i>=0)rows[i]=cur;else rows.push(cur)}var tips=0,total=0,pos=0,neg=0,days=0,closed=0;rows.forEach(function(r){var date=String(r.date||'').slice(0,10);if(date<st.value||date>ed.value)return;tips+=countTips(r);var d=difference(r);if(d===null)return;closed++;total+=d;if(d>0){pos+=d;days++}if(d<0){neg+=d;days++}});ensureCard(cards,'analysisTipTotalCard','チップ合計',tips,'選択期間のチップ');ensureCard(cards,'analysisDiffTotalCard','差異合計',total,'終了時入力済みの合計');ensureCard(cards,'analysisPositiveDiffCard','プラス差異',pos,'理論値より多かった現金');ensureCard(cards,'analysisNegativeDiffCard','マイナス差異',neg,'理論値より少なかった現金');ensureCard(cards,'analysisDiffDaysCard','差異発生日数',days+'日 / '+closed+'日','終了時入力済み',true)}catch(e){}finally{analysisBusy=false}}
var timer=null;function schedule(){clearTimeout(timer);timer=setTimeout(function(){renderPosDates();renderHomeDifference();renderAnalysisExtras();openLatest()},100)}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('change',function(){analysisCache=null;schedule()},true);
document.addEventListener('click',schedule,true);
window.addEventListener('DOMContentLoaded',function(){schedule();setTimeout(schedule,400);setTimeout(schedule,1000)});
})();
</script>`;
  html = html.replace('</body>', patch + '</body>');
  const headers = new Headers(response.headers);
  headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
