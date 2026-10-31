import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operate,discover } from '../scripts/operate.mjs';
import { reconcile,reconcileHistory,publicationWindow } from '../scripts/lib/operation.mjs';
import {matchFixture,teamRegistry} from '../scripts/lib/teams.mjs';
import { advertisedRounds,parseLotInfo } from '../scripts/lib/toto.mjs';
const clock=()=>new Date('2026-10-24T00:00:00Z');
const round={round_id:'1665',sales_close_at:'2026-10-24T04:50:00Z'};
function root(){const r=mkdtempSync(join(tmpdir(),'judge90-op-test-'));mkdirSync(join(r,'data'));writeFileSync(join(r,'predictions.json'),JSON.stringify({matches:[]}));return r;}
const fixtures={leagues:[]};
test('whole operation retries and records failures and success, preserving previous forecast',async()=>{
 const r=root();let calls=0;const waits=[];
 const status=await operate({root:r,now:clock,refreshResults:async()=>fixtures,discoverRound:async()=>round,updateRun:async()=>{if(++calls<3)throw new Error('temporary outage');return {state:'success'};},wait:async ms=>waits.push(ms)});
 assert.equal(status.state,'success');assert.equal(calls,3);assert.deepEqual(waits,[30000,60000]);assert.equal(readFileSync(join(r,'predictions.json'),'utf8'),'{"matches":[]}');
 const log=JSON.parse(readFileSync(join(r,'data/operations',readdirSync(join(r,'data/operations'))[0])));assert.equal(log.events.filter(e=>e.state==='attempt_error').length,2);assert.equal(log.events.at(-1).state,'success');
});
test('exhaustion retains old forecast, emits error and respects access denial without outer retries',async()=>{
 for(const error of ['temporary outage','robots.txt disallows /','Unknown team: test','Ambiguous team alias: test','Duplicate team ID: test']) {const r=root();let calls=0;await assert.rejects(operate({root:r,now:clock,refreshResults:async()=>fixtures,discoverRound:async()=>{calls++;throw new Error(error)},wait:async()=>{}}));assert.equal(calls,error==='temporary outage'?3:1);assert.equal(JSON.parse(readFileSync(join(r,'data/update_status.json'))).previous_data_retained,true);}
});
test('closed sales idle and near-deadline fail without calling prediction',async()=>{
 for(const selected of [null,{...round,sales_close_at:'2026-10-24T00:20:00Z'}]) {const r=root();const p=operate({root:r,now:clock,refreshResults:async()=>fixtures,discoverRound:async()=>selected,updateRun:async()=>{throw new Error('must not run')},wait:async()=>{}});if(selected)await assert.rejects(p,/Sales close/);else assert.equal((await p).state,'idle');}
 assert.equal(publicationWindow(round,clock()).on_time,true);
});
test('official discovery follows advertised round, ignoring expired default and switches automatically',async()=>{
 const html=readFileSync('tests/fixtures/toto-1665.html','utf8');
 const expired=html.replaceAll('1665','1664').replace('2026年10月24日 13:50','2026年10月23日 13:50')+'<a href="?holdCntId=1665">次回</a>';
 const requests=[];const selected=await discover({now:clock(),fetcher:async url=>{requests.push(url);return url.includes('holdCntId=')?readFileSync('tests/fixtures/toto-lot-1668.html','utf8').replaceAll('1668','1665').replaceAll('10月31日','10月24日').replaceAll('10/31','10/24'):expired;}});
 assert.equal(selected.round_id,'1665');assert.equal(requests.length,2);assert.ok(requests[1].includes('DisptotoLotInfo.form'));assert.deepEqual(advertisedRounds('<a href="?holdCntId=1666">x</a><option value="https://x/?holdCntId=1667">y</option>'),['1667','1666']);
});
const match={number:1,home:'H',away:'A',league:'J1',home_team_id:'h',away_team_id:'a',match_date:'2026-10-24',prediction:'0'};
function snapshot(){return {dataset_id:'x',product_id:'01',round_id:'1665',updated_at:'2026-10-24T00:00:00Z',sales_close_at:round.sales_close_at,matches:Array.from({length:13},(_,i)=>({...match,number:i+1}))};}
test('results require exact team IDs/date/league, full score and a completed calendar day; avoid live scores',()=>{
 const f={leagues:[{league:'J1',matches:[{...match,date:match.match_date,score:'1-1'}]}]};
 assert.equal(reconcile(snapshot(),f,clock()).completed,0);
 const result=reconcile(snapshot(),f,new Date('2026-10-25T00:00:00Z'));assert.equal(result.completed,13);assert.equal(result.hits,13);assert.equal(result.eligible,true);
 assert.equal(reconcile({...snapshot(),updated_at:'2026-10-25'},f).eligible,false);
 assert.equal(reconcile(snapshot(),{leagues:[{league:'J2',matches:f.leagues[0].matches}]}).completed,0);
});
test('multiple archived predictions count only latest eligible snapshot per round',()=>{
 const r=root();mkdirSync(join(r,'data/history'));const old=snapshot(),latest={...snapshot(),dataset_id:'new',updated_at:'2026-10-24T01:00:00Z'};
 writeFileSync(join(r,'predictions.json'),JSON.stringify(latest));writeFileSync(join(r,'data/history/predictions-old.json'),JSON.stringify(old));
 const report=reconcileHistory(r,{leagues:[]},clock());assert.equal(report.rounds.length,2);assert.equal(report.counted_snapshot_ids.length,1);
});
test('scheduled and manual executions share one pipeline and explicit Pages delivery',()=>{
 const y=readFileSync('.github/workflows/predict.yml','utf8');assert.match(y,/17 \*\/3 \* \* \*/);assert.match(y,/npm run operate/);assert.match(y,/actions\/deploy-pages@v4/);assert.match(y,/pages\/builds/);assert.match(y,/bash scripts\/push_main\.sh/);
});

test('real official onclick round links are extracted without executing JavaScript',()=>{
 assert.deepEqual(advertisedRounds(`<a href="#" onClick="ChengeCommodityId('07');AlertNoVote('PGSPSL00001Form','moveTotoSingleHoldCnt','1666'); return false;">第1666回</a>`),['1666']);
});

test('captured public lot info verifies 13 games, online deadline and IDs; rejects corruption',()=>{
 const html=readFileSync('tests/fixtures/toto-lot-1668.html','utf8');
 const r=parseLotInfo(html,{expectedRound:'1668',now:clock()});assert.equal(r.matches.length,13);assert.equal(r.matches[0].official_game_id,'55794');assert.equal(r.sales_close_at,'2026-10-31T13:50:00+09:00');
 assert.throws(()=>parseLotInfo(html,{expectedRound:'1666'}),/mismatch/);
 assert.throws(()=>parseLotInfo(html.replace('gameId=55794','gameId=x'),{allowClosed:true}),/game ID/);
 assert.throws(()=>parseLotInfo(html.replace('当サイト(ネット決済)','不明'),{allowClosed:true}),/sales time/);
});
test('public full team names join all 13 verified official fixtures by stable IDs',async()=>{
 const {matchFixture}=await import('../scripts/lib/teams.mjs');
 const r=parseLotInfo(readFileSync('tests/fixtures/toto-lot-1668.html','utf8'),{now:clock()});
 const fixtures=JSON.parse(readFileSync('tests/fixtures/jleague-1668.json'));
 assert.equal(r.matches.map(m=>matchFixture(m,fixtures)).length,13);
});
test('result-fetch retry recovers and clears the independent error',async()=>{
 const r=root();let calls=0;
 const status=await operate({root:r,now:clock,refreshResults:async()=>{if(++calls<2)throw new Error('timeout');return fixtures;},discoverRound:async()=>null,wait:async()=>{}});
 assert.equal(calls,2);assert.equal(status.result_error,null);
});
test('manual wrapper permissions allow the exact shared pipeline',()=>{
 for(const file of ['fetch-toto','fetch-jleague','fetch-h2h','fetch-weather','build-team-metrics']) {
 const text=readFileSync('.github/workflows/'+file+'.yml','utf8');assert.match(text,/uses: .\/\.github\/workflows\/predict.yml/);assert.match(text,/pages: write/);assert.match(text,/id-token: write/);
 }
});
test('overlapping sales keep the earliest closing round until its deadline',async()=>{
 const old=readFileSync('tests/fixtures/toto-1665.html','utf8')+'<a href="?holdCntId=1668">next</a>';
 const future=readFileSync('tests/fixtures/toto-lot-1668.html','utf8');
 const selected=await discover({now:clock(),fetcher:async url=>url.includes('holdCntId=')?future:old});assert.equal(selected.round_id,'1665');
});
test('post-delivery check fails for missing Pages delivery and for an expired newly generated forecast',async()=>{
 const {execFile}=await import('node:child_process');
 const {promisify}=await import('node:util');const exec=promisify(execFile);
 const script=new URL('../scripts/check_delivery.mjs',import.meta.url).pathname;
 for(const [delivered,close,ok] of [['true','2100-01-01T00:00:00Z',true],['false','2100-01-01T00:00:00Z',false],['true','2000-01-01T00:00:00Z',false]]){
  const r=root();writeFileSync(join(r,'data/update_status.json'),JSON.stringify({state:'success'}));writeFileSync(join(r,'predictions.json'),JSON.stringify({sales_close_at:close}));
  let success=true;try{await exec(process.execPath,[script],{cwd:r,env:{...process.env,PAGES_DELIVERED:delivered},stdio:'pipe'});}catch{success=false;}assert.equal(success,ok);assert.equal(JSON.parse(readFileSync(join(r,'delivery-status.json'))).pages_delivered,delivered==='true');
 }
});

test('round 1669 official full names join all 13 fixtures using verified existing team IDs',()=>{
 const full=parseLotInfo(readFileSync('tests/fixtures/toto-lot-1669.html','utf8'),{now:new Date('2026-10-31T12:00:00Z'),expectedRound:'1669'});
 const fixtures=JSON.parse(readFileSync('tests/fixtures/jleague-1669.json'));
 const joined=full.matches.map(m=>matchFixture(m,fixtures));
 assert.equal(joined.length,13);assert.equal(joined.filter(m=>m.league==='J2').length,10);assert.equal(joined.filter(m=>m.league==='J3').length,3);
 assert.equal(joined[3].home,'山形');assert.equal(joined[3].home_team_id,'j90-9c204ad92d5d');
 const evidence=JSON.parse(readFileSync('docs/sources/toto-1669-team-aliases.json'));
 const resolve=teamRegistry();for(const row of evidence.aliases){assert.equal(resolve(row.full_name).id,row.team_id);assert.equal(resolve(row.short_name).id,row.team_id);}
 assert.throws(()=>resolve('未検証の山形クラブ'),/Unknown team/);
});
