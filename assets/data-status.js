(function(root){
  function assess(pred,rec,weather,status,now){
    now=now||new Date();
    if(status?.state==='error')return {current:false,message:'更新に失敗しました。表示中の予測は過去データです。取得エラー：'+(status.failed_step||'不明')+' ／ '+(status.error||'詳細不明')};
    if(!pred?.round_id||!pred?.dataset_id||!status)return {current:false,message:'開催回・更新状態を確認できない過去データです。最新の購入候補として利用しないでください。'};
    const age=now-new Date(pred.updated_at);
    if(!Number.isFinite(age)||age< -60000||age>6*3600000)return {current:false,message:'予測の更新から6時間以上経過、または更新日時が不正です。最新性を確認できません。'};
    if(!(now>=new Date(pred.sales_open_at)&&now<new Date(pred.sales_close_at)))return {current:false,message:'この開催回は販売期間外です。過去の予測として表示しています。'};
    const data=[pred,rec,weather,status];
    if(data.some(x=>!x||x.dataset_id!==pred.dataset_id||x.round_id!==pred.round_id||x.product_id!=='01')||[pred,rec,weather].some(x=>x.matches?.length!==13))return {current:false,message:'更新データの開催回が一致しません。更新完了後に再読み込みしてください。'};
    if(status.state!=='success')return {current:false,message:'更新状態を確認できません。'};
    for(const d of [rec,weather])for(const m of pred.matches){const other=d.matches.find(x=>x.number===m.number);if(!other||other.home!==m.home||other.away!==m.away)return {current:false,message:'対象試合が一致しません。購入候補の表示を停止しています。'};}
    return {current:true,message:'第'+pred.round_id+'回 toto ／ 対象13試合・更新整合性確認済み ／ 販売期限 '+new Date(pred.sales_close_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）'+(status.warnings?.length?' ／ 天気などの取得に未完了項目があります。各試合の取得状態を確認してください。':'')};
  }
  root.Judge90DataStatus={assess};
})(globalThis);
