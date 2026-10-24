import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { load } from 'cheerio';
import { JSDOM } from 'jsdom';
import { parseToto } from '../scripts/lib/toto.mjs';
import { teamRegistry, matchFixture } from '../scripts/lib/teams.mjs';
import { requestText, fetchText } from '../scripts/lib/http.mjs';
import { digest, sourceDigest, validateBundle, validateRound, roundMetadata } from '../scripts/lib/integrity.mjs';
import { update, outputs, steps } from '../scripts/update.mjs';
const root = resolve('.');
const html = readFileSync(new URL('./fixtures/toto-1665.html',import.meta.url),'utf8');
const now = new Date('2026-10-24T00:00:00Z');
const parse = (s=html, options={}) => parseToto(s,{now,...options});
const mutate = fn => { const $=load(html); fn($); return $.html(); };
const source = JSON.parse(readFileSync(new URL('./fixtures/jleague-1665.json',import.meta.url),'utf8'));
const round = () => ({...parse(), fetched_at:now.toISOString(),matches:parse().matches.map(m=>matchFixture(m,source))});
test('real sanitized page: nested tables and duplicated betting blocks yield official 1..13',()=>{
  const r=parse();assert.equal(r.round_id,'1665');assert.equal(r.product_id,'01');assert.equal(r.matches.length,13);assert.equal(r.matches[12].official_game_id,'56173');assert.equal(r.sales_close_at,'2026-10-24T13:50:00+09:00');
});
test('missing 3 matches (the observed 10-match failure) is rejected, never filled or sliced',()=>assert.throws(()=>parse(mutate($=>$('tr').filter((_,tr)=>$(tr).find('input[name^="chkbox_"]').filter((_,i)=>Number($(i).attr('name').split('_')[2])>=10).length).remove())),/found 10/));
test('conflicting duplicate match is rejected',()=>assert.throws(()=>parse(mutate($=>$('td').filter((_,td)=>$(td).text()==='広島').first().text('神戸'))),/Conflicting/));
test('mini toto / missing metadata / wrong expected round are rejected',()=>{
  assert.throws(()=>parse(mutate($=>$('[name=commodityId]').val('06'))),/13-match/);
  assert.throws(()=>parse(mutate($=>$('[name=thisDispHoldCntId]').remove())),/missing|Missing/);
  assert.throws(()=>parse(html,{expectedRound:'1666'}),/Round mismatch/);
});
test('official numbering cannot be reconstructed from row order',()=>assert.throws(()=>parse(mutate($=>$('input[name="chkbox_0_0_0"]').attr('name','chkbox_0_13_0'))),/outside/));
test('all calendar months including March and August are parsed',()=>{
  for(const month of ['03','08']) {
    const r=parse(html.replaceAll('10/',month+'/').replaceAll('10月',Number(month)+'月'),{now:new Date(`2026-${month}-24T00:00:00Z`)});
    assert.equal(r.matches[0].match_date,`2026-${month}-24`);
  }
});
test('year rollover resolves January matches from December sales period',()=>{
  const s=html.replace('2026年10月21日 08:00～2026年10月24日 13:50','2026年12月28日 08:00～2027年1月1日 13:50').replaceAll('10/24','01/01').replaceAll('10/25','01/02');
  assert.equal(parse(s,{now:new Date('2026-12-31T00:00:00Z')}).matches[0].match_date,'2027-01-01');
});
test('expired / not yet open / invalid calendar dates are rejected',()=>{
  assert.throws(()=>parse(html,{now:new Date('2026-10-24T04:50:00Z')}),/sales period/);
  assert.throws(()=>parse(html,{now:new Date('2026-10-20T00:00:00Z')}),/sales period/);
  assert.throws(()=>parse(html.replaceAll('10/24','02/30')),/date/);
});
test('stable internal IDs resolve aliases regardless of season league',()=>{
  const resolveTeam=teamRegistry();assert.equal(resolveTeam('ファジアーノ岡山').id,resolveTeam('岡山').id);assert.equal(resolveTeam('ＦＣ東京').id,resolveTeam('FC東京').id);
  assert.equal(matchFixture({...parse().matches[0],home:'ファジアーノ岡山',away:'神戸'}, {leagues:[{league:'J1',matches:[{home:'岡山',away:'神戸',date:parse().matches[0].match_date,score:null}]}]}).league,'J1');
  const data={leagues:[{league:'J3',matches:[{home:'岡山',away:'神戸',date:parse().matches[0].match_date,score:null}]}]};
  assert.equal(matchFixture({...parse().matches[0],home:'岡山',away:'神戸'},data).league,'J3');
  assert.throws(()=>resolveTeam('未登録クラブ'),/Unknown/);
});
test('missing / ambiguous / completed fixture fails closed',()=>{
  assert.throws(()=>matchFixture(parse().matches[0],{leagues:[]}),/exactly once/);
  const m=round().matches[0];const game={home:m.home,away:m.away,date:m.match_date,score:'1-0'};
  assert.throws(()=>matchFixture(m,{leagues:[{league:'J1',matches:[game]}]}),/completed/);
  assert.throws(()=>matchFixture(m,{leagues:[{league:'J1',matches:[game,game]}]}),/exactly once/);
});
test('HTTP retries network and 5xx failures, then succeeds',async()=>{
  let calls=0;const waits=[];
  const text=await requestText('https://example.test/data',{fetchImpl:async()=>{calls++;if(calls===1)throw new Error('timeout');return new Response(calls===2?'busy':'ok',{status:calls===2?503:200});},sleep:async ms=>waits.push(ms)});
  assert.equal(text,'ok');assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);
});
test('HTTP respects Retry-After, permanent 403 and exhaustion',async()=>{
  let calls=0, waited;
  await requestText('https://example.test',{fetchImpl:async()=>++calls===1?new Response('',{status:429,headers:{'Retry-After':'5'}}):new Response('ok'),sleep:async ms=>{waited=ms;}});assert.equal(waited,5000);
  calls=0;await assert.rejects(requestText('https://example.test',{fetchImpl:async()=>{calls++;return new Response('',{status:403});},sleep:async()=>{}}),/403/);assert.equal(calls,1);
  calls=0;await assert.rejects(requestText('https://example.test',{fetchImpl:async()=>{calls++;throw new Error('offline')},sleep:async()=>{}}),/offline/);assert.equal(calls,3);
});
test('robots disallow blocks destination request; missing robots is allowed',async()=>{
  let calls=0;await assert.rejects(fetchText('https://robots-test.invalid/private',{fetchImpl:async()=>{calls++;return new Response('User-agent: *\nDisallow: /private');},sleep:async()=>{}}),/disallows/);assert.equal(calls,1);
  const v=await fetchText('https://missing-robots.invalid/data',{fetchImpl:async url=>String(url).endsWith('robots.txt')?new Response('',{status:404}):new Response('ok'),sleep:async()=>{}});assert.equal(v,'ok');
});
test('integrity rejects stale timestamps, duplicate team identities and wrong match data',()=>{
  const r=round();validateRound(r,now);
  assert.throws(()=>validateRound({...r,fetched_at:'2020-01-01'},now),/Stale/);
  const duplicate=structuredClone(r);duplicate.matches[1].home_team_id=duplicate.matches[0].home_team_id;assert.throws(()=>validateRound(duplicate,now),/Duplicate/);
  const pred={...roundMetadata(r),matches:r.matches.map(m=>({...m,probabilities:{'1':.4,'0':.3,'2':.3}}))};
  validateBundle(r,pred,r,r,now);const bad=structuredClone(pred);bad.matches[0].home='other';assert.throws(()=>validateBundle(r,bad,r,r,now),/mismatched/);
});
function tempRoot(){const path=mkdtempSync(join(tmpdir(),'judge90-test-'));cpSync(join(root,'data'),join(path,'data'),{recursive:true});for(const f of ['predictions.json','recommendation.json'])cpSync(join(root,f),join(path,f));return path;}
test('every failed pipeline stage preserves all published files and records the failed step',async()=>{
  for(const failed of steps){
    const path=tempRoot();const before=outputs.map(f=>readFileSync(join(path,f),'utf8'));
    await assert.rejects(update({root:path,now:()=>now,runner:(step,stage)=>{writeFileSync(join(stage,'predictions.json'),'partial');if(step===failed)throw new Error('simulated outage')}}),/outage/);
    outputs.forEach((f,i)=>assert.equal(readFileSync(join(path,f),'utf8'),before[i]));
    const status=JSON.parse(readFileSync(join(path,'data/update_status.json')));assert.equal(status.state,'error');assert.equal(status.failed_step,failed);
  }
});
test('offline end-to-end: metrics -> predictions -> recommendations -> validated publication and append-only history',async()=>{
  const path=tempRoot();const r=round();
  const old=readFileSync(join(path,'predictions.json'),'utf8');
  const preload=join(path,'clock.mjs');writeFileSync(preload,`const Original=Date;globalThis.Date=class extends Original{constructor(...a){super(...(a.length?a:['${now.toISOString()}']))}static now(){return ${now.getTime()}}};`);
  const status=await update({root:path,now:()=>now,runner:async(step,stage)=>{
    if(step==='fetch_jleague')writeFileSync(join(stage,'data/jleague_matches.json'),JSON.stringify({...source,fetched_at:now.toISOString()}));
    else if(step==='fetch_toto')writeFileSync(join(stage,'data/toto_matches.json'),JSON.stringify(r));
    else if(step==='fetch_h2h'){} // Existing public H2H snapshot; no network in CI.
    else if(step==='fetch_weather')writeFileSync(join(stage,'data/weather.json'),JSON.stringify({available:'0/13',matches:r.matches.map(m=>({...m,available:false,reason:'test_offline'}))}));
    else await exec(process.execPath,['--import',preload,join(root,`scripts/${step}.mjs`)],{cwd:stage,stdio:'pipe'});
  }});
  assert.equal(status.state,'success');assert.equal(status.round_id,'1665');
  const pred=JSON.parse(readFileSync(join(path,'predictions.json')));assert.equal(pred.matches.length,13);assert.equal(pred.dataset_id,status.dataset_id);
  const history=join(path,'data/history');assert.ok(readdirSync(history).some(f=>readFileSync(join(history,f),'utf8').trim()===old.trim()));
  assert.equal(JSON.parse(readFileSync(join(path,'data/team_metrics.json'))).teams[0].team_id.startsWith('j90-'),true);
});
const statusJS=readFileSync('assets/data-status.js','utf8');
function domBundle(){const r=round();const dataset_id='test-generation';const common={...roundMetadata(r),dataset_id,matches:r.matches};return {pred:{...common,updated_at:now.toISOString(),model:{version:'2.1'},matches:r.matches.map(m=>({...m,prediction:'1',probabilities:{'1':.4,'0':.3,'2':.3},confidence:18,uncertainty:{level:'HIGH',reasons:[]},signals:{}}))},rec:{...common},weather:{...common},status:{...common,state:'success'}};}
test('freshness assessment: legacy, expired, failure and mixed generations cannot be latest',()=>{
  const dom=new JSDOM('',{runScripts:'outside-only'});dom.window.eval(statusJS);const assess=dom.window.Judge90DataStatus.assess,b=domBundle();
  assert.equal(assess(b.pred,b.rec,b.weather,b.status,now).current,true);
  assert.equal(assess({matches:[]},null,null,null,now).current,false);
  assert.equal(assess(b.pred,b.rec,b.weather,{...b.status,state:'error'},now).current,false);
  assert.equal(assess(b.pred,{...b.rec,dataset_id:'other'},b.weather,b.status,now).current,false);
  assert.equal(assess(b.pred,b.rec,b.weather,b.status,new Date('2026-10-25')).current,false);dom.window.close();
});
test('existing Pages dashboard renders 13 legacy matches, flags history, and hides purchase panel',async(t)=>{
  const dom=new JSDOM(readFileSync('index.html','utf8'),{runScripts:'outside-only',url:'https://example.test/judge90-toto/'});
  t.after(()=>dom.window.close());dom.window.eval(statusJS);dom.window.fetch=async path=>{const p=path.split('?')[0];if(p==='data/update_status.json')return {ok:false,status:404};const b=domBundle();const samples={'predictions.json':{...b.pred,round_id:undefined,dataset_id:undefined},'recommendation.json':b.rec,'data/weather.json':b.weather};return {ok:true,json:async()=>samples[p]};};
  dom.window.eval(dom.window.document.querySelector('script:not([src])').textContent+';globalThis.testRenderStatus=renderDataStatus;');
  await new Promise(r=>setTimeout(r,50));
  assert.equal(dom.window.document.querySelectorAll('.match').length,13);assert.equal(dom.window.document.getElementById('purchasePanel').hidden,true);assert.match(dom.window.document.getElementById('dataStatus').textContent,/過去データ/);assert.match(dom.window.document.getElementById('mode').textContent,/的中確率ではありません/);dom.window.close();
});
test('current Pages dashboard renders and keeps filters; errors are text, never HTML',async(t)=>{
  const b=domBundle();const dom=new JSDOM(readFileSync('index.html','utf8'),{runScripts:'outside-only',url:'https://example.test/judge90-toto/'});t.after(()=>dom.window.close());dom.window.eval(statusJS);
  const Original=dom.window.Date;dom.window.Date=class extends Original{constructor(...a){super(...(a.length?a:[now.toISOString()]))}static now(){return now.getTime()}};
  const data={'predictions.json':b.pred,'recommendation.json':b.rec,'data/weather.json':b.weather,'data/update_status.json':b.status};dom.window.fetch=async p=>({ok:true,json:async()=>data[p.split('?')[0]]});
  dom.window.eval(dom.window.document.querySelector('script:not([src])').textContent+';globalThis.testRenderStatus=renderDataStatus;');await new Promise(r=>setTimeout(r,50));
  assert.equal(dom.window.document.getElementById('purchasePanel').hidden,false);assert.match(dom.window.document.getElementById('dataStatus').textContent,/1665/);assert.equal(dom.window.document.querySelectorAll('.match').length,13);
  dom.window.document.querySelector('[data-filter="upset"]').click();assert.equal(dom.window.document.querySelectorAll('.match').length,13);
  b.status.state='error';b.status.error='<img src=x onerror=alert(1)>';dom.window.testRenderStatus();assert.equal(dom.window.document.querySelectorAll('#dataStatus img').length,0);assert.equal(dom.window.document.getElementById('purchasePanel').hidden,true);dom.window.close();
});

test('invalid final validation preserves the published set',async()=>{
  const path=tempRoot();const before=outputs.map(f=>readFileSync(join(path,f),'utf8'));
  await assert.rejects(update({root:path,now:()=>now,runner:()=>{}}),/metadata|ENOENT/);
  outputs.forEach((f,i)=>assert.equal(readFileSync(join(path,f),'utf8'),before[i]));
  assert.equal(JSON.parse(readFileSync(join(path,'data/update_status.json'))).failed_step,'validate');
});
test('local publish I/O failure rolls back every prediction/data file',async()=>{
  const path=tempRoot(),r=round(),before=outputs.map(f=>readFileSync(join(path,f),'utf8'));
  mkdirSync(join(path,'recommendation.json.tmp'));
  const pred={...roundMetadata(r),source_digest:sourceDigest(r),updated_at:now.toISOString(),matches:r.matches.map(m=>({...m,probabilities:{'1':.4,'0':.3,'2':.3}}))};
  await assert.rejects(update({root:path,now:()=>now,runner:(step,stage)=>{
    if(step!=='build_recommendation')return;
    for(const f of outputs){const d=f==='data/toto_matches.json'?r:f==='predictions.json'||f==='recommendation.json'?pred:{matches:r.matches};writeFileSync(join(stage,f),JSON.stringify(d));}
  }}));
  outputs.forEach((f,i)=>assert.equal(readFileSync(join(path,f),'utf8'),before[i]));
  assert.equal(JSON.parse(readFileSync(join(path,'data/update_status.json'))).failed_step,'publish');
});
test('long Retry-After stops without early retry; weather policy warning remains visible',async()=>{
  let calls=0;await assert.rejects(requestText('https://example.test',{fetchImpl:async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'120'}})},sleep:async()=>{throw new Error('must not retry')}}),/429/);assert.equal(calls,1);
  const dom=new JSDOM('',{runScripts:'outside-only'});dom.window.eval(statusJS);const b=domBundle();b.status.warnings=[{source:'weather'}];
  const result=dom.window.Judge90DataStatus.assess(b.pred,b.rec,b.weather,b.status,now);assert.equal(result.current,true);assert.match(result.message,/未完了/);dom.window.close();
});
