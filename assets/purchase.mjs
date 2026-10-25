import{optimizeTickets,optimizePortfolio,ticketPrizeProbabilities}from'../scripts/lib/portfolio.mjs';
const pct=v=>(v*100).toFixed(4)+'%';
function el(doc,tag,text,cls){const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
export function comparePlans(matches,budget){
 if(![100,500,1000,3000].includes(budget))throw new Error('Unsupported budget');
 const individual=optimizeTickets(matches,budget),rectangular=optimizePortfolio(matches,budget);
 // Materialize only this bounded rectangular purchase (<=30 tickets); distinct
 // tickets let the same exact-union method handle overlapping prize events.
 let rows=[[]];for(const s of rectangular.selections)rows=rows.flatMap(r=>s.outcomes.map(k=>[...r,k]));
 rectangular.tickets=rows.map(outcomes=>({outcomes}));rectangular.prizes=ticketPrizeProbabilities(matches,rectangular.tickets);
 const shared=individual.tickets.filter(t=>rows.some(r=>r.join('')===t.outcomes.join(''))).length;
 return{individual,rectangular,shared_tickets:shared,combined_cost_yen:null,high_payout_available:false};
}
export function renderPurchase(doc,container,{current,predictions,evaluation,getCurrent},budget=1000){
 container.replaceChildren();if(!current||(getCurrent&&!getCurrent())){container.textContent='最新性を確認できないため、購入候補を停止しています。';return;}
 const buttons=el(doc,'div',undefined,'budget-buttons');
 for(const amount of[100,500,1000,3000]){const b=el(doc,'button',amount.toLocaleString('ja-JP')+'円');b.type='button';b.dataset.amount=String(amount);b.setAttribute('aria-pressed',String(amount===budget));b.onclick=()=>renderPurchase(doc,container,{current,predictions,evaluation,getCurrent},amount);buttons.append(b);}container.append(buttons);
 try{const plans=comparePlans(predictions.matches,budget);
 for(const [kind,plan]of Object.entries(plans).filter(([k])=>['individual','rectangular'].includes(k))){
  const panel=el(doc,'article',undefined,'panel purchase-plan');panel.dataset.kind=kind;
  panel.append(el(doc,'h3',kind==='individual'?'13試合的中を優先 · 個別口':'入力をまとめる · ダブル／トリプル'),el(doc,'p',plan.combinations+'口 · '+plan.cost_yen.toLocaleString('ja-JP')+'円 ／ 上限 '+budget.toLocaleString('ja-JP')+'円'),el(doc,'strong','全13試合の推定 '+pct(plan.estimated_all_13_covered_probability)));
  panel.append(el(doc,'p','最高等級別：1等 '+pct(plan.prizes.highest_prize['1'])+' ／ 2等 '+pct(plan.prizes.highest_prize['2'])+' ／ 3等 '+pct(plan.prizes.highest_prize['3']),'muted'));
  if(kind==='rectangular'){
   const list=el(doc,'div',undefined,'selection-grid');for(const s of plan.selections){const row=el(doc,'div');row.append(el(doc,'span','No.'+s.number),el(doc,'strong',s.outcomes.join(' / ')),el(doc,'small',({single:'シングル',double:'ダブル',triple:'トリプル'})[s.type]));list.append(row);}panel.append(list);
  }
  const details=el(doc,'details');details.append(el(doc,'summary',kind==='individual'?'購入候補をすべて見る':'展開した個別口を確認'));
  const list=el(doc,'ol');for(const t of plan.tickets)list.append(el(doc,'li',t.outcomes.join(' '),'ticket-line'));details.append(el(doc,'p','No.1→13。各行100円の別の口です。','muted'),list);panel.append(details);
  container.append(panel);
 }
 container.append(el(doc,'p','2方式は代替案です。同時購入を推奨しません。共通 '+plans.shared_tickets+'口。重複購入を有効口数に加算していません。','muted'),el(doc,'p','個別口は全13試合の確率を優先。2等・3等や期待収益の最大化ではありません。試合間の独立と通常の13試合成立を仮定。確率の誤差・試合間の相関・中止裁定は未反映。','caution'));
 const n=evaluation?.overall?.n||0;container.append(el(doc,'p','確率校正：'+(n?n+'試合で観測中。詳細は成績画面へ。':'実運用の確定結果がなく未評価。')+' 推定を実証済み当選確率として扱わないでください。','caution'));
 }catch{container.append(el(doc,'p','対象試合または確率が不正です。候補の計算を停止しました。','danger'));}
}
