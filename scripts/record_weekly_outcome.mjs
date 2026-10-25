import{readJSON,saveJSON}from'./lib/operation.mjs';
import{existsSync}from'node:fs';import{resolve}from'node:path';import{fileURLToPath}from'node:url';
export function weeklyOutcome(stages,{runId,attempt='1',now=new Date()}={}){
 if(!/^\d+$/.test(String(runId))||!/^\d+$/.test(String(attempt)))throw new Error('Invalid run identity');
 const required=['source','reconcile','evaluate','diagnostics','proposal','persist'];
 const failed=Object.entries(stages).filter(([,v])=>v==='failure'||v==='cancelled').map(([k])=>k);
 for(const k of required)if(stages[k]!=='success'&&!failed.includes(k))failed.push(k);
 return{schema_version:1,run_id:String(runId),attempt:String(attempt),checked_at:now.toISOString(),state:failed.length?'error':'success',failed_stages:failed,stages,production_model_changed:false,proposal_note:stages.propose==='skipped'?'条件未達または前段失敗でPR作成を省略':'PR作成ステップの結果。既存PRの場合も成功として記録'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=weeklyOutcome(JSON.parse(process.env.WEEKLY_STAGES),{runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});
 const target='data/research/operations/'+report.run_id+'-'+report.attempt+'.json';
 if(!existsSync(target))saveJSON(target,report);
 if(report.state==='error')saveJSON('data/research/status.json',{state:'error',checked_at:report.checked_at,error:'週次処理に失敗：'+report.failed_stages.join(', ')+'。前回の予測・評価ファイルを保持。',last_successful_update:existsSync('data/research/report.json')?readJSON('data/research/report.json').checked_at:null});
 console.log(JSON.stringify(report,null,2));
}
