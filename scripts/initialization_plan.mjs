import{existsSync,readdirSync,appendFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{readJSON}from'./lib/operation.mjs';
export function initializationPlan({status,researchStatus,receipts=[],now=new Date()}={}){
 const age=now-new Date(status?.checked_at);
 const researchAge=now-new Date(researchStatus?.checked_at);
 const research=!researchStatus||researchStatus.state!=='success'||!Number.isFinite(researchAge)||researchAge< -60000||researchAge>8*86400000;
 const delivered=receipts.some(r=>r.pages_delivered===true&&r.dataset_id===status?.dataset_id);
 const prediction=research||status?.state!=='success'||!Number.isFinite(age)||age< -60000||age>3*3600000||!delivered;
 return {prediction,research,reason:research?'Research has not initialized, failed, or is overdue':prediction?'Prediction or delivery evidence needs refresh':'Fresh prediction, delivery and research already recorded'};
}
export function inspectInitialization(root=process.cwd(),now=new Date()){
 const read=p=>existsSync(join(root,p))?readJSON(join(root,p)):null;
 const dir=join(root,'data/deliveries');const receipts=existsSync(dir)?readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>readJSON(join(dir,f))):[];
 return initializationPlan({status:read('data/update_status.json'),researchStatus:read('data/research/status.json'),receipts,now});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const p=inspectInitialization();console.log(JSON.stringify(p,null,2));if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`prediction=${p.prediction}\nresearch=${p.research}\n`);}
