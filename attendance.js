(function(){
'use strict';
if(window.__cashAttendanceBundleLoaded)return;
window.__cashAttendanceBundleLoaded=true;
var v='20261017-historyedit1';

function ensureNavigationRescueStyle(){
  if(document.getElementById('cb-navigation-rescue-style'))return;
  var st=document.createElement('style');
  st.id='cb-navigation-rescue-style';
  st.textContent='.cb-pos-rescue-nav{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(1100px,100%);padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,.98);border-top:1px solid #e5e7eb;z-index:2147483000;box-sizing:border-box}.cb-pos-rescue-nav[hidden]{display:none!important}.cb-pos-rescue-nav .cb-custom-nav-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.cb-pos-rescue-nav .cb-nav-btn{border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#374151;padding:5px 1px;font-size:8.5px;font-weight:950;min-height:46px;line-height:1.05}.cb-pos-rescue-nav .cb-nav-btn .ico{display:block;font-size:15px;margin-bottom:3px}.cb-pos-rescue-nav .cb-nav-btn.active{background:#111827;color:#fff;border-color:#111827}body.cb-pos-rescue-visible .posbox,body.cb-pos-rescue-visible #view-pos{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))!important}';
  (document.head||document.documentElement).appendChild(st);
}
function isVisible(el){
  if(!el)return false;
  var cs=window.getComputedStyle?window.getComputedStyle(el):null;
  return !cs||(cs.display!=='none'&&cs.visibility!=='hidden');
}
function isPosActive(){
  if(document.body&&document.body.classList.contains('pos-active'))return true;
  var view=document.getElementById('view-pos');
  if(view&&(view.classList.contains('active')||view.getAttribute('aria-hidden')==='false')&&isVisible(view))return true;
  var active=document.querySelector('.view.active,[id^="view-"][class~="active"]');
  if(active&&active.id==='view-pos')return true;
  return false;
}
function activateRescueButton(v){
  var nav=document.getElementById('cb-pos-rescue-nav');
  if(nav)nav.querySelectorAll('.cb-nav-btn').forEach(function(b){b.classList.toggle('active',b.dataset.cbView===v)});
}
function openNativeView(v){
  var nativeBtn=document.querySelector('#bottomNav .navbtn[data-view="'+v+'"],#bottomNav [data-view="'+v+'"]');
  if(nativeBtn){nativeBtn.click();return}
  var existing=document.querySelector('.cb-nav-btn[data-cb-view="'+v+'"]:not([data-cb-rescue])');
  if(existing){existing.click();return}
  var generic=document.querySelector('[data-view="'+v+'"]:not([data-cb-rescue])');
  if(generic)generic.click();
}
function ensureRescueNav(){
  ensureNavigationRescueStyle();
  var nav=document.getElementById('cb-pos-rescue-nav');
  if(!nav){
    nav=document.createElement('nav');
    nav.id='cb-pos-rescue-nav';
    nav.className='cb-pos-rescue-nav';
    nav.hidden=true;
    nav.innerHTML='<div class="cb-custom-nav-grid"><button type="button" class="cb-nav-btn" data-cb-view="home" data-cb-rescue="1"><span class="ico">⌂</span>ホーム</button><button type="button" class="cb-nav-btn" data-cb-view="start" data-cb-rescue="1"><span class="ico">💴</span>開始時</button><button type="button" class="cb-nav-btn active" data-cb-view="pos" data-cb-rescue="1"><span class="ico">🧾</span>POS</button><button type="button" class="cb-nav-btn" data-cb-view="sales" data-cb-rescue="1"><span class="ico">📊</span>売上</button><button type="button" class="cb-nav-btn" data-cb-view="end" data-cb-rescue="1"><span class="ico">✓</span>終了時</button><button type="button" class="cb-nav-btn" data-cb-view="attendance" data-cb-rescue="1"><span class="ico">⏱</span>勤怠</button><button type="button" class="cb-nav-btn" data-cb-view="analysis" data-cb-rescue="1"><span class="ico">▥</span>分析</button></div>';
    document.body.appendChild(nav);
    nav.addEventListener('click',function(e){var b=e.target.closest('[data-cb-rescue]');if(b)openNativeView(b.dataset.cbView)});
  }
  var active=isPosActive();
  nav.hidden=!active;
  if(document.body)document.body.classList.toggle('cb-pos-rescue-visible',active);
  if(active)activateRescueButton('pos');
}
function watchNavigation(){
  ensureRescueNav();
  setTimeout(ensureRescueNav,250);
  setTimeout(ensureRescueNav,900);
  document.addEventListener('click',function(){setTimeout(ensureRescueNav,0)},true);
  if(document.body&&window.MutationObserver){
    new MutationObserver(function(){ensureRescueNav()}).observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
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
