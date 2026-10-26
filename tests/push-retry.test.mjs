import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const script=resolve('scripts/push_main.sh');
function simulate(errors) {
 const dir=mkdtempSync(join(tmpdir(),'j90-push-'));
 try {
  writeFileSync(join(dir,'errors'),errors.join('\n')+'\n');
  writeFileSync(join(dir,'git'),`#!/usr/bin/env bash
set -eu
[ "$*" = 'push origin HEAD:main' ] || exit 99
echo call >> "$SIM/calls"
line=$(head -n 1 "$SIM/errors")
sed -i '1d' "$SIM/errors"
[ "$line" = success ] && exit 0
echo "$line" >&2
exit 1
`,{mode:0o755});
  writeFileSync(join(dir,'sleep'),'#!/usr/bin/env bash\necho "$1" >> "$SIM/waits"\n',{mode:0o755});
  const r=spawnSync('bash',[script],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,SIM:dir}});
  return {...r,calls:readFileSync(join(dir,'calls'),'utf8').trim().split('\n').length};
 } finally {rmSync(dir,{recursive:true,force:true});}
}
test('observed commit_refs failure and HTTP 503 retry the same safe push',()=>{
 const r=simulate(['remote: fatal error in commit_refs','fatal: HTTP 503','success']);assert.equal(r.status,0,r.stderr);assert.equal(r.calls,3);
});
test('transient errors exhaust after three attempts and stop publication',()=>{
 const r=simulate(Array(4).fill('remote: fatal error in commit_refs'));assert.equal(r.status,1);assert.equal(r.calls,3);
});
test('concurrency, permissions, policy and unknown errors stop immediately without logging URLs',()=>{
 for(const message of ['[rejected] non-fast-forward','remote: Permission denied','remote: GH013 repository rule','unclassified https://token@example.invalid']) {
  const r=simulate([message,'success']);assert.equal(r.status,1);assert.equal(r.calls,1);assert.doesNotMatch(r.stderr,/token@example/);
 }
});
test('prediction and receipt publication use retries and only mark committed data published after success',()=>{
 const w=readFileSync('.github/workflows/predict.yml','utf8');assert.equal(w.match(/bash scripts\/push_main\.sh/g).length,2);
 assert.match(w,/bash scripts\/push_main\.sh\s+echo "published=true"/);
 assert.match(w,/path: \|\s+predictions.json\s+recommendation.json/);
});
test('real Git retries are idempotent and divergent remote history is never overwritten',()=>{
 const dir=mkdtempSync(join(tmpdir(),'j90-push-real-'));
 try {
  const repo=join(dir,'repo'),other=join(dir,'other'),remote=join(dir,'origin.git');mkdirSync(repo);
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,stdio:'pipe'}).toString().trim();
  git(dir,'init','--bare',remote);git(repo,'init','-b','main');git(repo,'config','user.name','Test');git(repo,'config','user.email','test@example.invalid');
  writeFileSync(join(repo,'data'),'base');git(repo,'add','.');git(repo,'commit','-m','base');git(repo,'remote','add','origin',remote);
  for(let i=0;i<2;i++)assert.equal(spawnSync('bash',[script],{cwd:repo}).status,0);
  git(dir,'clone','--branch','main',remote,other);git(other,'config','user.name','Test');git(other,'config','user.email','test@example.invalid');
  writeFileSync(join(other,'concurrent'),'keep');git(other,'add','.');git(other,'commit','-m','concurrent');git(other,'push','origin','main');
  const expected=git(other,'rev-parse','HEAD');writeFileSync(join(repo,'data'),'local');git(repo,'add','.');git(repo,'commit','-m','local');
  const r=spawnSync('bash',[script],{cwd:repo,encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/no retry/);
  assert.equal(git(dir,'--git-dir='+remote,'rev-parse','refs/heads/main'),expected);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
