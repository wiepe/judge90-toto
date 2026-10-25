import{readJSON}from'./lib/operation.mjs';
import{evaluatePublished}from'./lib/evaluation.mjs';
const report=evaluatePublished(process.cwd(),readJSON(process.argv[2]||'data/jleague_matches.json'));
console.log(JSON.stringify({verified_matches:report.overall.n,accuracy:report.overall.accuracy,logloss:report.overall.logloss,brier:report.overall.brier,draw_recall:report.overall.draw_recall,macro_ece:report.overall.calibration?.macro_ece??null,message:report.overall.n?'観測値を更新。精度改善の採用判定とは別です。':'データ不足・改善未確認。本番モデルを維持。'},null,2));
