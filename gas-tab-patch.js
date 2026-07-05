(function(){
  function patchGasTab(){
    var grid=document.querySelector('.cb-custom-nav-grid');
    if(!grid || grid.querySelector('[data-cb-view="gas"]')) return;
    var pos=grid.querySelector('[data-cb-view="pos"]');
    var btn=document.createElement('button');
    btn.className='cb-nav-btn';
    btn.dataset.cbView='gas';
    btn.innerHTML='<span class="ico">⛽</span>ガソリン';
    if(pos && pos.nextSibling) grid.insertBefore(btn,pos.nextSibling); else grid.appendChild(btn);
    grid.style.gridTemplateColumns='repeat(7,1fr)';
    btn.onclick=function(){
      document.body.classList.remove('cb-analysis-active');
      var old=document.querySelector('#bottomNav .navbtn[data-view="gas"]');
      if(old) old.click();
      document.querySelectorAll('.cb-nav-btn').forEach(function(b){b.classList.toggle('active',b.dataset.cbView==='gas')});
    };
    var menu=document.getElementById('cb-menu-panel');
    if(menu){
      var gas=menu.querySelector('[data-v="gas"]');
      if(gas) gas.remove();
    }
  }
  var t=null;
  new MutationObserver(function(){clearTimeout(t);t=setTimeout(patchGasTab,100)}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded',function(){patchGasTab();setTimeout(patchGasTab,500);setTimeout(patchGasTab,1500)});
})();
