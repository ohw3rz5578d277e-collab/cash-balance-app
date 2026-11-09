'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual POS functions extracted from the shipped inline app.
// No Cloudflare request or production data is accessed.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function currentShortage(){');
const end = html.indexOf('function gasDraft(){', start);
assert.ok(start > 0 && end > start, 'POS function boundaries');
const source = html.slice(start,end) +
  '\nwindow.__posTest = {renderPosTop, keyInput, addPosItem, currentShortage, currentChange, tipChange};';

function setup(sale,paid,mode='paid') {
  const changeCard = { classList: { values: new Set(), toggle(name, enabled) {
    if (enabled) this.values.add(name); else this.values.delete(name);
  } } };
  const el = () => ({textContent:'', value:''});
  const E = { posDisplay:el(), posStatus:el(), posSaleView:el(), posPaidView:el(),
    posChangeView:el(), posChangeLabel:el(), posChangeCard:changeCard,
    posMemo:el(), addPosButton:el() };
  const pos = {sale:String(sale),paid:String(paid),mode,tip:0,memo:''};
  const state = { posItems: [] };
  const messages = [];
  const window = {};
  const sandbox = {
    window, pos, state, E,
    document:{querySelectorAll() { return []; }},
    money(v) { const n=Math.floor(Number(v||0));return Number.isFinite(n)&&n>0?n:0; },
    yen(v) { return '¥'+Number(v||0).toLocaleString('ja-JP'); },
    haptic() {}, savePosDraftSoon() {}, saveDraft() {},
    toast(value) { messages.push(value); },
    makeId() { return 'pos-test'; },
    changed() { sandbox.changedCalls=(sandbox.changedCalls||0)+1; },
    Date, Math, Number, String
  };
  vm.runInNewContext(source,sandbox,{filename:'POS from index.html'});
  return {h:window.__posTest, E, pos, state, messages, sandbox, changedCalls:()=>sandbox.changedCalls||0};
}

test('the reported ¥10,000 sale with ¥948 tender shows ¥9,052 shortage and cannot post',()=>{
  const x=setup(10000,948);
  x.h.renderPosTop();
  assert.equal(x.E.posChangeLabel.textContent,'不足額');
  assert.equal(x.E.posChangeView.textContent,'¥9,052');
  assert.ok(x.E.posChangeCard.classList.values.has('shortage'));
  assert.match(x.E.addPosButton.textContent,/不足 ¥9,052/);
  x.h.addPosItem();
  assert.equal(x.state.posItems.length,0);
  assert.equal(x.changedCalls(),0);
  assert.match(x.messages.at(-1),/¥9,052不足/);
});

test('an exact payment switches from shortage to change and posts a valid POS record',()=>{
  const x=setup(10000,948);
  x.h.renderPosTop();
  x.pos.paid='10000';
  x.h.renderPosTop();
  assert.equal(x.E.posChangeLabel.textContent,'おつり');
  assert.equal(x.E.posChangeView.textContent,'¥0');
  assert.equal(x.E.addPosButton.textContent,'POS明細を追加');
  assert.equal(x.E.posChangeCard.classList.values.has('shortage'),false);
  x.h.addPosItem();
  assert.equal(x.state.posItems.length,1);
  assert.equal(x.state.posItems[0].sale,10000);
  assert.equal(x.state.posItems[0].paid,10000);
  assert.equal(x.state.posItems[0].change,0);
  assert.equal(x.changedCalls(),1);
});

test('overpayment calculates change and allows tip transfer without corrupting amounts',()=>{
  const x=setup(10000,12000);
  x.h.renderPosTop();
  assert.equal(x.E.posChangeLabel.textContent,'おつり');
  assert.equal(x.E.posChangeView.textContent,'¥2,000');
  const tip=x.h.tipChange();
  x.h.renderPosTop();
  assert.equal(x.E.posChangeView.textContent,'¥0');
  x.h.addPosItem();
  assert.equal(x.state.posItems[0].tip,2000);
  assert.equal(x.state.posItems[0].change,0);
});

test('POS keypad updates the tender and re-evaluates shortfall immediately',()=>{
  const x=setup(10000,'');
  x.h.keyInput('9'); x.h.keyInput('4'); x.h.keyInput('8');
  assert.equal(x.pos.paid,'948');
  assert.equal(x.E.posChangeView.textContent,'¥9,052');
  x.h.keyInput('BS');
  assert.equal(x.pos.paid,'94');
  assert.equal(x.E.posChangeView.textContent,'¥9,906');
  x.h.keyInput('C');
  assert.equal(x.pos.paid,'0');
  assert.equal(x.E.posChangeLabel.textContent,'おつり');
});

test('iPhone pointerdown uses one keypad handler and recalculates shortage',()=>{
  const x=setup(10000,'');
  const keys=['9','4','8'];
  const buttons=keys.map(key=>({dataset:{key},handlers:{},
    addEventListener(type,fn,opts){this.handlers[type]=fn;this.opts=opts;}
  }));
  x.sandbox.window.PointerEvent=function PointerEvent(){};
  x.sandbox.document.querySelectorAll=(selector)=>selector==='[data-key]'?buttons:[];
  const marker="document.querySelectorAll('[data-key]').forEach(function(b){";
  const from=html.indexOf(marker);
  const to=html.indexOf(';E.posMemo.oninput=',from);
  assert.ok(from>=0&&to>from,'production keypad binding is present');
  vm.runInNewContext(html.slice(from,to+1),x.sandbox,{filename:'POS keypad event bindings'});
  for(const btn of buttons){
    assert.equal(typeof btn.handlers.pointerdown,'function');
    assert.equal(btn.handlers.click,undefined,'avoid a second click handler on iPhone');
    assert.equal(btn.opts.passive,false);
    let prevented=false;
    btn.handlers.pointerdown({preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
  }
  assert.equal(x.pos.paid,'948');
  assert.equal(x.E.posChangeView.textContent,'¥9,052');
  assert.equal(x.E.posChangeLabel.textContent,'不足額');
});

test('fallback touch browsers use click input without requiring PointerEvent',()=>{
  const x=setup(10000,'');
  const button={dataset:{key:'5'},handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  x.sandbox.document.querySelectorAll=(selector)=>selector==='[data-key]'?[button]:[];
  const start=html.indexOf("document.querySelectorAll('[data-key]').forEach(function(b){");
  const end=html.indexOf(';E.posMemo.oninput=',start);
  vm.runInNewContext(html.slice(start,end+1),x.sandbox);
  assert.equal(button.handlers.pointerdown,undefined);
  button.handlers.click({preventDefault(){}});
  assert.equal(x.pos.paid,'5');
  assert.equal(x.E.posChangeView.textContent,'¥9,995');
});
