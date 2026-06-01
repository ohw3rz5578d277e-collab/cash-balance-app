export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  let html = await response.text();
  const inject = `
<script>
(function(){
  'use strict';
  var current = new Date();
  var currentYear = current.getFullYear();
  var currentMonth = current.getMonth() + 1;
  function monthKeyFromText(text){
    var m = String(text||'').match(/(\\d{4})年(\\d{1,2})月/);
    if(!m) return '';
    return m[1] + '-' + String(m[2]).padStart(2,'0');
  }
  function currentKey(){return currentYear + '-' + String(currentMonth).padStart(2,'0');}
  function ensurePastBox(targetId, title){
    var target = document.getElementById(targetId);
    if(!target) return null;
    var boxId = targetId + '-past-months';
    var old = document.getElementById(boxId);
    if(old) old.remove();
    var box = document.createElement('div');
    box.id = boxId;
    box.className = 'panel';
    box.style.marginTop = '12px';
    box.innerHTML = '<div class="head"><div><h2>'+title+'</h2><div class="help">前月以前はここを開くと確認できます。</div></div></div><div class="list" data-past-list="1"></div>';
    target.parentElement.appendChild(box);
    return box.querySelector('[data-past-list]');
  }
  function filterMonthList(targetId, pastTitle){
    var list = document.getElementById(targetId);
    if(!list || list.dataset.monthFiltered === 'busy') return;
    var items = Array.from(list.children).filter(function(el){return el.classList && el.classList.contains('item');});
    if(!items.length) return;
    list.dataset.monthFiltered = 'busy';
    var ck = currentKey();
    var past = {};
    items.forEach(function(item){
      var key = monthKeyFromText(item.textContent);
      if(key && key !== ck){
        var label = key.replace('-', '年') + '月';
        if(!past[label]) past[label] = [];
        past[label].push(item.cloneNode(true));
        item.remove();
      }
    });
    if(!list.children.length){
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = currentMonth + '月のデータはまだありません。前月以前は下の詳細から確認できます。';
      list.appendChild(empty);
    }
    var labels = Object.keys(past).sort().reverse();
    if(labels.length){
      var pastList = ensurePastBox(targetId, pastTitle);
      labels.forEach(function(label){
        var details = document.createElement('details');
        details.className = 'item';
        details.style.display = 'block';
        var summary = document.createElement('summary');
        summary.className = 'date';
        summary.style.cursor = 'pointer';
        summary.textContent = label + 'の詳細（' + past[label].length + '件）';
        var inner = document.createElement('div');
        inner.className = 'list';
        inner.style.marginTop = '10px';
        past[label].forEach(function(node){inner.appendChild(node);});
        details.appendChild(summary);
        details.appendChild(inner);
        pastList.appendChild(details);
      });
    }
    setTimeout(function(){delete list.dataset.monthFiltered;}, 50);
  }
  function labelCurrentMonthCards(){
    document.querySelectorAll('.salesCard .label').forEach(function(el){
      if(el.textContent.includes('今月') && !el.textContent.includes('（'+currentMonth+'月）')){
        el.textContent = el.textContent.replace('今月', '今月（'+currentMonth+'月）');
      }
    });
  }
  function run(){
    filterMonthList('historyList', '前月以前の履歴');
    filterMonthList('salesHistoryList', '前月以前の売上詳細');
    labelCurrentMonthCards();
  }
  var timer = null;
  var observer = new MutationObserver(function(){
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  window.addEventListener('DOMContentLoaded', function(){
    run();
    observer.observe(document.body, {childList:true, subtree:true});
  });
})();
</script>
`;
  html = html.replace("</body>", inject + "</body>");
  return new Response(html, response);
}
