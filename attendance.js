(function(){
'use strict';
if(window.__cashAttendanceBundleLoaded)return;
window.__cashAttendanceBundleLoaded=true;

// Attendance bundle loader only.
// Navigation belongs to the main UI runtime; attendance-core only adds the
// attendance destination when it is not already present.
var v='20261019-attfix3';

function add(src,next){
  var s=document.createElement('script');
  s.src=src;
  s.async=false;
  if(next)s.onload=next;
  (document.head||document.documentElement).appendChild(s);
}

if(document.readyState==='loading'){
  document.write('<script src="/attendance-core.js?v='+v+'"><\/script>');
  document.write('<script src="/history-manager.js?v='+v+'"><\/script>');
  document.write('<script src="/attendance-history.js?v='+v+'"><\/script>');
}else{
  add('/attendance-core.js?v='+v,function(){
    add('/history-manager.js?v='+v,function(){
      add('/attendance-history.js?v='+v);
    });
  });
}
})();
