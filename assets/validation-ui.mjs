import{renderStrategies}from'./strategy-ui.mjs';
const names={production:'本番・公開予測',current:'現行式（研究用）',league_mean:'リーグ平均',elo:'Elo',poisson:'Poisson',dixon_coles:'Dixon-Coles',ensemble:'アンサンブル',calibrated_ensemble:'校正アンサンブル',calibrated_dc:'校正Dixon-Coles'};
let lastData=null;
const pct=x=>Number.isFinite(x)?(x*100).toFixed(2)+'%':'未評価';const num=x=>Number.isFinite(x)?x.toFixed(4):'—';
function table(doc,id,headers,rows){const t=doc.getElementById(id);t.replaceChildren();for(const [i,row]of[headers,...rows].entries()){const tr=doc.createElement('tr');for(const value of row){const cell=doc.createElement(i?'td':'th');cell.textContent=value;tr.append(cell);}t.append(tr);}}
function cards(doc,id,items){const el=doc.getElementById(id);el.replaceChildren();for(const[label,value]of items){const card=doc.createElement('div');card.className='metric';const title=doc.createElement('span');title.textContent=label;const v=doc.createElement('strong');v.textContent=value;card.append(title,v);el.append(card);}}
export function renderValidation(doc,{evaluation,research,registration,researchStatus,predictions,recommendation,weather,status},now=new Date()){
 const state=globalThis.Judge90DataStatus?.assess(predictions,recommendation,weather,status,now)||{current:false,message:'更新状態を確認できません。'};
 doc.getElementById('systemStatus').textContent=state.message;
 const researchAge=now-new Date(research?.checked_at);const usableResearch=research&&Number.isFinite(researchAge)&&researchAge>=-60000&&researchAge<=8*86400000&&researchStatus?.state!=='error';
 doc.getElementById('researchStatus').textContent='研究更新 '+(research?.checked_at?new Date(research.checked_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'未取得')+' ／ '+(researchStatus?.state==='error'?'取得失敗：'+researchStatus.error:research?.preview_only?'作業用プレビュー。確認検定の台帳には未登録。':usableResearch?'別保存の研究予測':'研究データの最新性を確認できません');
 const m=evaluation?.overall||{};
 cards(doc,'liveMetrics',[['評価済み試合',evaluation?String(m.n||0):'未取得'],['的中率',pct(m.accuracy)],['LogLoss',num(m.logloss)],['Brier',num(m.brier)]]);
 cards(doc,'drawMetrics',[['引き分け検出率',pct(m.draw_recall)],['引き分け適合率',pct(m.draw_precision)],['引き分け本命',String(m.draw_picks||0)+'件'],['引き分けBrier',num(m.draw_brier)]]);
 table(doc,'leagueMetrics',['リーグ','試合','的中率','LogLoss','Brier','引分検出'],['J1','J2','J3'].map(l=>{const x=evaluation?.by_league?.[l]||{};return[l,x.n||0,pct(x.accuracy),num(x.logloss),num(x.brier),pct(x.draw_recall)];}));
 table(doc,'drawCalibration',['引分確率帯','試合','平均予測','実引分率'],(m.draw_calibration||[]).map(b=>[pct(b.lower)+'〜'+pct(b.upper),b.n,pct(b.mean_probability),pct(b.observed_draw_rate)]));
 doc.getElementById('evaluationStatus').textContent='実績更新 '+(evaluation?.checked_at||'未取得')+' ／ 配信証跡なし '+(evaluation?.unverified_snapshots||0)+'履歴を除外。'+(!m.n?'確定した実運用成績はまだありません。':'');
 const chart=doc.getElementById('accuracyTrend');chart.replaceChildren();const points=(evaluation?.timeline||[]).filter(r=>Number.isFinite(r.accuracy));
 if(points.length){const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 170');svg.setAttribute('class','trend');svg.setAttribute('role','img');svg.setAttribute('aria-label','公開済み予測の累計的中率の推移');const poly=doc.createElementNS(ns,'polyline');poly.setAttribute('points',points.map((r,i)=>(40+i*520/Math.max(1,points.length-1))+','+(140-120*r.accuracy)).join(' '));svg.append(poly);for(const[y,label]of[[20,'100%'],[140,'0%']]){const line=doc.createElementNS(ns,'line');for(const[k,v]of Object.entries({x1:40,x2:560,y1:y,y2:y}))line.setAttribute(k,String(v));svg.append(line);const t=doc.createElementNS(ns,'text');t.setAttribute('x','0');t.setAttribute('y',String(y+4));t.textContent=label;svg.append(t);}chart.append(svg);const range=doc.createElement('p');range.className='small';range.textContent=points[0].date+'〜'+points.at(-1).date+' ／ 累計的中率。試合数が少ない時期の変動に注意。';chart.append(range);}else chart.textContent='配信証跡付きの結果が蓄積すると、的中率の推移を表示します。';
 const select=doc.getElementById('comparisonMatch');select.replaceChildren();
 const available=new Map();for(const m of usableResearch?research.upcoming||[]:[])available.set(m.id,{...m,research:true});
 for(const m of predictions?.matches||[]){const id=[m.league,m.match_date,m.home_team_id,m.away_team_id].join('|');available.set(id,{...available.get(id),...m,id,date:m.match_date,production:true});}
 for(const m of available.values()){const option=doc.createElement('option');option.value=m.id;option.textContent=m.date+' '+m.league+' '+m.home+' − '+m.away+(m.production?'〔toto対象〕':'〔研究のみ〕');select.append(option);}
 function compare(){const m=available.get(select.value),rows=[];if(m?.production)rows.push([names.production,...['1','0','2'].map(k=>pct(m.probabilities[k])),m.prediction]);for(const[n,p]of Object.entries(m?.models||{})){const pick=Object.keys(p).sort((a,b)=>p[b]-p[a]||a.localeCompare(b))[0];rows.push([names[n]||n,...['1','0','2'].map(k=>pct(p[k])),pick]);}table(doc,'modelProbabilities',['モデル','ホーム1','引分0','アウェイ2','本命'],rows);doc.getElementById('comparisonInfo').textContent=m?(m.production&&!state.current?'本番欄は過去の公開予測です。 ':'')+(m.research?'研究の情報締切 '+research.training_cutoff+' JST 00:00。':'対応する研究予測はまだありません。'):'比較可能な予測がありません。';}
 select.onchange=compare;compare();
 table(doc,'developmentMetrics',['モデル','試合','的中率','LogLoss','Brier','引分検出'],Object.entries(registration?.selection||{}).map(([n,s])=>[names[n]||n,s.overall.n,pct(s.overall.accuracy),num(s.overall.logloss),num(s.overall.brier),pct(s.overall.draw_recall)]));
 doc.getElementById('candidateStatus').textContent='開発用期間で選んだ候補：'+(names[registration?.selected]||'未登録')+'。本番モデルは変更していません。';
 doc.getElementById('futureStatus').textContent=registration?'初回の未使用確認期間 '+registration.protocol.prospective_start+'〜'+registration.protocol.prospective_end+'、判定は '+registration.protocol.decision_not_before+'以降。現在の判断：'+(research?.decision==='propose_review_only'?'研究候補の承認待ち':research?.decision?.startsWith('retain_current')?'改善なし（採用条件未達）・現行維持':'改善未確認・新しい評価データを収集中'):'候補登録を確認できません。';
 table(doc,'futureMetrics',['将来期間のモデル','試合','的中率','LogLoss','Brier','引分検出'],Object.entries(research?.metrics||{}).map(([n,s])=>[names[n]||n,s.overall.n,pct(s.overall.accuracy),num(s.overall.logloss),num(s.overall.brier),pct(s.overall.draw_recall)]));
 renderStrategies(doc,doc.getElementById('fixedBudgetStrategies'),{current:state.current,predictions});
 return state;
}
export async function loadValidation(doc=document,fetcher=fetch){
 const paths={evaluation:'data/evaluation.json',research:'data/research/report.json',researchStatus:'data/research/status.json',registration:'research/continuous/registration.json',predictions:'predictions.json',recommendation:'recommendation.json',weather:'data/weather.json',status:'data/update_status.json'};
 const entries=await Promise.all(Object.entries(paths).map(async([k,path])=>{try{const r=await fetcher(path+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return[k,await r.json()];}catch{return[k,null];}}));
 const data=Object.fromEntries(entries);
 if(data.research?.experiment_id&&data.registration?.experiment_id!==data.research.experiment_id){
  data.registration=null;
  if(/^[a-f0-9]{64}$/.test(data.research.experiment_id)){try{const r=await fetcher('data/research/registrations/'+data.research.experiment_id+'.json?t='+Date.now(),{cache:'no-store'});if(r.ok)data.registration=await r.json();}catch{}}
 }
 lastData=data;return renderValidation(doc,data);
}
if(typeof document!=='undefined'){loadValidation().catch(()=>{document.getElementById('systemStatus').textContent='表示データを検証できませんでした。再読み込みしてください。';});setInterval(()=>{if(lastData)renderValidation(document,lastData);},60000);}
