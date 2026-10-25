import{scoreRows}from'../scripts/lib/scoring.mjs';
export function growthSummary(evaluation,now=new Date()){
 const today=now.toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'}),groups=new Map();
 for(const r of evaluation?.rows||[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date>today)continue;const id=String(r.round_id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
 const rounds=[...groups].map(([round_id,rows])=>({round_id,rows,date:rows.map(r=>r.date).sort().at(-1),complete:rows.length===13&&new Set(rows.map(r=>r.number)).size===13&&rows.every(r=>Number.isInteger(r.number)&&r.number>=1&&r.number<=13),metrics:scoreRows(rows)})).sort((a,b)=>a.date.localeCompare(b.date)||Number(a.round_id)-Number(b.round_id));
 const complete=rounds.filter(r=>r.complete);const recent=count=>{const chosen=complete.slice(-count);return{requested:count,round_count:chosen.length,enough:chosen.length===count,...scoreRows(chosen.flatMap(r=>r.rows))};};
 return{rounds,complete,recent5:recent(5),recent10:recent(10),timeline:complete.map(r=>({round_id:r.round_id,date:r.date,...r.metrics}))};
}
function el(d,t,text){const e=d.createElement(t);e.textContent=text;return e;}
const pct=x=>Number.isFinite(x)?(100*x).toFixed(1)+'%':'評価データ不足';
export function metricChart(doc,points,key,title){
 const section=doc.createElement('section');section.append(el(doc,'h4',title));
 if(points.length<2){section.append(el(doc,'p','評価データ不足：13試合を照合できた開催回が2回以上必要です。'));return section;}
 const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 440 170');svg.setAttribute('role','img');svg.setAttribute('aria-label',title+'。開催回ごとの値。下の表でも確認できます。');svg.classList.add('growth-chart');
 const max=key==='accuracy'?1:key==='brier'?2:Math.max(1,...points.map(p=>p[key]));
 const plot=doc.createElementNS(ns,'polyline');plot.setAttribute('points',points.map((p,i)=>(48+i*370/(points.length-1))+','+(130-110*p[key]/max)).join(' '));svg.append(plot);
 for(const[y,label]of[[20,key==='accuracy'?'100%':max.toFixed(2)],[130,'0']]){const line=doc.createElementNS(ns,'line');for(const[k,v]of Object.entries({x1:45,x2:420,y1:y,y2:y}))line.setAttribute(k,String(v));svg.append(line);const t=doc.createElementNS(ns,'text');t.setAttribute('x','2');t.setAttribute('y',String(y+4));t.textContent=label;svg.append(t);}
 for(const[x,label]of[[48,'第'+points[0].round_id+'回'],[340,'第'+points.at(-1).round_id+'回']]){const t=doc.createElementNS(ns,'text');t.setAttribute('x',String(x));t.setAttribute('y','157');t.textContent=label;svg.append(t);}section.append(svg);return section;
}
export function renderGrowth(doc,root,evaluation,{currentRoundId,now=new Date()}={}){
 const g=growthSummary(evaluation,now),latest=g.rounds.find(r=>r.round_id===String(currentRoundId))||(!currentRoundId?g.rounds.at(-1):null);
 root.append(el(doc,'h3','最新回と直近の成長記録'),el(doc,'p','第'+(currentRoundId||latest?.round_id||'—')+'回：'+(latest?latest.metrics.hits+'的中 / '+latest.metrics.n+'試合確定（対象13試合）':'判定待ち・評価データ不足（対象13試合）')));
 for(const r of[g.recent5,g.recent10])root.append(el(doc,'p','直近'+r.requested+'完了回：'+(r.enough?pct(r.accuracy):'評価データ不足（'+r.round_count+'/'+r.requested+'回）')+' ／ 評価 '+r.n+'試合'));
 root.append(el(doc,'p','13試合すべてに配信証跡と確定結果がある回だけを直近5回・10回とグラフに含めます。部分確定回は上の最新回表示に残します。'));
 for(const[key,title]of[['accuracy','開催回ごとの本命的中率'],['logloss','LogLossの推移（低いほど良い）'],['brier','Brier Scoreの推移（低いほど良い）']])root.append(metricChart(doc,g.timeline,key,title));
 const details=doc.createElement('details');details.append(el(doc,'summary','グラフの数値とモデル使用履歴'));
 const table=doc.createElement('table');for(const[i,row]of[['回','的中率','LogLoss','Brier'],...g.timeline.map(p=>[p.round_id,pct(p.accuracy),p.logloss.toFixed(4),p.brier.toFixed(4)])].entries()){const tr=doc.createElement('tr');for(const value of row)tr.append(el(doc,i?'td':'th',String(value)));table.append(tr);}const scroll=el(doc,'div','');scroll.className='table-scroll';scroll.append(table);details.append(scroll);
 const history=evaluation?.model_history||[];details.append(el(doc,'p','モデル名・バージョンが配信証跡で最初に確認できた日時を表示します。正式な承認日時とは区別します。'));
 if(!history.length)details.append(el(doc,'p','モデル使用履歴の証跡が未取得です。過去の更新日を推測しません。'));
 for(const h of history)details.append(el(doc,'p',h.first_observed_at+'：'+h.name+' v'+h.version+' ／ 第'+h.round_id+'回'));
 root.append(details);return g;
}
