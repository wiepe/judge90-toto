import{riskEstimate,deadlineText,appendMatchDetails}from'./forecast-details.mjs';
import{mountPersonal}from'./personal-ui.mjs';
import{renderPerformance}from'./performance.mjs';
import{optimizePortfolio}from'../scripts/lib/portfolio.mjs';
import {renderPurchase} from './purchase.mjs';
const keys=['1','0','2'],colors={'1':'home','0':'draw','2':'away'};
export const percent=(x,d=1)=>Number.isFinite(x)?(100*x).toFixed(d)+'%':'未評価';
export function element(doc,tag,text,className){const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
export function purchaseState(data,now=new Date()){
 const {predictions:p,recommendation:r,weather:w,status:s}=data;
 const checked=globalThis.Judge90DataStatus.assess(p,r,w,s,now);
 if(checked.current){try{optimizePortfolio(p.matches,100);}catch{return{current:false,code:'invalid',label:'確率データ不正 · 購入候補を停止',message:'13試合の番号・予測確率を検証できません。'};}}
 let code=checked.current?'ready':s?.state==='error'?'error':s?.state==='idle'?'idle':!p?'missing':now>=new Date(p.sales_close_at)?'closed':now<new Date(p.sales_open_at)?'not_open':'stale';
 return {...checked,code,label:({ready:'購入候補を確認できます',error:'取得失敗 · 購入候補を停止',idle:'販売対象なし · 過去予測',missing:'未更新 · データ未取得',closed:'販売終了 · 過去予測',not_open:'販売開始前',stale:'最新性未確認 · 購入候補を停止'})[code]};
}
export function navigate(doc,hash='#forecast'){
 const target=['forecast','purchase','performance'].includes(hash.slice(1))?hash.slice(1):'forecast';
 for(const id of ['forecast','purchase','performance'])doc.getElementById(id).hidden=id!==target;
 for(const a of doc.querySelectorAll('.bottom-nav a')){if(a.hash==='#'+target)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
}
export function renderDashboard(doc,data,now=new Date()){
 const openNumbers=new Set([...doc.querySelectorAll('.match-card')].filter(c=>c.querySelector('details')?.open).map(c=>c.dataset.number));
 const state=purchaseState(data,now),p=data.predictions,matches=[...(p?.matches||[])].sort((a,b)=>a.number-b.number);
 doc.getElementById('roundTitle').textContent=p?.round_id?'第'+p.round_id+'回 toto':'開催回未取得';
 const banner=doc.getElementById('purchaseState');banner.textContent=state.label;banner.dataset.state=state.code;banner.title=state.message;
 const date=new Date(p?.updated_at);doc.getElementById('freshness').textContent=Number.isFinite(date.getTime())?'予測更新 '+date.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+' JST ／ 締切 '+new Date(p.sales_close_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'予測更新日時：未取得';
 doc.getElementById('pickNotice').textContent=state.current?'本命13個は100円の1口。予算別のダブル・トリプルは「購入」へ。':'過去・未検証の予測です。最新の購入候補として使わないでください。';
 doc.getElementById('countdown').textContent=deadlineText(p?.sales_close_at,now);
 doc.getElementById('riskNotice').textContent='▲ 注意＝本命以外60%以上、△ 留意＝45%以上。モデル推定による分類です。';
 const strip=doc.getElementById('quickPicks'),cards=doc.getElementById('matchCards');strip.replaceChildren();cards.replaceChildren();
 for(const m of matches){
  const risk=riskEstimate(m),mini=element(doc,'button');mini.type='button';mini.setAttribute('aria-label','No.'+m.number+' '+m.home+'対'+m.away+' 本命'+m.prediction+' '+percent(risk?.picked)+' '+(risk?.label||'未評価')+' 詳細を開く');mini.append(element(doc,'small',String(m.number)),element(doc,'strong',m.prediction,colors[m.prediction]),element(doc,'span',percent(risk?.picked,0),'pick-probability'),element(doc,'small',risk?.label||'未評価'));strip.append(mini);
  const card=element(doc,'article',undefined,'match-card'),line=element(doc,'div',undefined,'match-line');
  const names=element(doc,'div',undefined,'team-names');names.append(doc.createTextNode(m.home),element(doc,'span','vs'),doc.createTextNode(m.away));line.append(element(doc,'span',String(m.number).padStart(2,'0'),'match-no'),names,element(doc,'span',m.prediction,'pick-pill '+colors[m.prediction]));card.append(line);
  const bar=element(doc,'div',undefined,'prob-bar'),labels=element(doc,'div',undefined,'prob-labels');bar.setAttribute('role','img');bar.setAttribute('aria-label',keys.map(k=>k+' '+percent(m.probabilities?.[k])).join('、'));
  for(const k of keys){const part=element(doc,'span');part.style.width=(Number.isFinite(m.probabilities?.[k])?Math.max(0,Math.min(1,m.probabilities[k]))*100:0)+'%';bar.append(part);labels.append(element(doc,'span',k+' · '+percent(m.probabilities?.[k]),colors[k]));}card.append(bar,labels);
  card.dataset.number=String(m.number);const details=element(doc,'details');details.open=openNumbers.has(String(m.number));details.append(element(doc,'summary','根拠・会場・データ欠損'));
  details.append(element(doc,'p',[m.league,m.match_date,m.kickoff,m.stadium].filter(Boolean).join(' ／ ')),element(doc,'p',(m.uncertainty?.reasons||[]).join('。')||'個別根拠は未取得'));
  appendMatchDetails(doc,details,m,p,data.teamMetrics);
  mini.onclick=()=>{details.open=true;card.scrollIntoView?.({behavior:'auto',block:'start'});details.querySelector('summary').focus();};
  const quality=data.status?.data_quality?.rows?.find(r=>r.number===m.number);details.append(element(doc,'p','天気：'+(quality?.weather?.label||'取得状態不明・利用は確認できません')));card.append(details);cards.append(card);
 }
 doc.getElementById('dataEvidence').textContent=state.message+' 予測使用：成績・フォーム・ホーム／アウェイ成績、取得できたH2H。天気・負傷・スタメンは本番2.1では未使用。';
 const budget=Number(doc.querySelector('#purchaseContent [aria-pressed=true]')?.dataset.amount)||1000;renderPurchase(doc,doc.getElementById('purchaseContent'),{current:state.current,predictions:p,evaluation:data.evaluation,getCurrent:()=>purchaseState(data,new Date()).current},budget);
 for(const b of doc.querySelectorAll('[data-quick-budget]'))b.onclick=()=>renderPurchase(doc,doc.getElementById('purchaseContent'),{current:purchaseState(data,new Date()).current,predictions:p,evaluation:data.evaluation,getCurrent:()=>purchaseState(data,new Date()).current},Number(b.dataset.quickBudget));
 renderPerformance(doc,doc.getElementById('performanceContent'),data.evaluation,now,{currentRoundId:p?.round_id});
 return state;
}
export async function loadDashboard(doc=globalThis.document,fetcher=fetch){
 const paths={predictions:'predictions.json',recommendation:'recommendation.json',weather:'data/weather.json',status:'data/update_status.json',evaluation:'data/evaluation.json',teamMetrics:'data/team_metrics.json'};
 const entries=await Promise.all(Object.entries(paths).map(async([k,path])=>{try{const r=await fetcher(path+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return[k,await r.json()];}catch{return[k,null];}}));return Object.fromEntries(entries);
}
if(typeof document!=='undefined'&&document.getElementById('quickPicks')){
 try{mountPersonal(document,document.getElementById('personalContent'));}catch{document.getElementById('personalContent').textContent='端末内の保存領域にアクセスできません。個人記録は保存していません。';}
 let data;const draw=()=>{if(data)renderDashboard(document,data);};
 loadDashboard().then(d=>{data=d;draw();}).catch(()=>{document.getElementById('purchaseState').textContent='表示に失敗しました · 購入候補は停止中';});
 navigate(document,location.hash||'#forecast');addEventListener('hashchange',()=>navigate(document,location.hash));setInterval(draw,60000);
}
