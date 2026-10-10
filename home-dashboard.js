(function(){
'use strict';
/* Production gate markers kept intentionally:
#view-home{display:none}
#view-home.active{display:flex;flex-direction:column;gap:12px}
*/

function forgetDeletedRecord(id){
  if(typeof window.__cashForgetDeletedRecord==='function'){
    try{window.__cashForgetDeletedRecord(id)}catch(e){}
  }
}
window.__cashDeletingRecordId=window.__cashDeletingRecordId||'';

function ensureStyle(){
  if(document.getElementById('cash-ui-stability-style'))return;
  var s=document.createElement('style');
  s.id='cash-ui-stability-style';
  s.textContent='\
#statusText{box-sizing:border-box;min-width:92px;max-width:92px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
#cbNewRecordDock{margin:0 0 10px 0;padding:0 14px}\
#cbNewRecordDock button{width:100%;min-height:48px;border-radius:14px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-weight:900;font-size:15px}\
#cbNewRecordDock button:active{transform:scale(.985)}\
';
  document.head.appendChild(s);
}

function ensureNewRecordDock(){
  var home=document.getElementById('view-home');
  var summary=document.getElementById('cbHomeSummary');
  var legacy=document.getElementById('newButton');
  if(!home||!summary||!legacy)return;
  var dock=document.getElementById('cbNewRecordDock');
  if(!dock){
    dock=document.createElement('div');
    dock.id='cbNewRecordDock';
    var btn=document.createElement('button');
    btn.type='button';
    btn.textContent='＋ 新規作成';
    btn.onclick=function(){legacy.click()};
    dock.appendChild(btn);
  }
  if(dock.parentNode!==home||dock.previousElementSibling!==summary){
    summary.insertAdjacentElement('afterend',dock);
  }
}

function keepStatusStable(){
  var el=document.getElementById('statusText');
  if(!el)return;
  var full=String(el.textContent||'').trim();
  if(full)el.title=full;
}

var queued=false;
function refresh(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(function(){
    queued=false;
    ensureStyle();
    ensureNewRecordDock();
    keepStatusStable();
  });
}

window.addEventListener('DOMContentLoaded',function(){
  refresh();
  setTimeout(refresh,250);
  setTimeout(refresh,900);
});
window.addEventListener('online',refresh);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')refresh()});

var obs=new MutationObserver(function(muts){
  for(var i=0;i<muts.length;i++){
    var m=muts[i];
    if(m.type==='childList'||m.type==='characterData'){
      refresh();
      break;
    }
  }
});
if(document.documentElement)obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

})();
