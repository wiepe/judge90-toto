import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {dashboardFiles} from '../../tests/helpers/dashboard-fixture.mjs';
const fixtures=dashboardFiles();
const root=process.cwd(),prediction=fixtures['predictions.json'],out=resolve('work/mobile-verification');mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=createServer((req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path==='/')path='/index.html';if(path.includes('..')||path.includes('/.')||!types[extname(path)])throw new Error('Forbidden');const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw new Error('Forbidden');res.setHeader('Content-Type',types[extname(path)]);res.end(Object.hasOwn(fixtures,path.slice(1))?JSON.stringify(fixtures[path.slice(1)]):readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
const errors=[],writes=[];
async function pageFor(width){const page=await browser.newPage({viewport:{width,height:851},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});await page.clock.install({time:new Date(prediction.updated_at)});return page;}
try{
 for(const width of[360,393,412,768]){
  const page=await pageFor(width);await page.goto(base);await page.locator('.match-card').first().waitFor();assert.equal(await page.locator('#quickPicks strong').count(),13);
  assert.equal(await page.locator('#quickPicks .pick-probability').count(),13);await page.locator('#quickPicks button').first().click();assert.equal(await page.locator('.match-card details').first().getAttribute('open'),'');await page.clock.fastForward(61000);assert.equal(await page.locator('.match-card details').first().getAttribute('open'),'');await page.evaluate(()=>scrollTo(0,0));
  const strip=await page.locator('#quickPicks').boundingBox();assert.ok(strip.y+strip.height<760,'All thirteen picks must fit in the initial viewport');
  for(const tab of['forecast','purchase','performance']){await page.locator(`.bottom-nav a[href="#${tab}"]`).click();await page.locator('#'+tab).waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}px ${tab} overflows`);}
  await page.locator('.bottom-nav a[href="#purchase"]').click();await page.locator('#purchase').waitFor({state:'visible'});
  for(const budget of[100,500,1000,3000]){await page.locator(`[data-amount="${budget}"]`).click();assert.equal(await page.locator('.purchase-plan').count(),2);assert.equal(await page.locator(`[data-amount="${budget}"]`).getAttribute('aria-pressed'),'true');}
  await page.locator('.bottom-nav a[href="#forecast"]').click();await page.screenshot({path:resolve(out,`forecast-${width}.png`),fullPage:true});await page.close();
 }
 // Simulate acquisition failure, stale data, closed sales and generation races.
 for(const mode of['error','stale','closed','mixed','invalid']){
  const page=await pageFor(393);await page.route('**/*.json?*',async route=>{const path=new URL(route.request().url()).pathname.slice(1);const d=Object.hasOwn(fixtures,path)?structuredClone(fixtures[path]):JSON.parse(readFileSync(resolve(root,path)));
   if(mode==='error'&&path==='data/update_status.json'){d.state='error';d.error='simulated outage';}
   if(mode==='stale'&&path==='predictions.json')d.updated_at=new Date(Date.parse(prediction.updated_at)-7*3600000).toISOString();
   if(mode==='closed'&&path==='predictions.json')d.sales_close_at=prediction.updated_at;
   if(mode==='mixed'&&path==='recommendation.json')d.dataset_id='different';
   if(mode==='invalid'&&path==='predictions.json')d.matches[0].probabilities['1']=9;
   await route.fulfill({json:d});});await page.goto(base+'/#purchase');await page.waitForFunction(()=>document.getElementById('purchaseState').textContent!=='読込中 · 購入候補は停止中');assert.equal(await page.locator('.purchase-plan').count(),0,mode+' must stop buying');await page.close();
 }
 const diagnostic=await pageFor(393);await diagnostic.goto(base+'/research/diagnostics.html');await diagnostic.locator('#diagnostics table').first().waitFor();assert.equal(await diagnostic.locator('#diagnostics>details').count(),8);assert.equal(await diagnostic.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await diagnostic.close();
 const page=await pageFor(393);await page.goto(base+'/#performance');assert.equal(await page.evaluate(()=>localStorage.length),0,'Opening the site must not create purchase records');
 await page.locator('input[name=passphrase]').fill('synthetic-test-passphrase');await page.getByRole('button',{name:'開く / 初回作成'}).click();await page.locator('input[name=round]').fill('1668');await page.locator('textarea[name=tickets]').fill('1111111111111');await page.locator('input[name=amount]').fill('100');await page.locator('input[name=confirmed]').check();await page.getByRole('button',{name:'実購入として保存'}).click();await page.getByText('実際の購入として暗号化保存しました。',{exact:true}).waitFor();
 const raw=await page.evaluate(()=>localStorage.getItem('judge90.private-ledger.v1'));assert.doesNotMatch(raw,/round_id|1111111111111/);
 await page.locator('.bottom-nav a[href="#forecast"]').click();await page.locator('.bottom-nav a[href="#performance"]').click();await page.locator('#performance').waitFor({state:'visible'});await page.locator('input[name=passphrase]').waitFor();await page.locator('input[name=passphrase]').fill('synthetic-test-passphrase');await page.getByRole('button',{name:'開く / 初回作成'}).click();await page.getByText('購入総額 100円',{exact:false}).waitFor();await page.clock.fastForward(301000);await page.locator('input[name=passphrase]').waitFor();
 // Minute revalidation must remove purchase candidates when freshness expires.
 await page.locator('.bottom-nav a[href="#purchase"]').click();await page.clock.fastForward(7*3600000);assert.equal(await page.locator('.purchase-plan').count(),0);await page.close();
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({widths:[360,393,412,768],screens:3,budgets:4,failure_states:5,private_encryption:true,auto_lock:true,external_writes:writes.length,errors:errors.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
