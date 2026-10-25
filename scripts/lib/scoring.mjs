const labels=['1','0','2'];
export function probabilities(raw) {
  const sum=labels.reduce((s,k)=>s+raw?.[k],0);
  if(!labels.every(k=>Number.isFinite(raw?.[k])&&raw[k]>=0&&raw[k]<=1)||Math.abs(sum-1)>.002)throw new Error('Invalid evaluation probabilities');
  return Object.fromEntries(labels.map(k=>[k,raw[k]/sum]));
}
export function scoreRows(rows) {
  if(!rows.length)return {n:0,accuracy:null,logloss:null,brier:null,draw_precision:null,draw_recall:null,draw_brier:null,draw_calibration:[],calibration:null,by_outcome:{}};
  let hits=0,ll=0,brier=0,draws=0,picks=0,tp=0,drawBrier=0;
  const bins=Array.from({length:10},(_,i)=>({lower:i/10,upper:(i+1)/10,n:0,sum_probability:0,draws:0}));
  for(const r of rows) {
    if(!labels.includes(r.actual)||!labels.includes(r.prediction))throw new Error('Unknown outcome');
    const p=probabilities(r.probabilities);hits+=r.actual===r.prediction;ll-=Math.log(Math.max(1e-15,p[r.actual]));
    brier+=labels.reduce((s,k)=>s+(p[k]-Number(r.actual===k))**2,0);
    draws+=r.actual==='0';picks+=r.prediction==='0';tp+=r.actual==='0'&&r.prediction==='0';drawBrier+=(p['0']-Number(r.actual==='0'))**2;
    const bin=bins[Math.min(9,Math.floor(p['0']*10))];bin.n++;bin.sum_probability+=p['0'];bin.draws+=r.actual==='0';
  }
  return {calibration:calibration(rows),by_outcome:outcomes(rows),n:rows.length,hits,accuracy:hits/rows.length,logloss:ll/rows.length,brier:brier/rows.length,draw_actual:draws,draw_picks:picks,draw_hits:tp,draw_precision:picks?tp/picks:null,draw_recall:draws?tp/draws:null,draw_brier:drawBrier/rows.length,draw_calibration:bins.filter(b=>b.n).map(b=>({lower:b.lower,upper:b.upper,n:b.n,mean_probability:b.sum_probability/b.n,observed_draw_rate:b.draws/b.n}))};
}

// Diagnostics only: these observations never fit or select a model.
function calibration(rows){
 const result={};
 for(const label of labels){
  const bins=Array.from({length:10},(_,i)=>({lower:i/10,upper:(i+1)/10,n:0,sum:0,observed:0}));
  for(const r of rows){const p=probabilities(r.probabilities)[label],b=bins[Math.min(9,Math.floor(p*10))];b.n++;b.sum+=p;b.observed+=r.actual===label;}
  const used=bins.filter(b=>b.n).map(b=>({lower:b.lower,upper:b.upper,n:b.n,mean_probability:b.sum/b.n,observed_rate:b.observed/b.n}));
  result[label]={bins:used,ece:used.reduce((s,b)=>s+b.n/rows.length*Math.abs(b.mean_probability-b.observed_rate),0)};
 }
 return {by_outcome:result,macro_ece:labels.reduce((s,k)=>s+result[k].ece,0)/3,warning:'等幅10ビンの記述統計。少数例のECEだけで校正成功や改善を判定しない。'};
}
function outcomes(rows){return Object.fromEntries(labels.map(k=>{const selected=rows.filter(r=>r.prediction===k),actual=rows.filter(r=>r.actual===k),hits=selected.filter(r=>r.actual===k).length;return[k,{actual:actual.length,picks:selected.length,hits,precision:selected.length?hits/selected.length:null,recall:actual.length?hits/actual.length:null}];}));}
export function summarizePerformance(rows,now=new Date()){
 const today=new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'});
 const valid=rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&r.date<=today);
 const groups=(key)=>Object.fromEntries([...new Set(valid.map(key))].sort().map(k=>[k,scoreRows(valid.filter(r=>key(r)===k))]));
 return {as_of:today,long_term:scoreRows(valid),recent_30_days:scoreRows(valid.filter(r=>{const age=Date.parse(today)-Date.parse(r.date);return age>=0&&age<30*86400000;})),recent_90_days:scoreRows(valid.filter(r=>{const age=Date.parse(today)-Date.parse(r.date);return age>=0&&age<90*86400000;})),by_round:groups(r=>String(r.round_id)),by_month_model:groups(r=>r.date.slice(0,7)+' / '+[r.model?.name||'不明',r.model?.version||'未登録'].join(' / ')),by_model:groups(r=>[r.model?.name||'不明',r.model?.version||'未登録'].join(' / ')),draw_cases:valid.filter(r=>r.prediction==='0'||r.actual==='0').map(r=>({round_id:r.round_id,number:r.number,home:r.home,away:r.away,date:r.date,prediction:r.prediction,actual:r.actual,hit:r.prediction===r.actual})),excluded_future_rows:rows.length-valid.length};
}
