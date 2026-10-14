(function(){
'use strict';
if(window.__cashAttendanceBundleLoaded)return;
window.__cashAttendanceBundleLoaded=true;
var v='20261014-history3';

function ensureNavigationRescueStyle(){
  if(document.getElementById('cb-navigation-rescue-style'))return;
  var st=document.createElement('style');
  st.id='cb-navigation-rescue-style';
  st.textContent='body.pos-active #cb-custom-nav,body.pos-active .cb-custom-nav{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;position:fixed!important;left:50%!important;right:auto!important;bottom:0!important;transform:translateX(-50%)!important;width:min(1100px,100%)!important;height:auto!important;overflow:visible!important;z-index:2147483000!important}body.pos-active #cb-menu-button,body.pos-active .cb-menu-button{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;z-index:2147483001!important}body.pos-active .wrap{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))!important}body.pos-active .posbox{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))!important}.cb-nav-rescue{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(1100px,100%);padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,.98);border-top:1px solid #e5e7eb;z-index:2147483000}.cb-nav-rescue .cb-custom-nav-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.cb-nav-rescue .cb-nav-btn{border:1px solid #e5e7eb;border-radius:14px;background:#fff;color:#374151;padding:6px 1px;font-size:9.5px;font-weight:950;min-height:46px;line-height:1.1}.cb-nav-rescue .cb-nav-btn .ico{display:block;font-size:16px;margin-bottom:3px}.cb-nav-rescue .cb-nav-btn.active{background:#111827;color:#fff;border-color:#111827}';
  (document.head||document.documentElement).appendChild(st);
}
function activateRescueButton(v){
  var nav=document.getElementById('cb-custom-nav');
  if(nav)nav.querySelectorAll('.cb-nav-btn').forEach(function(b){b.classList.toggle('active',b.dataset.cbView===v)});
}
function openNativeView(v){
  var nativeBtn=document.querySelector('#bottomNav .navbtn[data-view="'+v+'"]');
  if(nativeBtn){nativeBtn.click();activateRescueButton(v);return}
  var existing=document.querySelector('.cb-nav-btn[data-cb-view="'+v+'"]:not([data-cb-rescue])');
  if(existing){existing.click();activateRescueButton(v)}
}
function ensureNavigationPresent(){
  ensureNavigationRescueStyle();
  var nav=document.getElementById('cb-custom-nav');
  if(!nav){
    nav=document.createElement('nav');
    nav.id='cb-custom-nav';
    nav.className='cb-custom-nav cb-nav-rescue';
    nav.innerHTML='<div class="cb-custom-nav-grid"><button type="button" class="cb-nav-btn active" data-cb-view="home" data-cb-rescue="1"><span class="ico">⌂</span>ホーム</button><button type="button" class="cb-nav-btn" data-cb-view="start" data-cb-rescue="1"><span class="ico">💴</span>開始時</button><button type="button" class="cb-nav-btn" data-cb-view="pos" data-cb-rescue="1"><span class="ico">🧾</span>POS</button><button type="button" class="cb-nav-btn" data-cb-view="sales" data-cb-rescue="1"><span class="ico">📊</span>売上</button><button type="button" class="cb-nav-btn" data-cb-view="end" data-cb-rescue="1"><span class="ico">✓</span>終了時</button></div>';
    document.body.appendChild(nav);
    nav.addEventListener('click',function(e){var b=e.target.closest('[data-cb-rescue]');if(b)openNativeView(b.dataset.cbView)});
  }
  if(document.body.classList.contains('pos-active')){
    nav.style.setProperty('display','block','important');
    nav.style.setProperty('visibility','visible','important');
    nav.style.setProperty('opacity','1','important');
    nav.style.setProperty('pointer-events','auto','important');
    var menu=document.getElementById('cb-menu-button');
    if(menu){menu.style.setProperty('display','block','important');menu.style.setProperty('visibility','visible','important');menu.style.setProperty('opacity','1','important')}
    activateRescueButton('pos');
  }
}
function watchNavigation(){
  ensureNavigationPresent();
  setTimeout(ensureNavigationPresent,250);
  setTimeout(ensureNavigationPresent,900);
  if(document.body&&window.MutationObserver){
    new MutationObserver(function(){ensureNavigationPresent()}).observe(document.body,{attributes:true,attributeFilter:['class']});
  }
}
function add(src,next){var s=document.createElement('script');s.src=src;s.async=false;if(next)s.onload=next;(document.head||document.documentElement).appendChild(s)}
if(document.readyState==='loading'){
  document.write('<script src="/attendance-core.js?v='+v+'"><\/script>');
  document.write('<script src="/history-manager.js?v='+v+'"><\/script>');
  document.write('<script src="/attendance-history.js?v='+v+'"><\/script>');
  document.addEventListener('DOMContentLoaded',watchNavigation,{once:true});
}else{
  add('/attendance-core.js?v='+v,function(){add('/history-manager.js?v='+v,function(){add('/attendance-history.js?v='+v)})});
  watchNavigation();
}
})();
