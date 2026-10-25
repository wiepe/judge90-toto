const labels=['1','0','2'];
export function riskEstimate(match){
 const p=match?.probabilities,sum=labels.reduce((s,k)=>s+p?.[k],0);
 if(!labels.includes(match?.prediction)||!labels.every(k=>Number.isFinite(p?.[k])&&p[k]>=0&&p[k]<=1)||Math.abs(sum-1)>.002)return null;
 const picked=p[match.prediction]/sum,miss=1-picked;
 // Presentation bands only, chosen before outcome inspection; never model inputs.
 return{picked,miss,level:miss>=.6-1e-12?'high':miss>=.45-1e-12?'medium':'lower',label:miss>=.6-1e-12?'▲ 注意':miss>=.45-1e-12?'△ 留意':'○ 相対低',definition:'波乱目安＝本命以外になるモデル確率。60%以上は注意、45%以上は留意、それ未満は相対低。実証済み発生率ではありません。'};
}
export function deadlineText(close,now=new Date()){
 const diff=Date.parse(close)-now;if(!Number.isFinite(diff))return '締切未取得';if(diff<=0)return '販売終了';
 const mins=Math.floor(diff/60000);if(!mins)return '締切まで1分未満';
 return 'あと '+(mins>=1440?Math.floor(mins/1440)+'日 ':'')+Math.floor(mins%1440/60)+'時間 '+mins%60+'分';
}
function el(doc,tag,text){const e=doc.createElement(tag);e.textContent=text;return e;}
export function appendMatchDetails(doc,details,match,predictions,metrics){
 const risk=riskEstimate(match);details.append(el(doc,'p','モデル '+(predictions?.model?.name||'不明')+' v'+(predictions?.model?.version||'未登録')+' ／ 予測更新 '+(predictions?.updated_at||'未取得')));
 if(risk)details.append(el(doc,'p',risk.label+'：本命以外 '+(risk.miss*100).toFixed(1)+'%。'+risk.definition));
 const same=metrics?.dataset_id&&metrics.dataset_id===predictions?.dataset_id;
 for(const side of ['home','away']){
  const candidates=same?(metrics.teams||[]).filter(t=>t.team_id===match[side+'_team_id']&&t.league===match.league):[];
  const team=candidates.length===1?candidates[0]:null;
  if(!team){details.append(el(doc,'p',match[side]+'：同じ更新回のチーム成績を取得できません。'));continue;}
  details.append(el(doc,'h4',match[side]));
  details.append(el(doc,'p','今季 '+team.played+'試合：'+team.wins+'勝 '+team.draws+'分 '+team.losses+'敗 ／ 得点 '+team.goals_for+'・失点 '+team.goals_against));
  for(const venue of ['home','away']){const v=team[venue];details.append(el(doc,'p',(venue==='home'?'ホーム':'アウェイ')+'：'+(v?v.played+'試合 '+v.wins+'勝 '+v.draws+'分 '+v.losses+'敗':'未取得')));}
  const form=team.recent_form||[];details.append(el(doc,'p','直近'+form.length+'試合（古→新）：'+(form.length?form.map(r=>r.date+' '+r.opponent+' '+({W:'勝',D:'分',L:'敗'}[r.result]||'不明')+' '+r.goals_for+'−'+r.goals_against).join(' ／ '):'未取得')));
 }
 const h=match.signals?.h2h,r=h?.recent5;
 details.append(el(doc,'p',h?.available&&r?'対戦履歴 '+r.matches+'試合：'+match.home+' '+r.home_wins+'勝、引分 '+r.draws+'、'+match.away+' '+r.away_wins+'勝。ホーム/アウェイは今回のチームに対応。':'利用可能な対戦履歴なし。未対戦とは断定しません。'));
}
