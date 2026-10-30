import test from'node:test';import assert from'node:assert/strict';import{JSDOM}from'jsdom';import{comparePlans,renderPurchase}from'../assets/purchase.mjs';
const matches=Array.from({length:13},(_,i)=>({number:i+1,home:'ホーム'+(i+1),away:'アウェイ'+(i+1),probabilities:{'1':.43,'0':.32,'2':.25}}));
test('all four budgets have unique affordable tickets and equivalent exact-union rectangular probability',()=>{for(const budget of[100,500,1000,3000]){const c=comparePlans(matches,budget);for(const p of[c.individual,c.rectangular]){assert.ok(p.cost_yen<=budget);assert.equal(p.combinations*100,p.cost_yen);assert.equal(new Set(p.tickets.map(t=>t.outcomes.join(''))).size,p.combinations);assert.ok(Math.abs(p.estimated_all_13_covered_probability-p.prizes.highest_prize['1'])<1e-12);}assert.ok(c.individual.estimated_all_13_covered_probability+1e-12>=c.rectangular.estimated_all_13_covered_probability);assert.equal(c.high_payout_available,false);}});
test('budget buttons keep teams and ticket outcomes matched by official number, even for unsorted input',()=>{
 const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main');
 const shuffled=structuredClone(matches).reverse();shuffled.find(m=>m.number===1).home='<img src=x>';
 renderPurchase(dom.window.document,root,{current:true,predictions:{matches:shuffled},evaluation:{overall:{n:0}}});
 for(const budget of [100,500,1000,3000]){
  root.querySelector('[data-amount="'+budget+'"]').click();
  const plan=root.querySelector('[data-kind=rectangular]'),rows=plan.querySelectorAll(':scope>.selection-grid>.purchase-match');
  assert.equal(rows.length,13);
  for(const row of rows){const number=Number(row.dataset.number),m=shuffled.find(m=>m.number===number);assert.equal(row.querySelector('.purchase-home').textContent,m.home);assert.equal(row.querySelector('.purchase-away').textContent,m.away);}
  assert.equal(root.querySelectorAll('img').length,0);assert.match(root.textContent,/引き分け/);assert.match(root.textContent,/未評価/);
  const individual=root.querySelector('[data-kind=individual]'),select=individual.querySelector('select');
  const candidates=comparePlans(shuffled,budget).individual.tickets;assert.equal(select.options.length,candidates.length);
  select.value=String(candidates.length-1);select.dispatchEvent(new dom.window.Event('change'));
  const ticketRows=individual.querySelectorAll('.ticket-preview .purchase-match');assert.equal(ticketRows.length,13);
  ticketRows.forEach((row,i)=>{assert.equal(Number(row.dataset.number),i+1);assert.equal(row.querySelector('.purchase-outcome').textContent[0],candidates.at(-1).outcomes[i]);assert.match(row.textContent,new RegExp('アウェイ'+(i+1)));});
 }
 renderPurchase(dom.window.document,root,{current:false});assert.equal(root.querySelectorAll('button,select').length,0);dom.window.close();
});
test('a budget click rechecks freshness instead of trusting the previous screen state',()=>{const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main');let fresh=true;renderPurchase(dom.window.document,root,{current:true,predictions:{matches},getCurrent:()=>fresh});fresh=false;root.querySelector('select').dispatchEvent(new dom.window.Event('change'));assert.equal(root.querySelector('[data-kind=individual] .ticket-preview .purchase-match'),null);root.querySelector('[data-amount="500"]').click();assert.equal(root.querySelectorAll('.purchase-plan').length,0);assert.match(root.textContent,/停止/);dom.window.close();});
