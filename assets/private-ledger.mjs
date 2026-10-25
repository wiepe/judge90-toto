// Browser-only encrypted storage. No network calls, telemetry or public files.
const STORAGE_KEY='judge90.private-ledger.v1';
const ITERATIONS=310000,MAX_RECORDS=2000;
const utf8=new TextEncoder(),decode=new TextDecoder();
const b64=b=>{let s='';for(const v of new Uint8Array(b))s+=String.fromCharCode(v);return btoa(s);};
const bytes=s=>{if(typeof s!=='string'||s.length>4000000)throw new Error('Invalid encrypted file');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));};
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function validateLedger(data){
 if(data?.version!==1||!Array.isArray(data.records)||data.records.length>MAX_RECORDS)throw new Error('Invalid ledger');
 const ids=new Set();for(const r of data.records){
  if(typeof r.id!=='string'||!/^[a-f0-9-]{36}$/.test(r.id)||ids.has(r.id))throw new Error('Duplicate or invalid record ID');ids.add(r.id);
  if(!/^\d{1,6}$/.test(r.round_id)||!isDate(r.purchase_date)||!Array.isArray(r.tickets)||r.tickets.length<1||r.tickets.length>10000||r.tickets.some(t=>typeof t!=='string'||!/^[102]{13}$/.test(t)))throw new Error('Invalid purchase');
  if(!Number.isSafeInteger(r.amount_yen)||r.amount_yen!==r.tickets.length*100||r.amount_yen>1000000)throw new Error('Amount must equal actual 100-yen ticket count');
  if(r.payout_yen!==null&&(!Number.isSafeInteger(r.payout_yen)||r.payout_yen<0||r.payout_yen>1000000000))throw new Error('Invalid actual payout');
  if(r.confirmed_purchase!==true||!Array.isArray(r.payout_revisions)||r.payout_revisions.length>1000)throw new Error('Only explicitly recorded purchases allowed');
  if(Object.keys(r).some(k=>!['id','round_id','purchase_date','tickets','amount_yen','payout_yen','payout_revisions','confirmed_purchase'].includes(k)))throw new Error('Unknown private field');
 }
 return data;
}
export function ledgerSummary(records){
 const summarize=rows=>{const settled=rows.filter(r=>r.payout_yen!==null),spent=rows.reduce((s,r)=>s+r.amount_yen,0),settledCost=settled.reduce((s,r)=>s+r.amount_yen,0),returns=settled.reduce((s,r)=>s+r.payout_yen,0);return{purchases:rows.length,spent_yen:spent,settled_cost_yen:settledCost,known_payout_yen:returns,pending:rows.length-settled.length,settled_profit_yen:returns-settledCost,settled_roi:settledCost?returns/settledCost:null};};
 const group=length=>Object.fromEntries([...new Set(records.map(r=>r.purchase_date.slice(0,length)))].sort().map(k=>[k,summarize(records.filter(r=>r.purchase_date.startsWith(k)))]));
 return{total:summarize(records),by_month:group(7),by_year:group(4)};
}
function envelope(raw){const e=typeof raw==='string'?JSON.parse(raw):raw;if(e?.version!==1||e.algorithm!=='AES-GCM'||e.kdf!=='PBKDF2-SHA256'||e.iterations!==ITERATIONS)throw new Error('Unsupported encrypted file');const salt=bytes(e.salt),iv=bytes(e.iv),cipher=bytes(e.ciphertext);if(salt.length!==16||iv.length!==12||cipher.length<16)throw new Error('Invalid encrypted file');return{e,salt,iv,cipher};}
async function derive(pass,salt,crypto){if(typeof pass!=='string'||pass.length<12||pass.length>1024)throw new Error('Passphrase needs at least 12 characters');const base=await crypto.subtle.importKey('raw',utf8.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function seal(data,key,salt,crypto){validateLedger(data);const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode('JUDGE90 private ledger v1')},key,utf8.encode(JSON.stringify(data)));return JSON.stringify({version:1,algorithm:'AES-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),ciphertext:b64(cipher)});}
async function unlock(raw,pass,crypto){const {salt,iv,cipher}=envelope(raw),key=await derive(pass,salt,crypto);try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:utf8.encode('JUDGE90 private ledger v1')},key,cipher);return{data:validateLedger(JSON.parse(decode.decode(plain))),key,salt};}catch{throw new Error('Cannot unlock: wrong passphrase or damaged backup');}}
export async function openPrivateLedger(storage,pass,{crypto=globalThis.crypto}={}){
 if(!crypto?.subtle)throw new Error('Web Crypto requires HTTPS or localhost');
 const underLock=fn=>{if(typeof window!=='undefined'){if(!globalThis.navigator?.locks)throw new Error('Web Locks is required for safe private saving');return globalThis.navigator.locks.request(STORAGE_KEY,fn);}return fn();};
 let stored=storage.getItem(STORAGE_KEY);let data,key,salt;
 if(stored){({data,key,salt}=await unlock(stored,pass,crypto));}else{data={version:1,records:[]};salt=crypto.getRandomValues(new Uint8Array(16));key=await derive(pass,salt,crypto);const initial=await seal(data,key,salt,crypto);await underLock(()=>{if(storage.getItem(STORAGE_KEY)!==null)throw new Error('Ledger created in another tab; reopen it');storage.setItem(STORAGE_KEY,initial);stored=initial;});}
 let active=true,busy=false;const check=()=>{if(!active)throw new Error('Ledger locked');};
 async function persist(next){check();if(busy)throw new Error('Another save is in progress');busy=true;try{const encrypted=await seal(next,key,salt,crypto);await underLock(()=>{check();if(storage.getItem(STORAGE_KEY)!==stored)throw new Error('History changed in another tab; lock and reopen before saving');storage.setItem(STORAGE_KEY,encrypted);stored=encrypted;data=next;});}finally{busy=false;}}
 return{
  read(){check();return structuredClone(data);},
  export(){check();return storage.getItem(STORAGE_KEY);},
  async add({round_id,purchase_date,tickets,amount_yen,confirmed_purchase}){check();if(confirmed_purchase!==true)throw new Error('Explicit actual purchase confirmation required');const r={id:crypto.randomUUID(),round_id,purchase_date,tickets,amount_yen,payout_yen:null,payout_revisions:[],confirmed_purchase:true};await persist({version:1,records:[...data.records,r]});return r.id;},
  async payout(id,payout_yen){check();const next=structuredClone(data),r=next.records.find(r=>r.id===id);if(!r)throw new Error('Record missing');r.payout_revisions.push({at:new Date().toISOString(),previous:r.payout_yen,value:payout_yen});r.payout_yen=payout_yen;await persist(next);},
  async import(raw,backupPass){check();const other=await unlock(raw,backupPass,crypto),next=structuredClone(data);for(const r of other.data.records){const old=next.records.find(x=>x.id===r.id);if(old&&JSON.stringify(old)!==JSON.stringify(r))throw new Error('Conflicting history; existing records retained');if(!old)next.records.push(r);}await persist(next);},
  lock(){active=false;data=null;key=null;}
 };
}
