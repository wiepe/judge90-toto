import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,cpSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchText } from './lib/http.mjs';
import { parseToto,parseLotInfo,advertisedRounds } from './lib/toto.mjs';
import { update } from './update.mjs';
import { readJSON,saveJSON,reconcileHistory,publicationWindow } from './lib/operation.mjs';
const exec=promisify(execFile);
export const lotEndpoint='https://store.toto-dream.com/dcs/subos/screen/pi01/spin000/PGSPIN00001DisptotoLotInfo.form';
const endpoint='https://store.toto-dream.com/dcs/subos/screen/ps01/spsl000/PGSPSL00001InitTotoSingle.form?commodityId=01';
export async function discover({fetcher=fetchText,now=new Date()}={}) {
  const html=await fetcher(endpoint);let initial;
  try {initial=parseToto(html,{allowClosed:true,now});}catch{} // A closed landing page may advertise another open round.
  const ids=new Set([...(initial?[initial.round_id]:[]),...advertisedRounds(html)]);
  const candidates=[];const errors=[];
  if(initial)candidates.push(initial);
  for(const id of ids) {if(id===initial?.round_id)continue;try{candidates.push(parseLotInfo(await fetcher(lotEndpoint+'?holdCntId='+id),{expectedRound:id,allowClosed:true,now}));}catch(e){if(!e.message.includes('does not offer 13-match toto'))errors.push(e.message);}}
  const open=candidates.filter(r=>now>=new Date(r.sales_open_at)&&now<new Date(r.sales_close_at)).sort((a,b)=>Date.parse(a.sales_close_at)-Date.parse(b.sales_close_at)||Number(a.round_id)-Number(b.round_id));
  if(open.length)return open[0];
  // Fail visibly if an advertised page cannot be verified, rather than report a healthy idle state.
  if(errors.length||!ids.size)throw new Error('Cannot verify advertised toto rounds: '+errors.join('; '));
  return null;
}
export async function operate({root=process.cwd(),now=()=>new Date(),discoverRound=discover,updateRun=update,refreshResults,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=3}={}) {
  const executionStart=performance.now();
  const run_id=randomUUID(),events=[];let resultError;
  const record=e=>{events.push({...e,at:now().toISOString()});saveJSON(join(root,'data/operations',run_id+'.json'),{run_id,events});};
  record({state:'started',trigger:process.env.GITHUB_EVENT_NAME||'local'});
  for(let resultAttempt=1;resultAttempt<=attempts;resultAttempt++) {
   try {
    let fixtures;
    if(refreshResults)fixtures=await refreshResults();
    else {
      const scratch=mkdtempSync(join(tmpdir(),'judge90-results-'));
      try {cpSync(join(root,'data'),join(scratch,'data'),{recursive:true});await exec(process.execPath,[fileURLToPath(new URL('./fetch_jleague.mjs',import.meta.url))],{cwd:scratch,timeout:2*60000,maxBuffer:4*1024*1024});fixtures=readJSON(join(scratch,'data/jleague_matches.json'));}finally{rmSync(scratch,{recursive:true,force:true});}
    }
    const results=reconcileHistory(root,fixtures,now());resultError=null;record({state:'results_success',attempt:resultAttempt,completed:results.completed});break;
  } catch(e) {resultError=e.message;record({state:'results_error',attempt:resultAttempt,error:e.message});if(/robots\.txt|HTTP (401|403|429)/.test(e.message)||resultAttempt===attempts)break;await wait(resultAttempt*30000);}
  }
  let last;
  for(let attempt=1;attempt<=attempts;attempt++) {
    try {
      if(performance.now()-executionStart>25*60000)throw new Error('Operation execution budget exhausted');
      const round=await discoverRound({now:now()});
      if(!round) {
        const status={state:'idle',checked_at:now().toISOString(),message:'販売中の13試合totoを確認できません。前回予想を過去データとして保持します。',result_error:resultError||null};
        saveJSON(join(root,'data/update_status.json'),status);record(status);return status;
      }
      if(performance.now()-executionStart>25*60000)throw new Error('Operation execution budget exhausted');
      const publication=publicationWindow(round,now());
      if(!publication.on_time)throw new Error('Sales close is less than 30 minutes away; retaining last forecast');
      // Scope the requested official round to this update only. The pipeline re-fetches and validates it.
      const old=process.env.JUDGE90_ROUND;process.env.JUDGE90_ROUND=round.round_id;
      let status;try{status=await updateRun({root,now});}finally{if(old===undefined)delete process.env.JUDGE90_ROUND;else process.env.JUDGE90_ROUND=old;}
      if(resultError){status.result_error=resultError;saveJSON(join(root,'data/update_status.json'),status);}
      record({state:'success',attempt,round_id:round.round_id,dataset_id:status.dataset_id,publication:status.publication,result_error:resultError||null});return status;
    }catch(e){last=e;record({state:'attempt_error',attempt,error:e.message});
      // Access refusals and explicit long Retry-After must not be bypassed by an outer retry.
      if(/robots\.txt|HTTP (401|403|429)|Sales close|30 minutes|execution budget/.test(e.message)||attempt===attempts)break;
      await wait(attempt*30000);
    }
  }
  const status={state:'error',checked_at:now().toISOString(),failed_step:'automatic_operation',error:last.message,previous_data_retained:true};
  saveJSON(join(root,'data/update_status.json'),status);record(status);throw last;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{await operate();}catch(e){console.error(e.message);process.exitCode=1;}
}
