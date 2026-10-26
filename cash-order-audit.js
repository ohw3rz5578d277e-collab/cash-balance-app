(function(){
'use strict';
if(window.__cashOrderAuditLoaded)return;
window.__cashOrderAuditLoaded=true;
var KEY='cash_balance_app_draft_v21';
function box(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){return{}}}
function yen(n){return '¥'+Math.round(n).toLocaleString('ja-JP')}
function number(v){var n=Number(v);return Number.isFinite(n)?n:0}
function cash(r,k){var c=r&&r.counts&&r.counts[k]||{};return [10000,5000,2000,1000,500,100,50,10,5,1].reduce(function(s,d){return s+Math.max(0,number(c[d]))*d},0)}
function result(r){var pos=Array.isArray(r.posItems)?r.posItems:[],gas=Array.isArray(r.gasItems)?r.gasItems:[];
 var sales=pos.reduce(function(s,x){return s+Math.max(0,number(x.sale))},0);
 var tips=pos.reduce(function(s,x){return s+Math.max(0,number(x.tip))},0)+cash(r,'tips');
 var gasoline=gas.reduce(function(s,x){return s+Math.max(0,number(x.cost))},0);
 var expected=cash(r,'start')+sales+cash(r,'received')+tips+cash(r,'exchange')-gasoline-number(r.uberPending);
 var end=cash(r,'end'),closed=end>0||!!r.endTime;
 return {count:pos.length,expected:expected,diff:closed?end-expected:null,tips:tips};
}
function panel(){var settle=document.getElementById('cbSettlement');if(!settle)return null;var e=document.getElementById('cbOrderAudit');if(!e){e=document.createElement('section');e.id='cbOrderAudit';e.className='panel';e.style.cssText='padding:16px;border-radius:18px;margin-top:12px';e.innerHTML='<h2 style="font-size:17px;margin:0 0 8px">現金注文の照合</h2><p style="font-size:12px;color:#64748b;margin:0 0 12px">Uber Eatsアプリの「現金注文件数」を入力してください。POS画面の操作は変わりません。</p><label for="cbUberCashCount" style="font-size:12px;font-weight:800">Uber Eats 現金注文件数</label><input id="cbUberCashCount" type="number" min="0" step="1" inputmode="numeric" placeholder="件数を入力" style="display:block;width:100%;box-sizing:border-box;font-size:18px;padding:12px;margin:6px 0 10px;border:1px solid #cbd5e1;border-radius:12px"><div id="cbOrderAuditInfo" aria-live="polite" style="font-size:13px;line-height:1.8"></div>';
 settle.insertAdjacentElement('afterend',e);
 e.querySelector('input').addEventListener('change',function(){var raw=this.value.trim(),b=box(),r=b.state;if(!r||!r.id)return;if(raw!==''&&(!/^\d+$/.test(raw)||Number(raw)>9999)){this.setCustomValidity('0〜9999の整数を入力してください');this.reportValidity();return}this.setCustomValidity('');if(raw==='')delete r.uberCashOrderCount;else r.uberCashOrderCount=Number(raw);r.updatedAt=new Date().toISOString();b.state=r;b.updatedAt=r.updatedAt;try{localStorage.setItem(KEY,JSON.stringify(b));render()}catch(err){alert('件数を保存できませんでした。端末の空き容量を確認してください')}})}
 return e;
}
function render(){var b=box(),r=b.state,main=document.getElementById('mainArea');if(!r||!r.id||!main||main.classList.contains('hidden'))return;var e=panel();if(!e)return;var input=e.querySelector('input'),info=e.querySelector('#cbOrderAuditInfo'),a=result(r),v=r.uberCashOrderCount,has=v!==undefined&&v!==null&&String(v)!=='';
 if(document.activeElement!==input)input.value=has?String(v):'';
 var h='<div>POS登録件数：<b>'+a.count+'件</b></div>';
 if(has){var delta=number(v)-a.count;if(delta>0)h+='<div style="color:#b45309;font-weight:800">要確認：現金注文がPOSより'+delta+'件多く、入力漏れの可能性があります。</div>';else if(delta<0)h+='<div style="color:#b45309;font-weight:800">要確認：POS登録が現金注文より'+(-delta)+'件多く、二重登録または対象外明細の可能性があります。</div>';else h+='<div style="color:#047857;font-weight:800">件数一致（ただし金額までの一致は未確認）</div>'}
 else h+='<div style="color:#64748b">Uber Eatsの件数を入力すると照合できます。</div>';
 if(a.diff!==null&&a.diff!==0){h+='<div style="margin-top:8px;font-weight:800">現金差異：'+(a.diff>0?'+':'')+yen(a.diff)+'</div>';if(a.diff>0)h+='<div>確認候補：POS入力漏れ・受取金の登録漏れ・終了時の数え間違い</div>';else h+='<div>確認候補：POS重複入力・おつりの渡し間違い・金種登録ミス</div>';h+='<div style="color:#64748b;font-size:11px">候補は推定です。原因を自動確定するものではありません。</div>'}
 else if(a.diff===0)h+='<div style="color:#047857;font-weight:800;margin-top:8px">現金差異なし</div>';
 info.innerHTML=h;
}
var last='';
function changed(){var b=box(),r=b.state||{},sig=[r.id,r.updatedAt,r.uberCashOrderCount,Array.isArray(r.posItems)?r.posItems.length:0].join('|');if(sig!==last||!document.getElementById('cbOrderAudit')){last=sig;render()}}
function boot(){changed();document.addEventListener('click',function(){setTimeout(changed,150)},true);window.addEventListener('pageshow',changed);window.addEventListener('cash-attendance-saved',changed);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')changed()});setInterval(function(){if(document.visibilityState==='visible')changed()},3000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
