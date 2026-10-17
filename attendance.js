(function(){
'use strict';
if(window.__cashAttendanceBundleLoaded)return;
window.__cashAttendanceBundleLoaded=true;
var v='20261017-homestable1';
var ORDER=[
  ['home','⌂','ホーム'],
  ['start','💴','開始時'],
  ['pos','🧾','POS'],
  ['sales','📊','売上'],
  ['end','✓','終了時'],
  ['attendance','⏱','勤怠'],
  ['analysis','▥','分析']
];

function add(src,next){var s=document.createElement('script');s.src=src;s.async=false;if(next)s.onload=next;(document.head||document.documentElement).appendChild(s)}
function ensureStyle(){if(document.getElementById('cb-canonical-nav-style'))return;var st=document.createElement('style');st.id='cb-canonical-nav-style';st.textContent='#cb-pos-rescue-nav{display:none!important}.bottomsum{display:none!important}#cb-custom-nav[hidden]{display:none!important}#cb-custom-nav,.cb-custom-nav{visibility:visible!important;opacity:1!important;pointer-events:auto!important;position:fixed!important;left:50%!important;right:auto!important;bottom:0!important;transform:translateX(-50%)!important;width:min(1100px,100%)!important;height:auto!important;overflow:visible!important;z-index:2147483000!important;box-sizing:border-box!important}#cb-custom-nav .cb-custom-nav-grid{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:4px!important}#cb-custom-nav .cb-nav-btn{min-width:0!important;padding:6px 1px!important;font-size:8.5px!important;min-height:48px!important;line-height:1.05!important}#cb-custom-nav .cb-nav-btn .ico{display:block!important;font-size:15px!important;margin-bottom:3px!important}body.pos-active #cb-menu-button{display:none!important}body.pos-active .posbox,body.pos-active #view-pos{padding-bottom:calc(92px + env(safe-area-inset-bottom,0px))!important}@media(max-width:430px){#cb-custom-nav{padding:8px 5px calc(8px + env(safe-area-inset-bottom,0px))!important}#cb-custom-nav .cb-nav-btn{border-radius:11px!important;font-size:8px!important}}';(document.head||document.documentElement).appendChild(st)}
function appVisible(){var main=document.getElementById('mainArea');return !!(main&&!main.classList.contains('hidden'))}
function actualView(){if(document.body&&document.body.classList.contains('pos-active'))return 'pos';var active=document.querySelector('.view.active');if(active&&active.id&&active.id.indexOf('view-')===0)return active.id.slice(5);return 'home'}
function buttonHtml(x){return '<button type="button" class="cb-nav-btn" data-cb-view="'+x[0]+'"><span class="ico">'+x[1]+'</span>'+x[2]+'</button>'}
function ensureSevenButtons(){var nav=document.getElementById('cb-custom-nav');if(!nav)return null;var grid=nav.querySelector('.cb-custom-nav-grid');if(!grid)return null;var buttons=grid.querySelectorAll('.cb-nav-btn');var complete=buttons.length===7&&ORDER.every(function(x){return !!grid.querySelector('[data-cb-view="'+x[0]+'"]')});if(!complete)grid.innerHTML=ORDER.map(buttonHtml).join('');grid.style.setProperty('grid-template-columns','repeat(7,minmax(0,1fr))','important');nav.hidden=!appVisible();return nav}
function syncActive(){var v=actualView();document.querySelectorAll('#cb-custom-nav .cb-nav-btn').forEach(function(b){b.classList.toggle('active',b.dataset.cbView===v)})}
function openNative(v){var b=document.querySelector('#bottomNav .navbtn[data-view="'+v+'"]');if(!b)return false;b.click();return true}
function openAttendance(){var detail=document.getElementById('attDetail');if(detail){detail.click();return true}var view=document.getElementById('view-attendance');if(!view)return false;document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active')});view.classList.add('active');if(document.body)document.body.classList.remove('pos-active');if(typeof window.scrollTo==='function')window.scrollTo({top:0,behavior:'smooth'});return true}
function openAnalysis(nav,button){if(nav&&typeof nav.onclick==='function'){nav.onclick({target:button});return true}var view=document.getElementById('view-analysis');if(view){document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active')});view.classList.add('active');if(document.body)document.body.classList.remove('pos-active');return true}return false}
function route(v,nav,button){if(v==='attendance')return openAttendance();if(v==='analysis')return openAnalysis(nav,button);return openNative(v)}
function bind(){var nav=ensureSevenButtons();if(!nav)return;if(nav.dataset.cbCanonicalBound!=='1'){nav.dataset.cbCanonicalBound='1';nav.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('.cb-nav-btn[data-cb-view]'):null;if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();route(b.dataset.cbView,nav,b);setTimeout(syncActive,0);setTimeout(syncActive,80);setTimeout(syncActive,250)},true)}syncActive()}
function removeOldRescue(){var r=document.getElementById('cb-pos-rescue-nav');if(r)r.remove();var s=document.getElementById('cb-navigation-rescue-style');if(s)s.remove();if(document.body)document.body.classList.remove('cb-pos-rescue-visible')}
function stabilize(){ensureStyle();removeOldRescue();bind()}
function watchNavigation(){stabilize();setTimeout(stabilize,100);setTimeout(stabilize,400);setTimeout(stabilize,1000);document.addEventListener('click',function(){setTimeout(stabilize,0)},true);if(document.body&&window.MutationObserver){new MutationObserver(function(){setTimeout(stabilize,0)}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})}}
function startModules(){add('/attendance-core.js?v='+v,function(){add('/history-manager.js?v='+v,function(){add('/attendance-history.js?v='+v,function(){add('/ui-stability.js?v='+v,function(){stabilize()})})})})}
if(document.readyState==='loading'){
  document.write('<script src="/attendance-core.js?v='+v+'"><\/script>');
  document.write('<script src="/history-manager.js?v='+v+'"><\/script>');
  document.write('<script src="/attendance-history.js?v='+v+'"><\/script>');
  document.write('<script src="/ui-stability.js?v='+v+'"><\/script>');
  document.addEventListener('DOMContentLoaded',watchNavigation,{once:true})
}else{startModules();watchNavigation()}
})();
