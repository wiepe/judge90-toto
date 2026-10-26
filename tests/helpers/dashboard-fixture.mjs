// Synthetic, fixed input: never depend on the latest production round/status.
// Callers must control their clock too, including event-handler Date reads.
export function dashboardFixture() {
  const common = {
    dataset_id: 'synthetic-dashboard', round_id: '1668', product_id: '01',
    sales_open_at: '2026-10-24T08:00:00+09:00',
    sales_close_at: '2026-10-31T13:50:00+09:00',
  };
  const updated_at = '2026-10-26T04:55:03.000Z';
  const matches = Array.from({length: 13}, (_, i) => ({
    number: i + 1, home: 'ホーム' + (i + 1), away: 'アウェイ' + (i + 1),
    home_team_id: 'h' + i, away_team_id: 'a' + i,
    league: i < 10 ? 'J1' : i < 12 ? 'J2' : 'J3',
    match_date: '2026-10-31', kickoff: '14:00', stadium: 'テスト会場',
    prediction: '1', probabilities: {'1': .45, '0': .30, '2': .25},
    uncertainty: {reasons: ['テスト専用の合成データ']},
  }));
  return {
    predictions: {...common, updated_at, model: {version: '2.1', data_usage: {weather: false}}, matches},
    recommendation: {...common, matches: structuredClone(matches)},
    weather: {...common, matches: matches.map(m => ({...m, available: false, reason: 'coordinates_not_found'}))},
    status: {...common, state: 'success', checked_at: updated_at},
    evaluation: {overall: {n: 0}, rows: [], by_league: {}, timeline: []},
    teamMetrics: {...common, teams: []},
  };
}
export function dashboardFiles() {
  const b = dashboardFixture();
  return {
    'predictions.json': b.predictions, 'recommendation.json': b.recommendation,
    'data/weather.json': b.weather, 'data/update_status.json': b.status,
    'data/evaluation.json': b.evaluation, 'data/team_metrics.json': b.teamMetrics,
  };
}
