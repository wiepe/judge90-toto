import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
function poll(states){
  const dir=mkdtempSync(join(tmpdir(),'j90-pages-'));
  try{
    writeFileSync(join(dir,'states'),states.join('\n')+'\n');
    writeFileSync(join(dir,'gh'),'#!/usr/bin/env bash\nset -eu\nhead -n 1 "$STATES"\nsed -i "1d" "$STATES"\n',{mode:0o755});
    return spawnSync('bash',['scripts/wait_pages.sh','target'],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,STATES:join(dir,'states'),GITHUB_REPOSITORY:'test/repo',PAGES_WAIT_ATTEMPTS:String(states.length),PAGES_WAIT_DELAY_SECONDS:'0'}});
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('Pages queue longer than old thirty polls can finish for the correct commit',()=>{
  const r=poll([...Array(31).fill('queued\ttarget'),'built\ttarget']);assert.equal(r.status,0,r.stderr);
});
test('a different published commit cannot produce a delivery success',()=>{
  const r=poll(['built\told','queued\ttarget']);assert.equal(r.status,1);assert.match(r.stderr,/unverified/);
});
test('matching build error stops immediately',()=>{
  const r=poll(['errored\ttarget','built\ttarget']);assert.equal(r.status,1);assert.match(r.stderr,/failed/);assert.doesNotMatch(r.stdout,/2\/2/);
});
test('delivery failure survives tee in the actual workflow shell',()=>{
  const workflow=readFileSync('.github/workflows/predict.yml','utf8');
  const step=workflow.split('      - name: Verify delivery time against sales close')[1].split('      - name: Preserve')[0];
  assert.match(step,/set -o pipefail\s+node scripts\/check_delivery\.mjs \| tee/);
  const r=spawnSync('bash',['-e','-c','set -o pipefail; node -e "process.exitCode=1" | tee /dev/null']);assert.equal(r.status,1);
});
