(function(root){
  function assess(pred,rec,weather,status,now){
    now=now||new Date();
    if(status?.state==='error')return {current:false,message:'更新に失敗しました。表示中の予測は過去データです。取得エラー：'+(status.failed_step||'不明')+' ／ '+(status.error||'詳細不明')};
    if(!pred?.round_id||!pred?.dataset_id||!status)return {current:false,message:'開催回・更新状態を確認できない過去データです。最新の購入候補として利用しないでください。'};
    const age=now-new Date(pred.updated_at);
    if(!Number.isFinite(age)||age< -60000||age>6*3600000)return {current:false,message:'予測の更新から6時間以上経過、または更新日時が不正です。最新性を確認できません。'};
    if(!(now>=new Date(pred.sales_open_at)&&now<new Date(pred.sales_close_at)))return {current:false,message:'この開催回は販売期間外です。過去の予測として表示しています。'};
    const weatherRequired=pred.model?.data_usage?.weather===true || (pred.model?.data_usage?.weather!==false && pred.model?.version!=='2.1');
    const data=weatherRequired?[pred,rec,weather,status]:[pred,rec,status];
    if(data.some(x=>!x||x.dataset_id!==pred.dataset_id||x.round_id!==pred.round_id||x.product_id!=='01')||(weatherRequired?[pred,rec,weather]:[pred,rec]).some(x=>x.matches?.length!==13))return {current:false,message:'更新データの開催回が一致しません。更新完了後に再読み込みしてください。'};
    if(weatherRequired&&weather?.matches?.some(w=>w.available!==true))return {current:false,message:'予測に使用する天気データが不足しています。購入候補の表示を停止しています。'};
    if(status.state!=='success')return {current:false,message:'更新状態を確認できません。'};
    for(const d of (weatherRequired?[rec,weather]:[rec]))for(const m of pred.matches){const other=d.matches.find(x=>x.number===m.number);if(!other||other.home!==m.home||other.away!==m.away)return {current:false,message:'対象試合が一致しません。購入候補の表示を停止しています。'};}
    const weatherUsable=!!weather&&weather.dataset_id===pred.dataset_id&&weather.round_id===pred.round_id&&weather.matches?.length===13&&pred.matches.every(m=>weather.matches.some(w=>w.number===m.number&&w.home===m.home&&w.away===m.away));
    const count=weatherUsable?weather.matches.filter(w=>w.available).length:0;
    const optional=!weatherRequired?(count<13?' 天気 '+count+'/13件：参考のみ・予測には未使用。'+(weatherUsable&&weather.matches.some(w=>String(w.reason||'').includes('robots.txt'))?'アクセス条件により取得停止。':'天気情報を確認できません。'):' ／ 天気は参考表示のみ・予測には未使用'):'';
    return {current:true,weatherUsable,message:'第'+pred.round_id+'回：予測・買い目13試合を確認。締切 '+new Date(pred.sales_close_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+'（日本時間）。'+optional};
  }
  root.Judge90DataStatus={assess};
})(globalThis);
