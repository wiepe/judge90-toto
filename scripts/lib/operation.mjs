import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from './integrity.mjs';
export const readJSON = path => JSON.parse(readFileSync(path,'utf8'));
export function saveJSON(path,data) { mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path+'.tmp',JSON.stringify(data,null,2)+'\n');renameSync(path+'.tmp',path); }
export function publicationWindow(round, now=new Date(), reserveMinutes=30) {
  const remaining_minutes=(Date.parse(round.sales_close_at)-now)/60000;
  return {checked_at:now.toISOString(),sales_close_at:round.sales_close_at,remaining_minutes,reserve_minutes:reserveMinutes,on_time:Number.isFinite(remaining_minutes)&&remaining_minutes>=reserveMinutes};
}
// A score is a league-result reconciliation, not the toto operator's settlement.
export function reconcile(snapshot,fixtures,now=new Date()) {
  const updated=Date.parse(snapshot.updated_at),close=Date.parse(snapshot.sales_close_at);
  const eligible=!!snapshot.dataset_id&&snapshot.product_id==='01'&&snapshot.matches?.length===13&&Number.isFinite(updated)&&updated<close;
  const matches=(snapshot.matches||[]).map(m=>{
    const candidates=(fixtures.leagues||[]).filter(l=>l.league===m.league).flatMap(l=>l.matches||[]).filter(f=>f.home_team_id===m.home_team_id&&f.away_team_id===m.away_team_id&&f.date===m.match_date);
    const f=candidates.length===1?candidates[0]:null;
    const score=/^(\d+)\s*-\s*(\d+)$/.exec(f?.score||'');
    const dayEnd=Date.parse(m.match_date+'T23:59:59+09:00');
    // Conservative: do not treat a live score or today's score as final.
    const final=!!score&&now>dayEnd;
    const actual=final?(+score[1]>+score[2]?'1':+score[1]<+score[2]?'2':'0'):null;
    return {number:m.number,home:m.home,away:m.away,status:final?'completed':candidates.length!==1?'unmatched':'pending',score:final?f.score:null,actual,prediction:m.prediction,hit:actual===null?null:actual===m.prediction};
  });
  const completed=matches.filter(m=>m.actual!==null).length;
  return {snapshot_id:digest(snapshot),dataset_id:snapshot.dataset_id,round_id:snapshot.round_id,checked_at:now.toISOString(),eligible,eligibility_note:eligible?'保存済み・締切前予測。実際のPages配信時刻は未確認':'旧形式または締切前予測を確認できないため集計対象外',source:'J.League results; not official toto settlement',completed,hits:matches.filter(m=>m.hit).length,matches};
}
export function reconcileHistory(root,fixtures,now=new Date()) {
  const dir=join(root,'data/history');const snapshots=new Map();
  for(const file of [join(root,'predictions.json'),...(existsSync(dir)?readdirSync(dir).filter(f=>/^predictions-.*\.json$/.test(f)).map(f=>join(dir,f)):[])]) {
    const p=readJSON(file);snapshots.set(digest(p),p);
  }
  const reports=[...snapshots.values()].map(p=>reconcile(p,fixtures,now));
  // Keep every snapshot report, but count only the latest eligible pre-close snapshot per round.
  const latest=new Map();
  for(const p of snapshots.values()) {const r=reports.find(r=>r.snapshot_id===digest(p));if(r.eligible&&(!latest.has(p.round_id)||Date.parse(p.updated_at)>Date.parse(latest.get(p.round_id).updated_at)))latest.set(p.round_id,p);}
  const counted=reports.filter(r=>latest.has(r.round_id)&&digest(latest.get(r.round_id))===r.snapshot_id);
  const completed=counted.reduce((a,r)=>a+r.completed,0),hits=counted.reduce((a,r)=>a+r.hits,0);
  const result={checked_at:now.toISOString(),completed,hits,accuracy:completed?hits/completed:null,rounds:reports,counted_snapshot_ids:counted.map(r=>r.snapshot_id)};
  saveJSON(join(root,'data/results.json'),result);return result;
}
