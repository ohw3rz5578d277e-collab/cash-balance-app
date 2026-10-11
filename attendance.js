(function(){
'use strict';
if(window.__cashAttendanceBundleLoaded)return;
window.__cashAttendanceBundleLoaded=true;
var v='20261011-history1';
function add(src,next){var s=document.createElement('script');s.src=src;s.async=false;if(next)s.onload=next;(document.head||document.documentElement).appendChild(s)}
if(document.readyState==='loading'){
  document.write('<script src="/attendance-core.js?v='+v+'"><\/script>');
  document.write('<script src="/history-manager.js?v='+v+'"><\/script>');
}else{
  add('/attendance-core.js?v='+v,function(){add('/history-manager.js?v='+v)});
}
})();
