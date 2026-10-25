import{renderGrowth}from'./growth.mjs';
import{summarizePerformance}from'../scripts/lib/scoring.mjs';
const pct=x=>Number.isFinite(x)?(x*100).toFixed(1)+'%':'未評価',num=x=>Number.isFinite(x)?x.toFixed(4):'未評価';
function el(d,t,text){const e=d.createElement(t);e.textContent=text;return e;}
function table(doc,root,headers,rows){const wrap=el(doc,'div','');wrap.className='table-scroll';const t=doc.createElement('table');for(const[i,row]of[headers,...rows].entries()){const tr=doc.createElement('tr');for(const v of row)tr.append(el(doc,i?'td':'th',String(v)));t.append(tr);}wrap.append(t);root.append(wrap);}
export function renderPerformance(doc,root,evaluation,now=new Date(),context={}){
 root.replaceChildren();if(!evaluation){root.append(el(doc,'p','成績データを取得できません。未評価です。'));return;}
 renderGrowth(doc,root,evaluation,{...context,now});
 const s=summarizePerformance(evaluation.rows||[],now),m=s.long_term;
 root.append(el(doc,'h3','配信証跡付き '+m.n+'試合'),el(doc,'p',m.n?'公開時点が確認できる予測のみ。未確定結果は除外。':'確定した実運用成績がなく、精度・校正は未評価です。'));
 table(doc,root,['期間','試合','的中率','LogLoss','Brier'],[['長期',s.long_term],['直近30日',s.recent_30_days],['直近90日',s.recent_90_days]].map(([n,x])=>[n,x.n,pct(x.accuracy),num(x.logloss),num(x.brier)]));
 root.append(el(doc,'h3','開催回ごとの本命成績'));table(doc,root,['開催回','的中 / 確定','全13試合'],Object.entries(s.by_round).map(([id,x])=>[id,x.hits+' / '+x.n,x.n===13?'全試合照合済み':'未確定・未検証あり']));
 root.append(el(doc,'h3','1・0・2別の検出'));table(doc,root,['結果','実際','本命','適合率','検出率'],['1','0','2'].map(k=>{const x=m.by_outcome?.[k]||{};return[k,x.actual||0,x.picks||0,pct(x.precision),pct(x.recall)];}));
 root.append(el(doc,'h3','リーグ別'));table(doc,root,['リーグ','試合','的中率','LogLoss','Brier'],['J1','J2','J3'].map(k=>{const x=evaluation.by_league?.[k]||{};return[k,x.n||0,pct(x.accuracy),num(x.logloss),num(x.brier)];}));
 root.append(el(doc,'h3','本番モデル別の長期成績'));table(doc,root,['モデル','試合','的中率','LogLoss'],Object.entries(s.by_model).map(([k,x])=>[k,x.n,pct(x.accuracy),num(x.logloss)]));
 root.append(el(doc,'h3','本番モデル別・月次推移'));table(doc,root,['年月 / モデル','試合','的中率','LogLoss'],Object.entries(s.by_month_model).map(([k,x])=>[k,x.n,pct(x.accuracy),num(x.logloss)]));
 const details=doc.createElement('details');details.append(el(doc,'summary','確率の校正・引き分け・過去予測を確認'));
 details.append(el(doc,'p','校正誤差（10ビン・macro ECE）：'+num(m.calibration?.macro_ece)+'。標本数に依存する記述統計で、校正済みの保証や採用条件ではありません。'));
 for(const k of['1','0','2']){details.append(el(doc,'h3',k+' の予測確率と実際'));table(doc,details,['確率帯','試合','平均予測','実際の割合'],(m.calibration?.by_outcome[k].bins||[]).map(b=>[pct(b.lower)+'〜'+pct(b.upper),b.n,pct(b.mean_probability),pct(b.observed_rate)]));}
 table(doc,details,['回 / No.','対戦','本命→結果'],s.draw_cases.map(r=>[r.round_id+' / '+r.number,r.home+' − '+r.away,r.prediction+' → '+r.actual+(r.hit?' 的中':' 不的中')]));
 table(doc,details,['回 / No.','対戦','本命→結果'],(evaluation.rows||[]).map(r=>[r.round_id+' / '+r.number,r.home+' − '+r.away,r.prediction+' → '+r.actual]));root.append(details);
 root.append(el(doc,'p','研究候補は別の固定した未使用期間で評価します。2025年の既評価期間を選択に再利用しません。途中の指標を見て本番モデルを自動交換しません。'));
}
