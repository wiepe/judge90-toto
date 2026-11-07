import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectRoundSupport,verifyCupGame,gameInfoURL } from '../scripts/lib/round-support.mjs';
import { operate } from '../scripts/operate.mjs';
const round=JSON.parse(readFileSync('tests/fixtures/round-1672.json'));
const fixtures=JSON.parse(readFileSync('tests/fixtures/jleague-1672.json'));
const now=()=>new Date('2026-11-07T13:10:20Z');
const cup=url=>readFileSync('tests/fixtures/cup-'+new URL(url).searchParams.get('gameid')+'.html','utf8');
const inspector=(r,f)=>inspectRoundSupport(r,f,{fetcher:async url=>cup(url)});

test('1672 is four verified cup games plus nine supported league games, not a broken alias',async()=>{
 const calls=[];const s=await inspectRoundSupport(round,fixtures,{fetcher:async url=>{calls.push(url);return cup(url)}});
 assert.equal(s.supported,false);assert.deepEqual(s.unsupported.map(m=>m.number),[1,2,3,4]);assert.equal(calls.length,4);
 assert.equal(s.unsupported[0].competition,'league_cup');assert.equal(s.unsupported[0].official_game_id,'58604');
});
test('wrong date, teams, ambiguous headings, malformed pages and league labels cannot become unsupported',()=>{
 const html=cup(gameInfoURL('58604')),m=round.matches[0];
 for(const bad of [html.replace('2026年11月15日','2026年11月16日'),html.replace('町田勝ち','柏勝ち'),html.replace('神戸勝ち','鹿島勝ち'),html.replace('リーグカップ戦','Ｊ１'),html.replace('</thead>','<tr><th>リーグカップ戦</th></tr></thead>'),'<html>unavailable</html>'])assert.throws(()=>verifyCupGame(bad,m));
 assert.throws(()=>gameInfoURL('58604&other=x'),/Invalid/);
});
test('supported rounds require no extra remote request; unknown teams and duplicate fixtures still fail',async()=>{
 const regular=JSON.parse(readFileSync('tests/fixtures/jleague-1668.json'));
 const {parseLotInfo}=await import('../scripts/lib/toto.mjs');const r=parseLotInfo(readFileSync('tests/fixtures/toto-lot-1668.html','utf8'),{allowClosed:true});
 assert.equal((await inspectRoundSupport(r,regular,{fetcher:async()=>{throw Error('must not fetch')}})).supported,true);
 const unknown=structuredClone(round);unknown.matches[0].home='未登録クラブ';await assert.rejects(inspectRoundSupport(unknown,fixtures),/Unknown team/);
 const duplicate=structuredClone(regular);duplicate.leagues[0].matches.push(duplicate.leagues[0].matches[0]);await assert.rejects(inspectRoundSupport(r,duplicate),/exactly once/);
});
function root(){const p=mkdtempSync(join(tmpdir(),'j90-cup-'));mkdirSync(join(p,'data'));writeFileSync(join(p,'predictions.json'),JSON.stringify({round_id:'1670',matches:[]}));writeFileSync(join(p,'recommendation.json'),'saved-purchase-candidates');return p;}
test('confirmed unsupported round exits once, retains forecast/purchases and continues result evaluation',async()=>{
 const r=root();let checks=0,results=0;const before=readFileSync(join(r,'predictions.json'),'utf8');
 const status=await operate({root:r,now,refreshResults:async()=>{results++;return fixtures},discoverRound:async()=>round,checkSupport:async(...args)=>{checks++;return inspector(...args)},updateRun:async()=>{throw Error('must not predict cup')},wait:async()=>{throw Error('must not retry unsupported')}});
 assert.equal(status.state,'idle');assert.equal(status.reason,'unsupported_competition');assert.equal(status.target_round_id,'1672');assert.equal(status.unsupported_matches.length,4);
 assert.equal(checks,1);assert.equal(results,1);assert.equal(readFileSync(join(r,'predictions.json'),'utf8'),before);assert.equal(readFileSync(join(r,'recommendation.json'),'utf8'),'saved-purchase-candidates');
 assert.equal(JSON.parse(readFileSync(join(r,'data/evaluation.json'))).overall.n,0);
 const log=JSON.parse(readFileSync(join(r,'data/operations',readdirSync(join(r,'data/operations'))[0])));assert.ok(log.events.some(e=>e.state==='results_success'));assert.equal(log.events.filter(e=>e.state==='attempt_error').length,0);
 // A subsequent supported round automatically resumes the existing updater.
 let updated=0;await operate({root:r,now,refreshResults:async()=>fixtures,discoverRound:async()=>({...round,round_id:'next'}),checkSupport:async()=>({supported:true,unsupported:[]}),updateRun:async()=>{updated++;return {state:'success'}}});assert.equal(updated,1);
});
test('policy refusal fails without outer retry; transient failures retry; neither is downgraded to idle',async()=>{
 for(const message of ['robots.txt disallows /','HTTP 403: source','temporary timeout']){
  const r=root();let calls=0;
  await assert.rejects(operate({root:r,now,refreshResults:async()=>fixtures,discoverRound:async()=>round,checkSupport:async()=>{calls++;throw Error(message)},wait:async()=>{}}));
  assert.equal(calls,message==='temporary timeout'?3:1);assert.equal(JSON.parse(readFileSync(join(r,'data/update_status.json'))).state,'error');
 }
});
test('result-source failure never uses stale league data to claim a supported waiting state',async()=>{
 const r=root();let checks=0;
 await assert.rejects(operate({root:r,now,refreshResults:async()=>{throw Error('robots.txt disallows /')},discoverRound:async()=>round,checkSupport:async()=>{checks++;return {supported:false}},updateRun:async()=>{throw Error('fixtures unavailable')},wait:async()=>{}}));
 assert.equal(checks,0);assert.equal(JSON.parse(readFileSync(join(r,'data/update_status.json'))).state,'error');
});
