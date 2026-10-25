const pct=x=>Number.isFinite(x)?(100*x).toFixed(2)+'%':'評価データ不足',num=x=>Number.isFinite(x)?x.toFixed(4):'—';
function el(d,t,text){const e=d.createElement(t);e.textContent=String(text);return e;}
function table(d,root,heads,rows){const wrap=el(d,'div','');wrap.className='table-scroll';const t=d.createElement('table');for(const[i,r]of[heads,...rows].entries()){const tr=d.createElement('tr');for(const c of r)tr.append(el(d,i?'td':'th',c));t.append(tr);}wrap.append(t);root.append(wrap);}
export function renderDiagnostics(doc,report){
 const root=doc.getElementById('diagnostics');root.replaceChildren();
 if(report?.prediction_year!==2024||report.production_model_changed!==false){doc.getElementById('diagnosticStatus').textContent='検証可能な開発用レポートがありません。';return;}
 doc.getElementById('diagnosticStatus').textContent='同じ2024年の試合で比較。校正は2023年の時系列予測で固定。採用判断：現行維持（この診断では変更しません）。';
 table(doc,root,['モデル','試合','的中率','LogLoss','Brier','引分適合','引分検出'],Object.entries(report.models).map(([n,r])=>[n,r.overall.n,pct(r.overall.accuracy),num(r.overall.logloss),num(r.overall.brier),pct(r.overall.draw_precision),pct(r.overall.draw_recall)]));
 for(const[n,r]of Object.entries(report.models)){
  const details=doc.createElement('details');details.append(el(doc,'summary',n+'：リーグ・時期・低確率結果'));
  table(doc,details,['区分','試合','LogLoss','Brier'],[...Object.entries(r.by_league),...Object.entries(r.quarters).map(([q,m])=>['四半期'+q,m]),['前年の同リーグ履歴なし',r.previous_league_season_absent],['前年の同リーグ履歴あり',r.previous_league_season_present]].map(([k,m])=>[k,m.n,num(m.logloss),num(m.brier)]));
  table(doc,details,['結果','校正誤差ECE','15%以下の試合','予測件数合計','実発生件数'],['1','0','2'].map(k=>{const x=r.overall.low_probability_events[k];return[k,num(r.overall.calibration[k].ece),x.n,num(x.expected_count),x.observed_count];}));
  details.append(el(doc,'p','少数例と多重比較に注意。履歴なしは昇格・降格の確定情報ではありません。この表だけでチューニングや採用は行いません。'));root.append(details);
 }
}
if(typeof document!=='undefined'&&document.getElementById('diagnostics')){
 (async()=>{for(const path of['../data/research/diagnostics.json','development/diagnostics.json']){try{const r=await fetch(path,{cache:'no-store'});if(!r.ok)continue;renderDiagnostics(document,await r.json());return;}catch{}}document.getElementById('diagnosticStatus').textContent='研究診断を取得できませんでした。';})();
}
