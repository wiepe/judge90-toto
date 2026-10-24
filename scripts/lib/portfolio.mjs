/** Rectangular single/double/triple portfolios. Estimates assume independent games.
 * No payout, profit or empirically calibrated hit-rate is inferred here.
 */
export function optimizePortfolio(matches, budget, { maximumBudget = 1000000 } = {}) {
  if (matches?.length !== 13) throw new Error('Exactly 13 matches required');
  if (!Number.isSafeInteger(budget) || budget < 100 || budget > maximumBudget) throw new Error(`Budget must be an integer between 100 and ${maximumBudget} yen`);
  if (new Set(matches.map(m=>m.number)).size !== 13) throw new Error('Duplicate match numbers');
  const prepared=matches.map(m=>{
    if (!Number.isInteger(m.number)||m.number<1||m.number>13) throw new Error('Invalid match number');
    const probabilities=m.probabilities||m.p;
    const p=['1','0','2'].map(k=>[k,probabilities?.[k]]);
    if(p.some(([,v])=>!Number.isFinite(v)||v<0||v>1)||Math.abs(p.reduce((s,[,v])=>s+v,0)-1)>.002)throw new Error('Invalid probabilities');
    // Stored UI predictions are rounded; normalize that small rounding error explicitly.
    const total=p.reduce((s,[,v])=>s+v,0);p.forEach(x=>x[1]/=total);
    p.sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    return {number:m.number,options:[1,2,3].map(n=>({number:m.number,type:['single','double','triple'][n-1],outcomes:p.slice(0,n).map(x=>x[0]),coverage:p.slice(0,n).reduce((s,x)=>s+x[1],0)}))};
  }).sort((a,b)=>a.number-b.number);
  let states=new Map([[1,{log:0,selections:[]}]]);
  for(const m of prepared){
    const next=new Map();
    for(const [combinations,state] of states)for(const option of m.options){
      const count=combinations*option.outcomes.length;
      if(count*100>budget)continue;
      const log=state.log+Math.log(option.coverage);
      if(!next.has(count)||next.get(count).log<log)next.set(count,{log,selections:[...state.selections,option]});
    }
    states=next;
  }
  const [combinations,best]=[...states].sort((a,b)=>b[1].log-a[1].log||a[0]-b[0])[0];
  return {budget_limit_yen:budget,unit_price_yen:100,combinations,cost_yen:combinations*100,
    estimated_all_13_covered_probability:Math.exp(best.log),
    assumption:'Product of modeled per-match coverage probabilities, assuming independent outcomes; not a validated actual winning probability.',
    expected_return:null,payout_estimate:null,selections:best.selections};
}
