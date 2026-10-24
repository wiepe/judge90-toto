import '../assets/source-status.js';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, copyFileSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { digest, sourceDigest, roundMetadata, validateBundle } from './lib/integrity.mjs';

export const steps = ['fetch_jleague','build_team_metrics','fetch_toto','fetch_h2h','fetch_weather','predict','build_recommendation'];
export const outputs = ['data/jleague_matches.json','data/team_metrics.json','data/toto_matches.json','data/h2h.json','data/weather.json','predictions.json','recommendation.json'];
const json = path => JSON.parse(readFileSync(path,'utf8'));
function atomicJSON(path, value) {
  mkdirSync(resolve(path,'..'), { recursive:true });
  writeFileSync(path+'.tmp', JSON.stringify(value,null,2)+'\n'); renameSync(path+'.tmp',path);
}
export async function update({ root = process.cwd(), runner, now = () => new Date() } = {}) {
  const started_at = now().toISOString();
  const stage = mkdtempSync(join(tmpdir(),'judge90-update-'));
  cpSync(join(root,'data'),join(stage,'data'),{recursive:true});
  let step = 'prepare';
  let publishedBefore = null;
  try {
    for (step of steps) {
      console.log(`Updating: ${step}`);
      if (runner) await runner(step,stage);
      else {
        const child = await exec(process.execPath,[fileURLToPath(new URL(`./${step}.mjs`,import.meta.url))],{cwd:stage,timeout:20*60*1000,maxBuffer:4*1024*1024});
        process.stdout.write(child.stdout);process.stderr.write(child.stderr);
      }
    }
    step = 'validate';
    const round = json(join(stage,'data/toto_matches.json'));
    const pred = json(join(stage,'predictions.json'));
    const rec = json(join(stage,'recommendation.json'));
    const weather = json(join(stage,'data/weather.json'));
    validateBundle(round,pred,rec,weather,now());
    if (pred.source_digest !== sourceDigest(round) || rec.source_digest !== pred.source_digest) throw new Error('Prediction source digest mismatch');
    const dataset_id = digest({round,pred,rec,weather});
    for (const path of outputs) {
      const data = json(join(stage,path));
      data.dataset_id = dataset_id;
      if (['predictions.json','recommendation.json','data/weather.json'].includes(path)) Object.assign(data,roundMetadata(round));
      atomicJSON(join(stage,path),data);
    }
    step = 'archive';
    // Append-only snapshots; preserve the old published prediction, including legacy data.
    for (const path of ['predictions.json','recommendation.json']) {
      if (!existsSync(join(root,path))) continue;
      const old = json(join(root,path));
      const archive = join(root,'data/history',`${path.replace('.json','')}-${digest(old)}.json`);
      if (!existsSync(archive)) atomicJSON(archive,old);
    }
    step = 'publish';
    // Git commits publish this validated set atomically to Pages. No git operation occurs here.
    publishedBefore = new Map(outputs.map(path => [path,readFileSync(join(root,path))]));
    for (const path of outputs) {
      copyFileSync(join(stage,path),join(root,path)+'.tmp');
      renameSync(join(root,path)+'.tmp',join(root,path));
    }
    const snapshot = join(root,'data/history',`predictions-${digest(json(join(stage,'predictions.json')))}.json`);
    if (!existsSync(snapshot)) copyFileSync(join(stage,'predictions.json'),snapshot);
    const status = {state:'success',started_at,checked_at:now().toISOString(),dataset_id,...roundMetadata(round),weather_available:weather.available,data_quality:globalThis.Judge90DataSources.summarize(pred,weather,round),warnings:weather.matches.filter(m=>!m.available).map(m=>({source:'weather',number:m.number,reason:m.reason,used_in_prediction:false,severity:'reference_only',state:globalThis.Judge90DataSources.weatherState(m).state}))};
    atomicJSON(join(root,'data/update_status.json'),status);
    return status;
  } catch (error) {
    if (publishedBefore) {
      for (const [path,content] of publishedBefore) {
        writeFileSync(join(root,path)+'.rollback',content);
        renameSync(join(root,path)+'.rollback',join(root,path));
      }
    }
    atomicJSON(join(root,'data/update_status.json'),{state:'error',started_at,checked_at:now().toISOString(),failed_step:step,error:error.message.slice(0,500)});
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await update(); } catch (error) { console.error('Update failed; last published predictions retained:',error.message); process.exitCode=1; }
}
