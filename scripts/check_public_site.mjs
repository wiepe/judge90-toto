import{readFileSync}from'node:fs';import{resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import{JSDOM}from'jsdom';
import{fetch as transport}from'undici';
import{fetchText}from'./lib/http.mjs';import'../assets/data-status.js';import{renderValidation}from'../assets/validation-ui.mjs';import{renderDashboard}from'../assets/dashboard.mjs';
const fingerprint=s=>createHash('sha256').update(s).digest('hex');
export function assertPublicMime(path,type){
 const expected=/\.m?js$/.test(path)?/(?:application|text)\/(?:java|ecma)script/i:/\.html$/.test(path)?/text\/html/i:/\.css$/.test(path)?/text\/css/i:null;
 if(expected&&!expected.test(type||''))throw new Error('Browser-incompatible content type for '+path+': '+type);
}
async function publicText(url){return fetchText(url,{fetchImpl:async(target,options)=>{const response=await transport(target,options);if(response.ok)assertPublicMime(new URL(target).pathname,response.headers.get('content-type'));return response;}});}
export async function checkPublicSite({base='https://wiepe.github.io/judge90-toto/',fetcher=publicText,root=process.cwd(),now=new Date()}={}){
 const paths=['index.html','validation.html','assets/validation-ui.mjs','assets/strategy-ui.mjs','assets/budget-ui.mjs','assets/data-status.js','assets/validation.css','scripts/lib/portfolio.mjs','analysis.html','assets/dashboard.mjs','assets/dashboard.css','assets/purchase.mjs','assets/performance.mjs','scripts/lib/scoring.mjs','assets/personal-ui.mjs','assets/private-ledger.mjs','assets/forecast-details.mjs','assets/growth.mjs','research/diagnostics.html','assets/diagnostics.mjs'];
 const checked=[];
 for(const path of paths){const text=await fetcher(new URL(path,base));if(fingerprint(text)!==fingerprint(readFileSync(resolve(root,path),'utf8')))throw new Error('Published asset differs from release: '+path);checked.push(path);}
 const pathsJSON={teamMetrics:'data/team_metrics.json',predictions:'predictions.json',recommendation:'recommendation.json',weather:'data/weather.json',status:'data/update_status.json',evaluation:'data/evaluation.json',research:'data/research/report.json',researchStatus:'data/research/status.json',registration:'research/continuous/registration.json'};
 const data={};for(const[k,path]of Object.entries(pathsJSON))data[k]=JSON.parse(await fetcher(new URL(path,base)));
 const idleAge=now-new Date(data.status?.checked_at);const healthyIdle=data.status?.state==='idle'&&Number.isFinite(idleAge)&&idleAge>=-60000&&idleAge<=6*3600000;
 if((!healthyIdle&&data.predictions.dataset_id!==data.status.dataset_id)||data.predictions.dataset_id!==data.recommendation.dataset_id)throw new Error('Published dataset generations do not match');
 if(data.registration.experiment_id!==data.research.experiment_id){const id=data.research.experiment_id;if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid active experiment');data.registration=JSON.parse(await fetcher(new URL('data/research/registrations/'+id+'.json',base)));}
 const top=new JSDOM(readFileSync(resolve(root,'index.html'),'utf8'));try{renderDashboard(top.window.document,data,now);if(top.window.document.querySelectorAll('.match-card').length!==13)throw new Error('Top page missing matches');}finally{top.window.close();}
 const dom=new JSDOM(readFileSync(resolve(root,'validation.html'),'utf8'));
 try{
  const state=renderValidation(dom.window.document,data,now),doc=dom.window.document;
  if(data.predictions.matches?.length!==13||data.recommendation.matches?.length!==13)throw new Error('Published match set incomplete');
  const budgets=doc.querySelectorAll('.strategy-card').length;
  if(state.current&&budgets!==4)throw new Error('Fresh site did not render four budgets');
  if(!state.current&&budgets!==0)throw new Error('Stale predictions must not render purchase candidates');
  if(!state.current&&!healthyIdle)throw new Error('Published prediction is not current: '+state.message);
  return {checked_at:now.toISOString(),base,browser_mime_checked:fetcher===publicText,assets:checked.length,round_id:data.predictions.round_id,updated_at:data.predictions.updated_at,current:state.current,healthy_idle:healthyIdle,status_message:state.message,budget_cards:budgets,model_options:doc.querySelectorAll('#comparisonMatch option').length,verified_results:data.evaluation.overall.n,research_state:data.researchStatus.state,production_model_version:data.predictions.model?.version};
 }finally{dom.window.close();}
}
export async function verifyPublicSite({attempts=3,sleep=ms=>new Promise(r=>setTimeout(r,ms)),checker=checkPublicSite,...options}={}){
 for(let attempt=1;attempt<=attempts;attempt++){
  try{return await checker(options);}catch(e){if(/robots\.txt|HTTP (401|403|429)/.test(e.message)||attempt===attempts)throw e;await sleep(15000*attempt);}
 }
 throw new Error('Invalid verification attempt count');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(await verifyPublicSite(),null,2));}catch(e){console.error('Public site verification failed:',e.message);process.exitCode=1;}}
