import { readFileSync, writeFileSync } from 'node:fs';
import { optimizePortfolio } from '../lib/portfolio.mjs';
const [input,output,...budgets]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/research/budget_report.mjs input.json output.json [100 1000 5000]');
const data=JSON.parse(readFileSync(input,'utf8'));
const values=budgets.length?budgets.map(Number):[100,1000,5000,10000];
const report={research_only:true,source:input,round_id:data.round_id||null,source_note:data.note||'Input probabilities supplied by caller. Freshness and real toto round identity must be checked separately before use.',probability_warning:'試合間の独立を仮定したモデル上の推定値です。実際の当選確率・賞金・期待収益を保証しません。',plans:values.map(b=>optimizePortfolio(data.matches,b))};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(values.map((b,i)=>`${b} yen: cost=${report.plans[i].cost_yen}, estimated coverage=${report.plans[i].estimated_all_13_covered_probability}`).join('\n'));
