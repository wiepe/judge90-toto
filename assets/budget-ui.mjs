import { optimizePortfolio } from '../scripts/lib/portfolio.mjs';
export function mountBudgetUI(doc,getContext){
  const input=doc.getElementById('budgetLimit'),result=doc.getElementById('budgetResult');
  if(!input||!result)return;
  function calculate(){
    const context=getContext();
    if(!context?.current){result.textContent='最新性を確認できないため、購入予算の計算を停止しています。';return;}
    try{
      const p=optimizePortfolio(context.predictions.matches,Number(input.value));
      result.textContent='上限 '+p.budget_limit_yen.toLocaleString('ja-JP')+'円 ／ 計算上の購入額 '+p.cost_yen.toLocaleString('ja-JP')+'円・'+p.combinations+'通り ／ 独立仮定で全13試合をカバーする推定 '+(p.estimated_all_13_covered_probability*100).toFixed(4)+'%。賞金・期待収益は算定していません。';
      const list=doc.createElement('div');list.className='budget-picks';
      for(const s of p.selections){const item=doc.createElement('span');item.textContent='No.'+s.number+'：'+s.outcomes.join('/');list.append(item);}result.append(list);
    }catch(e){result.textContent='100円〜1,000,000円の整数で上限を指定してください。データや入力を確認してください。';}
  }
  doc.getElementById('calculateBudget').addEventListener('click',calculate);
  for(const button of doc.querySelectorAll('[data-budget]'))button.addEventListener('click',()=>{input.value=button.dataset.budget;calculate();});
  doc.addEventListener('judge90:data',calculate);calculate();
}
if(typeof document!=='undefined')mountBudgetUI(document,()=>globalThis.Judge90BudgetContext?.());
