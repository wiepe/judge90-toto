import test from 'node:test';import assert from 'node:assert/strict';
import { optimizePortfolio } from '../scripts/lib/portfolio.mjs';
const matches=Array.from({length:13},(_,i)=>({number:i+1,probabilities:{'1':.5,'0':.3,'2':.2}}));
test('13 singles: exact product and 100 yen cost',()=>{const p=optimizePortfolio(matches,100);assert.equal(p.cost_yen,100);assert.equal(p.combinations,1);assert.ok(Math.abs(p.estimated_all_13_covered_probability-.5**13)<1e-15);assert.equal(p.expected_return,null);});
test('200 yen covers one double; 300 yen covers one triple',()=>{const d=optimizePortfolio(matches,200);assert.equal(d.combinations,2);assert.ok(Math.abs(d.estimated_all_13_covered_probability-.8*.5**12)<1e-15);const t=optimizePortfolio(matches,300);assert.equal(t.combinations,3);assert.ok(Math.abs(t.estimated_all_13_covered_probability-.5**12)<1e-15);});
test('budget increases never decrease optimal probability and never overspend',()=>{let last=0;for(const b of [100,200,300,500,1000,5000,10000,1000000]){const r=optimizePortfolio(matches,b);assert.ok(r.cost_yen<=b);assert.ok(r.estimated_all_13_covered_probability>=last-1e-15);last=r.estimated_all_13_covered_probability;}});
test('sufficient budget covers all outcomes of all 13 matches',()=>{const r=optimizePortfolio(matches,100*3**13,{maximumBudget:100*3**13});assert.equal(r.combinations,3**13);assert.ok(Math.abs(r.estimated_all_13_covered_probability-1)<1e-15);});
test('invalid budget, missing game, duplicate number and invalid probabilities fail closed',()=>{for(const b of [0,99,100.5,Infinity,1000001])assert.throws(()=>optimizePortfolio(matches,b));assert.throws(()=>optimizePortfolio(matches.slice(1),100));assert.throws(()=>optimizePortfolio(matches.map(m=>({...m,number:1})),100));assert.throws(()=>optimizePortfolio(matches.map(m=>({...m,probabilities:{'1':.8,'0':.4,'2':-.2}})),100));});
test('draw can be a single pick when its modeled probability is largest',()=>{const p=optimizePortfolio(matches.map(m=>({...m,probabilities:{'1':.25,'0':.5,'2':.25}})),100);assert.ok(p.selections.every(s=>s.outcomes[0]==='0'));});
test('dynamic program agrees with independent exhaustive enumeration for three uncertain games',()=>{
  const ps=[{'1':.7,'0':.2,'2':.1},{'1':.4,'0':.35,'2':.25},{'1':.5,'0':.3,'2':.2}];
  const input=matches.map((m,i)=>({...m,probabilities:i<3?ps[i]:{'1':1,'0':0,'2':0}}));
  for(const budget of [100,200,300,400,600,900,1200,2700]){
    let best=0;
    for(let a=1;a<=3;a++)for(let b=1;b<=3;b++)for(let c=1;c<=3;c++){
      if(a*b*c*100>budget)continue;
      const prob=[a,b,c].reduce((p,n,i)=>p*Object.values(ps[i]).sort((x,y)=>y-x).slice(0,n).reduce((x,y)=>x+y,0),1);best=Math.max(best,prob);
    }
    assert.ok(Math.abs(optimizePortfolio(input,budget).estimated_all_13_covered_probability-best)<1e-12);
  }
});
