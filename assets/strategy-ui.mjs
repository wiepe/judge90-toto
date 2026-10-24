import{optimizeTickets,optimizePortfolio}from'../scripts/lib/portfolio.mjs';
const percent=v=>(v*100).toFixed(4)+'%';
export function renderStrategies(doc,container,context){
 container.replaceChildren();
 if(!context?.current){container.textContent='最新性を確認できないため、予算別の購入計算を停止しています。';return;}
 try{for(const budget of[100,500,1000,3000]){
  const plan=optimizeTickets(context.predictions.matches,budget),rect=optimizePortfolio(context.predictions.matches,budget);
  const card=doc.createElement('article');card.className='strategy-card';
  const h=doc.createElement('h3');h.textContent='上限 '+budget.toLocaleString('ja-JP')+'円';card.append(h);
  const amount=doc.createElement('p');amount.textContent='個別 '+plan.combinations+'口 ／ '+plan.cost_yen.toLocaleString('ja-JP')+'円';card.append(amount);
  const p=doc.createElement('p');p.textContent='最高等級の推定：1等 '+percent(plan.prizes.highest_prize['1'])+' ／ 2等 '+percent(plan.prizes.highest_prize['2'])+' ／ 3等 '+percent(plan.prizes.highest_prize['3']);card.append(p);
  const note=doc.createElement('p');note.className='small';note.textContent='1等＝13試合すべて的中。最高等級の区分は重複しません。3等以上の推定 '+percent(plan.prizes.estimated_at_least_third_probability)+'。まとめ買い方式は '+rect.cost_yen+'円・全13試合 '+percent(rect.estimated_all_13_covered_probability)+'。';card.append(note);
  const details=doc.createElement('details'),summary=doc.createElement('summary');summary.textContent='個別買い目と選択根拠';details.append(summary);
  const reason=doc.createElement('p');reason.textContent=plan.objective+' No.1→13の順です。各行が100円の1口で、列を合成してダブル・トリプルにはしません。';details.append(reason);
  const list=doc.createElement('ol');list.className='ticket-list';for(const t of plan.tickets){const li=doc.createElement('li');li.textContent=t.outcomes.join(' ');list.append(li);}details.append(list);card.append(details);container.append(card);
 }}catch(e){container.textContent='試合・予測確率を検証できないため購入候補を表示できません。';}
}
if(typeof document!=='undefined'){
 const container=document.getElementById('fixedBudgetStrategies');
 if(container){const render=()=>renderStrategies(document,container,globalThis.Judge90BudgetContext?.());document.addEventListener('judge90:data',render);render();}
}
