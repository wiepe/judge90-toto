(function(root){
  function weatherState(w,used=false){
    const suffix=used===true?"（予測に使用）":used===false?"（予測に未使用）":"（使用状況未確認）";
    if(w?.available===true)return {state:'available',label:'取得済み'+suffix,used};
    const reason=String(w?.reason||'');
    if(reason.includes('robots.txt'))return {state:'policy_blocked',label:'提供元のアクセス条件により取得停止'+suffix,used};
    if(reason==='coordinates_not_found')return {state:'coordinates_missing',label:'座標未登録'+suffix,used};
    return {state:'unavailable',label:'未取得'+suffix,used};
  }
  function auditMatch(m,w,fixture,weatherUsed=false){
    const h2h=!!m.signals?.h2h?.available;
    return {number:m.number,home:m.home,away:m.away,
      prediction:{state:m.probabilities?'available':'missing',used:true},
      venue:{state:(fixture?.stadium||m.stadium||w?.stadium)?'available':'missing',stadium:fixture?.stadium||m.stadium||w?.stadium||null,kickoff:fixture?.kickoff||m.kickoff||w?.kickoff||null,used:false},
      h2h:{state:h2h?'available':'no_usable_history',used:h2h,label:h2h?'対戦履歴を補正に使用':'利用可能な対戦履歴なし・補正0（未対戦とは断定しません）'},
      weather:weatherState(w,weatherUsed)};
  }
  function summarize(pred,weather,fixtures){
    const weatherUsed=typeof pred?.model?.data_usage?.weather==='boolean'?pred.model.data_usage.weather:pred?.model?.version==='2.1'?false:null;
    const rows=(pred?.matches||[]).map(m=>auditMatch(m,weather?.matches?.find(w=>w.number===m.number&&w.home===m.home&&w.away===m.away),fixtures?.matches?.find(f=>f.number===m.number&&f.home===m.home&&f.away===m.away),weatherUsed));
    return {prediction:rows.filter(r=>r.prediction.state==='available').length,venue:rows.filter(r=>r.venue.state==='available').length,h2h_used:rows.filter(r=>r.h2h.used).length,weather:rows.filter(r=>r.weather.state==='available').length,weather_policy_blocked:rows.filter(r=>r.weather.state==='policy_blocked').length,weather_used:weatherUsed,rows};
  }
  root.Judge90DataSources={weatherState,auditMatch,summarize};
})(globalThis);
