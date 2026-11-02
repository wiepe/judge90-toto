import { probabilities, scoreRows } from './scoring.mjs';

// Input is exclusively evaluatePublished's delivery-verified rows. This is an
// observation report, never a fitting/selection or production-model interface.
export function reviewRounds(rows) {
  return [...new Set(rows.map(r => String(r.round_id)))].map(round_id => {
    const group = rows.filter(r => String(r.round_id) === round_id);
    const metrics = scoreRows(group);
    const matches = group.map(r => {
      const p = probabilities(r.probabilities);
      const ordered = Object.values(p).sort((a, b) => b - a);
      const score = scoreRows([r]);
      return {
        number: r.number, home: r.home, away: r.away, league: r.league,
        date: r.date, score: r.review_context?.score ?? null,
        prediction: r.prediction, actual: r.actual, hit: r.prediction === r.actual,
        probabilities: p, picked_probability: p[r.prediction],
        actual_probability: p[r.actual], top_two_gap: ordered[0] - ordered[1],
        logloss: score.logloss, brier: score.brier,
        saved_reasons: r.review_context?.saved_reasons ?? [],
        data_notes: r.review_context?.data_notes ?? [],
        data_usage: r.model?.data_usage ?? null,
        published_at: r.published_at, snapshot_id: r.snapshot_id,
      };
    }).sort((a, b) => a.number - b.number);
    return {
      round_id, last_match_date: group.map(r => r.date).sort().at(-1),
      complete: group.length === 13 && new Set(group.map(r => r.number)).size === 13 && group.every(r => Number.isInteger(r.number) && r.number >= 1 && r.number <= 13),
      metrics, by_league: Object.fromEntries(['J1', 'J2', 'J3'].map(l => [l, scoreRows(group.filter(r => r.league === l))])),
      // A deterministic home pick has no estimated probability distribution.
      // Do not fabricate its LogLoss or Brier score.
      home_always: { n: group.length, hits: group.filter(r => r.actual === '1').length, accuracy: group.filter(r => r.actual === '1').length / group.length },
      expected_hits: matches.reduce((s, m) => s + m.picked_probability, 0),
      expected_draws: matches.reduce((s, m) => s + m.probabilities['0'], 0),
      matches,
      limitations: [
        '公開時の予測根拠と結果の記録です。戦術・負傷・退場など試合結果の原因を特定したものではありません。',
        '期待的中数・期待引き分け数はモデル確率の合計です。実績や保証ではありません。',
        '少数試合の一致・不一致から精度向上や確率校正の成功を判定せず、本番モデルを維持します。',
        'Jリーグの得点との照合です。totoの中止・払戻裁定や実購入の当選判定とは区別します。',
      ],
    };
  }).sort((a, b) => a.last_match_date.localeCompare(b.last_match_date) || a.round_id.localeCompare(b.round_id, undefined, { numeric: true }));
}

export function savedReviewContext(match, result) {
  const h2h = match.signals?.h2h;
  const notes = [];
  if (h2h?.available === false) notes.push('公開時の対戦履歴が不足しています。');
  const all = h2h?.all_time;
  if (all && (!['matches', 'home_wins', 'draws', 'away_wins'].every(k => Number.isInteger(all[k]) && all[k] >= 0) || all.home_wins + all.draws + all.away_wins !== all.matches)) {
    notes.push('通算対戦の勝敗内訳に欠損・不整合があります。0勝という実績として扱いません。');
  }
  const reasons=match.uncertainty?.reasons;
  return { score: result.score ?? null, saved_reasons: Array.isArray(reasons) ? reasons.filter(r => typeof r === 'string') : [], data_notes: notes };
}
