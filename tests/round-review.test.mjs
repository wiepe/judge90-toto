import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { reviewRounds, savedReviewContext } from '../scripts/lib/round-review.mjs';
import { renderRoundReviews } from '../assets/growth.mjs';

const row={round_id:'1',number:1,date:'2026-10-31',home:'町田',away:'Ｇ大阪',league:'J1',prediction:'1',actual:'0',probabilities:{'1':.587,'0':.23,'2':.183},published_at:'2026-10-31T01:58:00Z',snapshot_id:'saved-only',model:{data_usage:{weather:false}},review_context:{score:'0-0',saved_reasons:['公開時の根拠'],data_notes:[]}};
test('round diagnostics retain names/evidence, use proper scores and do not invent baseline probabilities',()=>{
 const before=JSON.stringify(row),r=reviewRounds([row])[0];
 assert.equal(r.complete,false);assert.equal(r.home_always.hits,0);assert.equal(r.home_always.logloss,undefined);
 assert.equal(r.expected_hits,.587);assert.equal(r.expected_draws,.23);
 assert.equal(r.matches[0].actual_probability,.23);assert.equal(r.matches[0].score,'0-0');
 assert.ok(Math.abs(r.matches[0].logloss+Math.log(.23))<1e-12);
 assert.equal(r.matches[0].snapshot_id,'saved-only');assert.equal(JSON.stringify(row),before);
 assert.equal(r.by_league.J3.n,0);assert.equal(r.by_league.J3.accuracy,null);
});
test('normalization, partial/duplicate rounds, missing context and empty input stay explicit',()=>{
 const r=reviewRounds(Array.from({length:13},()=>({...row,probabilities:{'1':.333,'0':.333,'2':.333},review_context:undefined})))[0];
 assert.equal(r.complete,false);assert.equal(r.matches[0].picked_probability,1/3);
 assert.deepEqual(r.matches[0].saved_reasons,[]);assert.equal(r.matches[0].score,null);
 assert.deepEqual(reviewRounds([]),[]);
});
test('inconsistent saved H2H is missing evidence, never a zero-win historical claim',()=>{
 const m={uncertainty:{reasons:['saved',42]},signals:{h2h:{available:true,all_time:{matches:4,home_wins:0,draws:0,away_wins:0}}}};
 const c=savedReviewContext(m,{score:'1-1'});assert.equal(c.data_notes.length,1);assert.deepEqual(c.saved_reasons,['saved']);
 m.signals.h2h.all_time={matches:4,home_wins:2,draws:1,away_wins:1};assert.equal(savedReviewContext(m,{}).data_notes.length,0);
 assert.match(savedReviewContext({signals:{h2h:{available:false}}},{}).data_notes[0],/不足/);
});
test('mobile review includes both teams, draw miss, saved reasons and missing evidence; escapes external text',()=>{
 const dom=new JSDOM('<main></main>'),doc=dom.window.document,root=doc.querySelector('main');
 const r=reviewRounds([{...row,home:'<img src=x onerror=alert(1)>',review_context:{...row.review_context,saved_reasons:[]}}]);
 renderRoundReviews(doc,root,{round_reviews:r},new Date('2026-11-02'));
 assert.match(root.textContent,/Ｇ大阪：0-0 ／ 不的中/);assert.match(root.textContent,/本命 1（58.7%） → 結果 0/);
 assert.match(root.textContent,/保存なし。後から補いません/);assert.match(root.textContent,/天気は予測に未使用/);
 assert.equal(root.querySelectorAll('img').length,0);assert.equal(root.querySelector('details').open,true);
 root.replaceChildren();renderRoundReviews(doc,root,{round_reviews:r},new Date('2026-10-29'));assert.match(root.textContent,/評価データ不足/);
 dom.window.close();
});
