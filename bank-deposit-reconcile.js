(function(){
'use strict';
var DRAFTKEY='cash_balance_app_draft_v21',PINKEY='cash_balance_app_pin_v21',API='/api/records';
var overlapCache=null,overlapBusy=false;
function num(v){var n=Math.floor(Number(v));return Number.isFinite(n)?n:0}
function yen(v){return '¥'+Math.abs(Math.round(num(v))).toLocaleString('ja-JP')}
function signedYen(v){var n=Math.round(num(v));return (n>0?'+':n<0?'-':'')+yen(n)}
function text(v){return v===undefined||v===null?'':String(v).trim()}
function readBox(){try{return JSON.parse(localStorage.getItem(DRAFTKEY)||'{}')||{}}catch(e){return{}}}
function state(){var b=readBox();return b&&b.state?b.state:null}
function hasValue(s,key){return !!s&&s[key]!==undefined&&s[key]!==null&&String(s[key])!==''}
function registered(s){return Math.max(0,num(s&&s.uberPending))}
function keep(s){return hasValue(s,'bankDepositKeep')?Math.max(0,num(s.bankDepositKeep)):0}
function spent(s){return hasValue(s,'bankDepositSpent')?Math.max(0,num(s.bankDepositSpent)):0}
function actual(s){return hasValue(s,'bankDepositActual')?Math.max(0,num(s.bankDepositActual)):null}
function periodStart(s){return text(s&&s.bankDepositPeriodStart).slice(0,10)}
function periodEnd(s){return text(s&&s.bankDepositPeriodEnd).slice(0,10)}
function periodLabel(s){var a=periodStart(s),b=periodEnd(s);if(!a&&!b)return '未設定';if(a&&b)return a+' 〜 '+b;return (a||'未設定')+' 〜 '+(b||'未設定')}
function result(s,overlap){
  var target=registered(s),k=keep(s),sp=spent(s),act=actual(s),ps=periodStart(s),pe=periodEnd(s);
  var over=Math.max(0,k+sp-target),planned=Math.max(0,target-k-sp),effectiveActual=act===null?planned:act,diff=act===null?null:act-planned,removed=effectiveActual+sp,hand=Math.max(0,target-removed);
  var kind='none',message='銀行入金の登録はありません';
  if(target){
    if(!ps||!pe){kind='pending';message='入金対象の開始日と終了日を入力してください';}
    else if(ps>pe){kind='ng';message='入金対象期間の開始日と終了日が逆になっています';}
    else if(overlap){kind='ng';message='すでに入金済みの対象期間と重なっています';}
    else if(over>0){kind='ng';message='手元に残す金額＋先に使った金額が対象額を超えています';}
    else if(act===null){kind='pending';message='実際に銀行へ入金した金額を入力してください';}
    else if(diff===0){kind='ok';message='対象期間・入金予定額・実際の入金額を確認済みです';}
    else {kind='ng';message='入金予定額と実際の入金額が一致していません';}
  }
  return{kind:kind,target:target,keep:k,spent:sp,planned:planned,act:act,diff:diff,removed:removed,hand:hand,over:over,text:message,period:periodLabel(s),periodStart:ps,periodEnd:pe,overlap:overlap};
}
function saveNumberField(key,value){var box=readBox(),s=box.state;if(!s)return;var raw=String(value==null?'':value).trim();if(raw==='')delete s[key];else s[key]=Math.max(0,num(raw));touch(box,s)}
function saveTextField(key,value){var box=readBox(),s=box.state;if(!s)return;var raw=text(value);if(raw==='')delete s[key];else s[key]=raw;s.updatedAt=new Date().toISOString();touch(box,s)}
function touch(box,s){s.updatedAt=new Date().toISOString();box.state=s;box.updatedAt=s.updatedAt;localStorage.setItem(DRAFTKEY,JSON.stringify(box));overlapCache=null}
function card(label,value,sub,cls){return '<div class="salesCard '+(cls||'')+'"><div class="label">'+label+'</div><div class="value">'+value+'</div><div class="sub">'+sub+'</div></div>'}
function numberField(id,label,placeholder){return '<div><label for="'+id+'">'+label+'</label><input id="'+id+'" type="number" inputmode="numeric" min="0" step="1" placeholder="'+placeholder+'"></div>'}
function dateField(id,label){return '<div><label for="'+id+'">'+label+'</label><input id="'+id+'" type="date"></div>'}
function ensurePanel(){var view=document.getElementById('view-exchange');if(!view)return null;var panel=document.getElementById('bankDepositReconcilePanel');if(!panel){panel=document.createElement('section');panel.id='bankDepositReconcilePanel';panel.className='panel';panel.innerHTML='<div class="head"><div><h2>銀行入金の照合</h2><div class="help">何日分の現金を入金するか期間を指定し、手元に残す分・先に使った分を引いて入金予定額を確認します。</div></div></div><div class="grid" id="bankDepositPeriodGrid" style="margin-top:12px">'+dateField('bankDepositPeriodStartInput','入金対象の開始日')+dateField('bankDepositPeriodEndInput','入金対象の終了日')+'</div><div class="salesDash" id="bankDepositReconcileCards" style="margin-top:12px"></div><div class="grid" id="bankDepositInputGrid" style="margin-top:12px">'+numberField('bankDepositKeepInput','手元に残す金額','例：5000')+numberField('bankDepositSpentInput','銀行入金前に先に使った金額','例：3000')+numberField('bankDepositActualInput','実際に銀行へ入金した金額','例：17000')+'</div><div id="bankDepositReconcileStatus" class="notice" style="margin-bottom:0"></div><div class="small" style="margin-top:8px"><b>計算：</b> 入金予定額 = 対象額 − 手元に残す − 先に使った額。対象期間は入金記録と一緒に保存され、過去の入金済み期間との重複も確認します。</div>';view.prepend(panel);
    [['bankDepositKeepInput','bankDepositKeep'],['bankDepositSpentInput','bankDepositSpent'],['bankDepositActualInput','bankDepositActual']].forEach(function(pair){var input=panel.querySelector('#'+pair[0]);function save(){saveNumberField(pair[1],input.value);render()}input.addEventListener('change',save);input.addEventListener('blur',save)});
    [['bankDepositPeriodStartInput','bankDepositPeriodStart'],['bankDepositPeriodEndInput','bankDepositPeriodEnd']].forEach(function(pair){var input=panel.querySelector('#'+pair[0]);input.addEventListener('change',function(){saveTextField(pair[1],input.value);render()})});
  }return panel}
function alertHtml(r){if(r.kind==='ok')return '<b>一致：</b>'+r.text+'　対象期間 '+r.period;if(r.kind==='ng'){var extra=r.over>0?'　超過 '+yen(r.over):(r.diff!==null&&r.diff!==0?'　差額 '+signedYen(r.diff):'');return '<b>要確認：</b>'+r.text+extra+'　対象期間 '+r.period}if(r.kind==='pending')return '<b>未照合：</b>'+r.text+'　対象期間 '+r.period;return '<b>銀行入金：</b>'+r.text}
function renderHomeAlert(r){var home=document.getElementById('view-home');if(!home)return;var el=document.getElementById('bankDepositHomeAlert');if(r.kind!=='ng'&&r.kind!=='pending'){if(el)el.remove();return}if(!el){el=document.createElement('div');el.id='bankDepositHomeAlert';el.className='notice';var first=home.querySelector('.panel');if(first)first.insertAdjacentElement('beforebegin',el);else home.prepend(el)}el.innerHTML=alertHtml(r)}
function renderEndAlert(r){var view=document.getElementById('view-end');if(!view)return;var el=document.getElementById('bankDepositEndAlert');if(r.kind!=='ng'&&r.kind!=='pending'){if(el)el.remove();return}if(!el){el=document.createElement('div');el.id='bankDepositEndAlert';el.className='notice';view.prepend(el)}el.innerHTML=alertHtml(r)}
function setInput(panel,id,value){var input=panel.querySelector('#'+id);if(input&&document.activeElement!==input)input.value=value===null||value===undefined?'':String(value)}
function rangesOverlap(a1,a2,b1,b2){return !!(a1&&a2&&b1&&b2&&a1<=b2&&b1<=a2)}
async function fetchRows(){var pin=localStorage.getItem(PINKEY)||'';if(!pin)return[];var res=await fetch(API+'?limit=1000&ts='+Date.now(),{cache:'no-store',headers:{'x-app-pin':pin}});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)return[];return Array.isArray(data.records)?data.records:[]}
async function findOverlap(s){var ps=periodStart(s),pe=periodEnd(s);if(!ps||!pe||ps>pe)return null;if(overlapCache&&overlapCache.key===String(s.id||'')+'|'+ps+'|'+pe)return overlapCache.value;if(overlapBusy)return null;overlapBusy=true;try{var rows=await fetchRows(),hit=null;for(var i=0;i<rows.length;i++){var r=rows[i];if(!r||String(r.id||'')===String(s.id||''))continue;if(!hasValue(r,'bankDepositActual'))continue;var a=periodStart(r),b=periodEnd(r);if(rangesOverlap(ps,pe,a,b)){hit={date:text(r.date).slice(0,10),start:a,end:b,actual:actual(r)};break}}overlapCache={key:String(s.id||'')+'|'+ps+'|'+pe,value:hit};return hit}finally{overlapBusy=false}}
async function render(){var s=state();if(!s)return;var panel=ensurePanel(),overlap=await findOverlap(s),r=result(s,overlap);if(panel){var cards=panel.querySelector('#bankDepositReconcileCards'),status=panel.querySelector('#bankDepositReconcileStatus');if(cards)cards.innerHTML=card('入金対象期間',r.period,'この期間分を今回の入金対象にする','')+card('銀行へ回す対象額',yen(r.target),'現在登録されている対象額','')+card('手元に残す',yen(r.keep),'銀行へ入れず残す現金','')+card('先に使った',yen(r.spent),'入金前に現金で使った分','')+card('入金予定額',yen(r.planned),'対象額 − 手元残し − 先使用','')+card('実際の銀行入金額',r.act===null?'未入力':yen(r.act),'銀行明細・入金票の実額','')+card('入金差額',r.diff===null?'未照合':signedYen(r.diff),r.kind==='ok'?'一致':r.kind==='ng'?'要確認':'実額を入力','')+card('手元から減った合計',yen(r.removed),'銀行入金＋先に使った額','')+card('対象額のうち手元に残る額',yen(r.hand),'実入金後の残額','');setInput(panel,'bankDepositPeriodStartInput',r.periodStart);setInput(panel,'bankDepositPeriodEndInput',r.periodEnd);setInput(panel,'bankDepositKeepInput',r.keep);setInput(panel,'bankDepositSpentInput',r.spent);setInput(panel,'bankDepositActualInput',r.act);if(status){status.innerHTML=alertHtml(r)+(overlap?'<div class="small" style="margin-top:6px">重複候補：'+overlap.start+' 〜 '+overlap.end+' / 実入金 '+yen(overlap.actual)+'</div>':'');status.style.borderColor=r.kind==='ng'?'#fecaca':r.kind==='ok'?'#bbf7d0':'#fde68a';status.style.background=r.kind==='ng'?'#fef2f2':r.kind==='ok'?'#ecfdf5':'#fffbeb';status.style.color=r.kind==='ng'?'#991b1b':r.kind==='ok'?'#065f46':'#92400e'}}renderHomeAlert(r);renderEndAlert(r)}
var queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;render()})}
document.addEventListener('input',function(e){if(e.target&&e.target.id==='uberPending')schedule()},true);
document.addEventListener('change',schedule,true);
document.addEventListener('click',schedule,true);
window.addEventListener('DOMContentLoaded',function(){render();setTimeout(render,350);setTimeout(render,1000)});
})();
