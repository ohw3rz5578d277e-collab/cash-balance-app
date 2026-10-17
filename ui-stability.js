(function(){
'use strict';
if(window.__cashUiStabilityLoaded)return;
window.__cashUiStabilityLoaded=true;

var ORDER=[
  ['home','⌂','ホーム'],
  ['start','💴','開始時'],
  ['pos','🧾','POS'],
  ['sales','📊','売上'],
  ['end','✓','終了時'],
  ['attendance','⏱','勤怠'],
  ['analysis','▥','分析']
];

function ensureStyle(){
  var old=document.getElementById('cb-ui-stability-style');
  if(old)return;
  var st=document.createElement('style');
  st.id='cb-ui-stability-style';
  st.textContent='\
#cb-pos-rescue-nav{display:none!important}\
#cb-custom-nav,.cb-custom-nav{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;position:fixed!important;left:50%!important;right:auto!important;bottom:0!important;transform:translateX(-50%)!important;width:min(1100px,100%)!important;height:auto!important;overflow:visible!important;z-index:2147483000!important;box-sizing:border-box!important}\
#cb-custom-nav .cb-custom-nav-grid{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:4px!important}\
#cb-custom-nav .cb-nav-btn{min-width:0!important;padding:6px 1px!important;font-size:9px!important;min-height:48px!important}\
.bottomsum{display:none!important}\
#cb-menu-button{top:auto!important;bottom:calc(88px + env(safe-area-inset-bottom,0px))!important;left:auto!important;right:12px!important}\
#cb-menu-panel{top:auto!important;bottom:calc(140px + env(safe-area-inset-bottom,0px))!important;left:auto!important;right:12px!important}\
body.pos-active #cb-menu-button,body.pos-active #cb-menu-panel{display:none!important}\
body.pos-active .posbox,body.pos-active #view-pos{padding-bottom:calc(92px + env(safe-area-inset-bottom,0px))!important}\
@media(max-width:430px){#cb-custom-nav{padding:8px 6px calc(8px + env(safe-area-inset-bottom,0px))!important}#cb-custom-nav .cb-nav-btn{font-size:8.5px!important;border-radius:12px!important}#cb-custom-nav .cb-nav-btn .ico{font-size:15px!important;margin-bottom:3px!important}#cb-menu-button{width:40px!important;height:40px!important;border-radius:13px!important;font-size:20px!important}}';
  (document.head||document.documentElement).appendChild(st);
}

function removeRescue(){
  var r=document.getElementById('cb-pos-rescue-nav');if(r)r.remove();
  var s=document.getElementById('cb-navigation-rescue-style');if(s)s.remove();
  if(document.body)document.body.classList.remove('cb-pos-rescue-visible');
}

function buttonHtml(v,ico,label){
  return '<button type="button" class="cb-nav-btn" data-cb-view="'+v+'"><span class="ico">'+ico+'</span>'+label+'</button>';
}

function ensureCanonicalNav(){
  removeRescue();
  var nav=document.getElementById('cb-custom-nav');
  if(!nav)return false;
  var grid=nav.querySelector('.cb-custom-nav-grid');
  if(!grid)return false;
  var needs=ORDER.some(function(x){return !grid.querySelector('[data-cb-view="'+x[0]+'"]')});
  if(needs||grid.querySelectorAll('.cb-nav-btn').length!==ORDER.length){
    grid.innerHTML=ORDER.map(function(x){return buttonHtml(x[0],x[1],x[2])}).join('');
  }
  grid.style.setProperty('grid-template-columns','repeat(7,minmax(0,1fr))','important');
  return true;
}

function actualView(){
  if(document.body&&document.body.classList.contains('pos-active'))return 'pos';
  var a=document.querySelector('.view.active');
  if(a&&a.id&&a.id.indexOf('view-')===0)return a.id.slice(5);
  return 'home';
}

function syncActive(){
  var v=actualView();
  document.querySelectorAll('#cb-custom-nav .cb-nav-btn').forEach(function(b){
    b.classList.toggle('active',b.dataset.cbView===v);
  });
}

function restoreLegacyHomeFallback(home){
  if(!home)return;
  Array.prototype.forEach.call(home.children,function(x){
    if(x.id==='cbTodayDataCheck')return;
    x.style.removeProperty('display');
  });
  home.querySelectorAll('.salesDash,.salesPanel').forEach(function(x){x.style.removeProperty('display')});
}

function stabilizeHome(){
  if(actualView()!=='home')return;
  var home=document.getElementById('view-home');
  if(!home)return;
  var summary=document.getElementById('cbHomeSummary');
  if(summary){
    home.style.setProperty('display','flex','important');
    return;
  }
  if(typeof window.__cashRefreshCanonicalHome==='function'){
    try{window.__cashRefreshCanonicalHome()}catch(e){}
  }
  setTimeout(function(){
    var h=document.getElementById('view-home');
    if(!h)return;
    var s=document.getElementById('cbHomeSummary');
    if(s){h.style.setProperty('display','flex','important');return}
    restoreLegacyHomeFallback(h);
    h.style.setProperty('display','block','important');
  },180);
}

function openAttendance(){
  var detail=document.getElementById('attDetail');
  if(detail){detail.click();return true}
  var view=document.getElementById('view-attendance');
  if(view){
    document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active')});
    view.classList.add('active');
    if(document.body)document.body.classList.remove('pos-active');
    return true;
  }
  return false;
}

function openNative(v){
  var b=document.querySelector('#bottomNav .navbtn[data-view="'+v+'"]');
  if(!b)return false;
  b.click();
  return true;
}

function bindCanonicalClicks(){
  var nav=document.getElementById('cb-custom-nav');
  if(!nav||nav.dataset.cbStableBound==='1')return;
  nav.dataset.cbStableBound='1';
  nav.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('.cb-nav-btn[data-cb-view]'):null;
    if(!b)return;
    var v=b.dataset.cbView;
    if(v==='analysis'){
      setTimeout(syncActive,0);
      setTimeout(syncActive,100);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if(v==='attendance')openAttendance();else openNative(v);
    if(v==='home')setTimeout(stabilizeHome,0);
    setTimeout(syncActive,0);
    setTimeout(syncActive,100);
  },true);
}

function stabilize(){
  ensureStyle();
  if(!ensureCanonicalNav())return;
  bindCanonicalClicks();
  syncActive();
  stabilizeHome();
}

function boot(){
  stabilize();
  setTimeout(stabilize,100);
  setTimeout(stabilize,500);
  setTimeout(stabilize,1200);
  setTimeout(stabilizeHome,2200);
  setTimeout(stabilizeHome,4500);
  document.addEventListener('click',function(){setTimeout(stabilize,0)},true);
  window.addEventListener('online',function(){setTimeout(stabilizeHome,250)});
  window.addEventListener('pageshow',function(){setTimeout(stabilizeHome,100)});
  if(window.MutationObserver&&document.body){
    new MutationObserver(function(){setTimeout(stabilize,0)}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
