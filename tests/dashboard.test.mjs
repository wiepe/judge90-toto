import test from 'node:test';import assert from 'node:assert/strict';import{JSDOM}from'jsdom';import{readFileSync}from'node:fs';import'../assets/data-status.js';import{renderDashboard,navigate,purchaseState,loadDashboard}from'../assets/dashboard.mjs';
import {dashboardFixture as bundle} from './helpers/dashboard-fixture.mjs';
const html=readFileSync('index.html','utf8');
test('top page puts thirteen colored picks, probabilities and collapsed reasons together',t=>{const d=bundle(),dom=new JSDOM(html);t.mock.timers.enable({apis:['Date'],now:new Date(d.predictions.updated_at)});const s=renderDashboard(dom.window.document,d,new Date(d.predictions.updated_at));assert.equal(s.current,true);assert.equal(dom.window.document.querySelectorAll('#quickPicks strong').length,13);assert.equal(dom.window.document.querySelectorAll('.prob-bar').length,13);assert.equal(dom.window.document.querySelectorAll('.match-card details[open]').length,0);assert.match(dom.window.document.getElementById('purchaseContent').textContent,/全13試合/);dom.window.close();});
test('navigation handles deep links without losing labels or showing multiple screens',()=>{const dom=new JSDOM(html);navigate(dom.window.document,'#purchase');assert.equal(dom.window.document.getElementById('purchase').hidden,false);assert.equal(dom.window.document.getElementById('forecast').hidden,true);assert.equal(dom.window.document.querySelector('[aria-current=page]').textContent,'購入');navigate(dom.window.document,'#malformed');assert.equal(dom.window.document.getElementById('forecast').hidden,false);dom.window.close();});
test('errors, expired predictions, closed sales and missing data remain distinct and stop purchases',()=>{const d=bundle(),now=new Date(d.predictions.updated_at);for(const [data,time,code]of [[{...d,status:{state:'error',error:'<img>'}},now,'error'],[d,new Date(+now+7*3600000),'stale'],[d,new Date(d.predictions.sales_close_at),'closed'],[{},now,'missing']]){const dom=new JSDOM(html);assert.equal(renderDashboard(dom.window.document,data,time).code,code);assert.doesNotMatch(dom.window.document.getElementById('purchaseContent').textContent,/まずは100円/);assert.equal(dom.window.document.querySelectorAll('img').length,0);dom.window.close();}});
test('HTTP errors cannot be mistaken for current forecasts',async()=>{const d=await loadDashboard(undefined,async()=>({ok:false}));assert.equal(purchaseState(d).current,false);});
test('invalid probabilities cannot advertise that purchase candidates are ready',()=>{const d=bundle();d.predictions.matches[0].probabilities['0']=2;const state=purchaseState(d,new Date(d.predictions.updated_at));assert.equal(state.current,false);assert.equal(state.code,'invalid');});

for (const selector of ['[data-amount="500"]', '[data-quick-budget="500"]']) {
 test('purchase clicks recheck the clock after freshness expires: '+selector, t => {
  const data=bundle(), dom=new JSDOM(html), doc=dom.window.document;
  t.after(()=>dom.window.close());
  const start=Date.parse(data.predictions.updated_at);
  t.mock.timers.enable({apis:['Date'],now:start});
  renderDashboard(doc,data);
  assert.equal(doc.querySelectorAll('.purchase-plan').length,2);
  // No rerender: an already displayed button must still check the live clock.
  t.mock.timers.setTime(start+6*3600000+1);
  doc.querySelector(selector).click();
  assert.equal(doc.querySelectorAll('.purchase-plan').length,0);
  assert.match(doc.getElementById('purchaseContent').textContent,/停止/);
  assert.equal(renderDashboard(doc,data).code,'stale');
 });
}
