import { existsSync,readdirSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from './integrity.mjs';
import { readJSON,saveJSON,reconcile } from './operation.mjs';
const labels=['1','0','2'];
export function probabilities(raw) {
  const sum=labels.reduce((s,k)=>s+raw?.[k],0);
  if(!labels.every(k=>Number.isFinite(raw?.[k])&&raw[k]>=0&&raw[k]<=1)||Math.abs(sum-1)>.002)throw new Error('Invalid evaluation probabilities');
  return Object.fromEntries(labels.map(k=>[k,raw[k]/sum]));
}
export function scoreRows(rows) {
  if(!rows.length)return {n:0,accuracy:null,logloss:null,brier:null,draw_precision:null,draw_recall:null,draw_brier:null,draw_calibration:[]};
  let hits=0,ll=0,brier=0,draws=0,picks=0,tp=0,drawBrier=0;
  const bins=Array.from({length:10},(_,i)=>({lower:i/10,upper:(i+1)/10,n:0,sum_probability:0,draws:0}));
  for(const r of rows) {
    if(!labels.includes(r.actual)||!labels.includes(r.prediction))throw new Error('Unknown outcome');
    const p=probabilities(r.probabilities);hits+=r.actual===r.prediction;ll-=Math.log(Math.max(1e-15,p[r.actual]));
    brier+=labels.reduce((s,k)=>s+(p[k]-Number(r.actual===k))**2,0);
    draws+=r.actual==='0';picks+=r.prediction==='0';tp+=r.actual==='0'&&r.prediction==='0';drawBrier+=(p['0']-Number(r.actual==='0'))**2;
    const bin=bins[Math.min(9,Math.floor(p['0']*10))];bin.n++;bin.sum_probability+=p['0'];bin.draws+=r.actual==='0';
  }
  return {n:rows.length,hits,accuracy:hits/rows.length,logloss:ll/rows.length,brier:brier/rows.length,draw_actual:draws,draw_picks:picks,draw_hits:tp,draw_precision:picks?tp/picks:null,draw_recall:draws?tp/draws:null,draw_brier:drawBrier/rows.length,draw_calibration:bins.filter(b=>b.n).map(b=>({lower:b.lower,upper:b.upper,n:b.n,mean_probability:b.sum_probability/b.n,observed_draw_rate:b.draws/b.n}))};
}
function files(dir,filter=()=>true) {return existsSync(dir)?readdirSync(dir).filter(filter).sort().map(f=>join(dir,f)):[];}
export function evaluatePublished(root,fixtures,now=new Date()) {
  const snapshots=new Map();
  for(const path of [join(root,'predictions.json'),...files(join(root,'data/history'),f=>/^predictions-.*\.json$/.test(f))]) {if(!existsSync(path))continue;const p=readJSON(path);snapshots.set(digest(p),p);}
  const receipts=files(join(root,'data/deliveries'),f=>f.endsWith('.json')).map(readJSON);
  const selected=new Map();let unverified=0;
  for(const [id,p]of snapshots) {
    const r=receipts.filter(r=>r.snapshot_id===id&&r.pages_delivered===true&&r.dataset_id===p.dataset_id&&Date.parse(r.checked_at)>=Date.parse(p.updated_at)&&Date.parse(r.checked_at)<Date.parse(p.sales_close_at)).sort((a,b)=>Date.parse(a.checked_at)-Date.parse(b.checked_at))[0];
    if(!r||!reconcile(p,fixtures,now).eligible){unverified++;continue;}
    const previous=selected.get(p.round_id);
    if(!previous||Date.parse(p.updated_at)>Date.parse(previous.p.updated_at))selected.set(p.round_id,{p,receipt:r});
  }
  const unique=new Map(),issues=[];
  for(const {p,receipt} of selected.values()) {
    const report=reconcile(p,fixtures,now);
    for(const result of report.matches) {
      if(!result.actual)continue;
      const m=p.matches.find(m=>m.number===result.number);
      const kickoff=/^\d{2}:\d{2}$/.test(m.kickoff||'')?Date.parse(m.match_date+'T'+m.kickoff+':00+09:00'):Date.parse(m.match_date+'T00:00:00+09:00');
      if(!(Date.parse(receipt.checked_at)<kickoff)){issues.push({round_id:p.round_id,number:m.number,reason:'Publication before kickoff not proven'});continue;}
      try{probabilities(m.probabilities);}catch{issues.push({round_id:p.round_id,number:m.number,reason:'Invalid probabilities'});continue;}
      const id=[m.league,m.match_date,m.home_team_id,m.away_team_id].join('|');
      const row={id,date:m.match_date,league:m.league,round_id:p.round_id,number:m.number,home:m.home,away:m.away,actual:result.actual,prediction:m.prediction,probabilities:m.probabilities,published_at:receipt.checked_at,snapshot_id:report.snapshot_id,model:p.model||null};
      if(!unique.has(id)||Date.parse(row.published_at)>Date.parse(unique.get(id).published_at))unique.set(id,row);
    }
  }
  const rows=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const timeline=[...new Set(rows.map(r=>r.date))].map(day=>({date:day,...scoreRows(rows.filter(r=>r.date<=day))}));
  const report={schema_version:1,checked_at:now.toISOString(),scope:'Verified Pages delivery before sales close and kickoff; unique fixtures, latest eligible round snapshot',logloss_floor:1e-15,overall:scoreRows(rows),by_league:Object.fromEntries(['J1','J2','J3'].map(l=>[l,scoreRows(rows.filter(r=>r.league===l))])),timeline,rows,unverified_snapshots:unverified,issues,limitations:['J.League result reconciliation, not toto cancellation/settlement rulings.','Old forecasts without a delivery receipt are excluded, not counted as misses.']};
  saveJSON(join(root,'data/evaluation.json'),report);
  // Content-based append-only revisions preserve result corrections without double-counting metrics.
  const {checked_at,...content}=report;const archive=join(root,'data/evaluation-history',digest(content)+'.json');
  if(!existsSync(archive))saveJSON(archive,report);
  return report;
}
