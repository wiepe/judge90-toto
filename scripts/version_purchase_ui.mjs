// Keep the purchase module, its entry point and CSS on distinct cache URLs.
// Run after editing these assets; --check is a read-only CI guard.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,16);
const read=p=>readFileSync(p,'utf8');
const entryPath='assets/dashboard.mjs',htmlPath='index.html';
const performancePath='assets/performance.mjs';
const performance=read(performancePath).replace(/from'\.\/growth\.mjs(?:\?v=[a-f0-9]+)?'/,"from'./growth.mjs?v="+hash(read('assets/growth.mjs'))+"'");
const entry=read(entryPath)
 .replace(/from '\.\/purchase\.mjs(?:\?v=[a-f0-9]+)?'/,"from './purchase.mjs?v="+hash(read('assets/purchase.mjs'))+"'")
 .replace(/from'\.\/performance\.mjs(?:\?v=[a-f0-9]+)?'/,"from'./performance.mjs?v="+hash(performance)+"'");
const html=read(htmlPath)
 .replace(/href="assets\/dashboard\.css(?:\?v=[a-f0-9]+)?"/,'href="assets/dashboard.css?v='+hash(read('assets/dashboard.css'))+'"')
 .replace(/src="assets\/dashboard\.mjs(?:\?v=[a-f0-9]+)?"/,'src="assets/dashboard.mjs?v='+hash(entry)+'"');
const changes=[[performancePath,performance],[entryPath,entry],[htmlPath,html]].filter(([p,text])=>read(p)!==text);
if(process.argv.includes('--check')){
 if(changes.length)throw new Error('Purchase UI cache URLs are stale. Run node scripts/version_purchase_ui.mjs');
 console.log('Purchase UI cache URLs match the release assets.');
}else for(const[p,text]of changes)writeFileSync(p,text);
