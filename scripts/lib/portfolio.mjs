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

function normalizedMatches(matches){
  if(matches?.length!==13||new Set(matches.map(m=>m.number)).size!==13||matches.some(m=>!Number.isInteger(m.number)||m.number<1||m.number>13))throw new Error('Verified match numbers 1..13 required');
  return [...matches].sort((a,b)=>a.number-b.number).map(m=>{const raw=m.probabilities||m.p;const sum=['1','0','2'].reduce((s,k)=>s+raw?.[k],0);if(!['1','0','2'].every(k=>Number.isFinite(raw?.[k])&&raw[k]>=0&&raw[k]<=1)||Math.abs(sum-1)>.002)throw new Error('Invalid probabilities');return {...m,p:Object.fromEntries(['1','0','2'].map(k=>[k,raw[k]/sum]))};});
}
const assumption='各試合が独立で、通常どおり13試合が成立する仮定。モデル確率に基づく計算で実証済み当選確率ではありません。賞金・期待収益は不明。';
/** Distinct individually listed tickets. Top K maximizes modeled 13/13 mass, not expected payout. */
export function optimizeTickets(matches,budget){
  if(!Number.isSafeInteger(budget)||budget<100||budget>3000)throw new Error('Individual ticket budget must be 100..3000 yen');
  const games=normalizedMatches(matches),limit=Math.floor(budget/100);
  const order=games.map(m=>Object.entries(m.p).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));
  const key=ranks=>ranks.reduce((s,r,i)=>s+r*3**i,0);
  const node=ranks=>({ranks,key:key(ranks),log:ranks.reduce((s,r,i)=>s+Math.log(order[i][r][1]),0)});
  const start=node(Array(13).fill(0)),queue=[start],seen=new Set([start.key]),tickets=[];
  while(queue.length&&tickets.length<limit){
    queue.sort((a,b)=>b.log-a.log||a.key-b.key);const best=queue.shift();if(!Number.isFinite(best.log))break;
    tickets.push({outcomes:best.ranks.map((r,i)=>order[i][r][0]),probability:Math.exp(best.log)});
    for(let i=0;i<13;i++){if(best.ranks[i]===2)continue;const ranks=[...best.ranks];ranks[i]++;const next=node(ranks);if(!seen.has(next.key)){seen.add(next.key);queue.push(next);}}
  }
  const prizes=ticketPrizeProbabilities(games,tickets);
  return {budget_limit_yen:budget,cost_yen:tickets.length*100,combinations:tickets.length,estimated_all_13_covered_probability:prizes.highest_prize['1'],prizes,tickets,objective:'同じ13試合の個別買い目から、独立仮定の全13試合的中確率を最大化。1〜3等合計や期待収益の最適化ではありません。',assumption,expected_return:null,payout_estimate:null};
}
/** Exact unions of Hamming shells up to distance 2; never add overlapping ticket probabilities. */
export function ticketPrizeProbabilities(matches,tickets){
  const games=normalizedMatches(matches),labels=['1','0','2'],weights=Array.from({length:13},(_,i)=>3**i),events=new Map();
  if(!tickets.length||tickets.length>30)throw new Error('1..30 individual tickets required');
  const seen=new Set();
  for(const ticket of tickets){
    const t=ticket.outcomes;
    if(t?.length!==13||t.some(k=>!labels.includes(k)))throw new Error('Invalid ticket');
    const code=t.reduce((s,k,i)=>s+labels.indexOf(k)*weights[i],0);if(seen.has(code))throw new Error('Duplicate ticket');seen.add(code);
    function add(outcomes,distance){const code=outcomes.reduce((s,k,i)=>s+labels.indexOf(k)*weights[i],0);const old=events.get(code);if(old){old.mask|=1<<distance;return;}events.set(code,{mask:1<<distance,p:outcomes.reduce((p,k,i)=>p*games[i].p[k],1)});}
    add(t,0);
    for(let i=0;i<13;i++)for(const a of labels){if(a===t[i])continue;const one=[...t];one[i]=a;add(one,1);
      for(let j=i+1;j<13;j++)for(const b of labels){if(b===t[j])continue;const two=[...one];two[j]=b;add(two,2);}
    }
  }
  const highest={'1':0,'2':0,'3':0,none:0},any={'1':0,'2':0,'3':0};
  for(const {mask,p}of events.values()){
    const best=mask&1?'1':mask&2?'2':'3';highest[best]+=p;
    for(let i=0;i<3;i++)if(mask&(1<<i))any[String(i+1)]+=p;
  }
  highest.none=Math.max(0,1-highest['1']-highest['2']-highest['3']);
  return {highest_prize:highest,any_ticket_exact_prize:any,estimated_at_least_third_probability:Math.min(1,highest['1']+highest['2']+highest['3']),assumption,warning:'最高等級の1・2・3は排他的。各等級に少なくとも1口は重複し得るため合計しない。公式の中止・みなし的中裁定は未反映。',expected_return:null,payout_estimate:null};
}
