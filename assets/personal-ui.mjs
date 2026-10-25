import{openPrivateLedger,ledgerSummary}from'./private-ledger.mjs';
const yen=n=>n.toLocaleString('ja-JP')+'円';
function el(d,t,text,cls){const e=d.createElement(t);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function input(doc,form,label,type,name){const l=el(doc,'label',label),i=el(doc,'input');i.type=type;i.name=name;l.append(i);form.append(l);return i;}
export function mountPersonal(doc,root,storage=globalThis.localStorage){
 let session=null;let timer;
 const note=el(doc,'p','この端末・このブラウザー内だけに暗号化保存します。GitHubへ送信しません。12文字以上の専用パスフレーズを使い、暗号化バックアップを保管してください。忘れると復元できません。共有端末では利用後にロックしてください。','muted');
 const status=el(doc,'p','','status-note');status.setAttribute('role','status');
 const shell=el(doc,'section',undefined,'panel');shell.append(el(doc,'h3','自分の購入成績'),note,status);root.replaceChildren(shell);
 const body=el(doc,'div');shell.append(body);
 const failure=e=>{status.textContent='保存・読込を完了できませんでした。既存記録は保持します。 '+e.message;};
 const reset=()=>{clearTimeout(timer);timer=setTimeout(lock,5*60000);};
 function lock(){clearTimeout(timer);session?.lock();session=null;draw();status.textContent='ロックしました。';}
 function draw(){
  body.replaceChildren();if(!session){const f=el(doc,'form',undefined,'form-grid'),pass=input(doc,f,'専用パスフレーズ（12文字以上）','password','passphrase');pass.minLength=12;pass.maxLength=1024;pass.autocomplete='off';pass.required=true;const b=el(doc,'button','開く / 初回作成');b.type='submit';f.append(b);f.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{session=await openPrivateLedger(storage,pass.value);pass.value='';reset();draw();status.textContent='解除しました。5分間操作がなければ自動ロックします。';}catch(err){pass.value='';failure(err);b.disabled=false;}};body.append(f);return;}
  const rows=session.read().records,s=ledgerSummary(rows),total=s.total;
  body.append(el(doc,'p','購入総額 '+yen(total.spent_yen)+' ／ 確認済み当選金 '+yen(total.known_payout_yen)),el(doc,'p','確定分の収支 '+yen(total.settled_profit_yen)+' ／ 確定分の回収率 '+(total.settled_roi===null?'未確定':(total.settled_roi*100).toFixed(1)+'%')+' ／ 配当未入力 '+total.pending+'件'));
  const lockButton=el(doc,'button','ロック');lockButton.onclick=lock;body.append(lockButton);
  const backup=el(doc,'button','暗号化バックアップを保存');backup.type='button';backup.onclick=()=>{reset();const blob=new Blob([session.export()],{type:'application/json'}),url=URL.createObjectURL(blob),a=el(doc,'a');a.href=url;a.download='judge90-private-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};body.append(backup);
  const restore=el(doc,'form',undefined,'form-grid'),file=input(doc,restore,'暗号化バックアップを読み込む','file','backup');file.accept='.json,application/json';const bp=input(doc,restore,'バックアップのパスフレーズ','password','backupPass');bp.autocomplete='off';const ib=el(doc,'button','既存の記録を保持して取り込む');ib.type='submit';restore.append(ib);restore.onsubmit=async e=>{e.preventDefault();ib.disabled=true;try{if(!file.files?.[0]||file.files[0].size>3000000)throw new Error('ファイルなし、または3MB上限超過');await session.import(await file.files[0].text(),bp.value);bp.value='';reset();draw();status.textContent='取り込みを保存しました。';}catch(err){bp.value='';failure(err);ib.disabled=false;}};const rd=el(doc,'details');rd.append(el(doc,'summary','バックアップを復元'),restore);body.append(rd);
  const f=el(doc,'form',undefined,'form-grid');f.append(el(doc,'h3','実際に購入した買い目を記録'));
  const round=input(doc,f,'開催回','text','round');round.inputMode='numeric';round.pattern='[0-9]{1,6}';round.required=true;
  const date=input(doc,f,'購入日','date','date');date.value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'});date.max=date.value;date.required=true;
  const label=el(doc,'label','買い目（No.1→13の13桁、1口ごとに改行）'),tickets=el(doc,'textarea');tickets.name='tickets';tickets.rows=4;tickets.required=true;label.append(tickets);f.append(label);
  const amount=input(doc,f,'実際の購入金額（1口100円）','number','amount');amount.min='100';amount.max='1000000';amount.step='100';amount.required=true;
  const confirmed=input(doc,f,'この買い目を実際に購入しました','checkbox','confirmed');confirmed.required=true;const save=el(doc,'button','実購入として保存');save.type='submit';f.append(save);
  f.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const lines=tickets.value.trim().split(/\n/).map(s=>s.replace(/\s/g,''));await session.add({round_id:round.value.trim(),purchase_date:date.value,tickets:lines,amount_yen:Number(amount.value),confirmed_purchase:confirmed.checked});reset();draw();status.textContent='実際の購入として暗号化保存しました。';}catch(err){failure(err);save.disabled=false;}};body.append(f);
  for(const r of [...rows].reverse()){const card=el(doc,'details');card.append(el(doc,'summary','第'+r.round_id+'回 · '+r.purchase_date+' · '+yen(r.amount_yen)),el(doc,'p',r.tickets.join('\n'),'private-tickets'));const pf=el(doc,'form',undefined,'form-grid'),payout=input(doc,pf,'実際の当選金額（0円も明示入力。空欄は未確定）','number','payout');payout.min='0';payout.max='1000000000';payout.step='1';payout.value=r.payout_yen===null?'':String(r.payout_yen);const pb=el(doc,'button','当選金を記録');pb.type='submit';pf.append(pb);pf.onsubmit=async e=>{e.preventDefault();pb.disabled=true;try{await session.payout(r.id,payout.value===''?null:Number(payout.value));reset();draw();status.textContent='当選金の入力を保存しました。';}catch(err){failure(err);pb.disabled=false;}};card.append(pf);body.append(card);}
  for(const [title,groups]of[['月別',s.by_month],['年間',s.by_year]]){const details=el(doc,'details');details.append(el(doc,'summary',title+'の購入成績'));for(const[k,v]of Object.entries(groups))details.append(el(doc,'p',k+'：購入 '+yen(v.spent_yen)+' ／ 確定収支 '+yen(v.settled_profit_yen)+' ／ 確定回収率 '+(v.settled_roi===null?'未確定':(v.settled_roi*100).toFixed(1)+'%')+' ／ 未確定 '+v.pending+'件'));body.append(details);}
  body.append(el(doc,'p','端末の保存領域を消すと失われます。暗号化バックアップで別端末へ手動移行できます。同じサイト内のコードは解除中の記録にアクセスできるため、端末とパスフレーズを保護してください。','muted'));
 }
 body.addEventListener('input',()=>{if(session)reset();});body.addEventListener('click',()=>{if(session)reset();});doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&session)lock();});doc.defaultView?.addEventListener('hashchange',()=>{if(doc.defaultView.location.hash!=='#performance'&&session)lock();});draw();return{lock};
}
