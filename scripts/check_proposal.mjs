import {existsSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readJSON,saveJSON} from './lib/operation.mjs';
const required=['minimum_samples','bootstrap_tail_resolution','draw_brier_not_worse','minimum_date_blocks','logloss_improves','brier_improves','accuracy_not_lower','draw_recall_improves','no_league_regression','paired_ci_below_zero'];
const canonical=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]))):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function proposalPlan({report,proposal,registration,now=new Date()}={}){
 const skip=reason=>({eligible:false,reason,branch:null});
 if(!report||!proposal)return skip('No statistically qualified proposal has been generated');
 if(report.proposal_eligible!==true||report.decision!=='propose_review_only')return skip('Confirmation gate has not passed; incumbent retained');
 if(!registration||!/^[a-f0-9]{64}$/.test(report.experiment_id||'')||proposal.experiment_id!==report.experiment_id||registration.experiment_id!==report.experiment_id)return skip('Experiment registration does not match');
 if(proposal.selected!==registration.selected||report.selected!==registration.selected||proposal.approval_required!==true||proposal.production_model_changed!==false||report.production_model_changed!==false)return skip('Candidate identity or human approval guard is invalid');
 const today=now.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(registration.protocol?.decision_not_before||'')||today<registration.protocol.decision_not_before)return skip('Fixed confirmation period has not ended');
 if(required.some(k=>report.checks?.[k]!==true)||!Object.values(report.checks).every(v=>v===true))return skip('One or more required statistical checks are missing or failed');
 if(!['J1','J2','J3'].every(l=>report.metrics?.[registration.selected]?.by_league?.[l]?.n>=registration.protocol.minimum_matches_per_league))return skip('Insufficient league samples');
 if(!['current','league_mean'].every(n=>report.bootstrap?.[n]?.ci?.length===2&&report.bootstrap[n].ci.every(Number.isFinite)&&report.bootstrap[n].ci[1]<0))return skip('Paired confidence intervals do not confirm improvement');
 for(const k of ['checks','metrics','bootstrap'])if(!same(proposal.evidence?.[k],report[k]))return skip('Proposal evidence differs from evaluated results');
 return {eligible:true,reason:'Registered fixed-window evidence passed; review proposal only',branch:'candidate/'+report.experiment_id.slice(0,12),experiment_id:report.experiment_id};
}
export function inspectProposal(root=process.cwd(),now=new Date()){
 const read=p=>existsSync(join(root,p))?readJSON(join(root,p)):null;
 const report=read('data/research/report.json'),proposal=read('research/proposed-model.json');
 let registration=read('research/continuous/registration.json');
 if(registration?.experiment_id!==report?.experiment_id&&/^[a-f0-9]{64}$/.test(report?.experiment_id||''))registration=read('data/research/registrations/'+report.experiment_id+'.json');
 const plan={...proposalPlan({report,proposal,registration,now}),checked_at:now.toISOString()};
 saveJSON(join(root,'data/research/proposal-status.json'),plan);return plan;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const plan=inspectProposal();console.log(JSON.stringify(plan,null,2));
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'eligible='+plan.eligible+'\nbranch='+(plan.branch||'')+'\n');
}
