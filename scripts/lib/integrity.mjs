import { createHash } from 'node:crypto';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sourceDigest(round) { const { dataset_id, ...source } = round; return digest(source); }
export function validateRound(round, now = new Date()) {
  if (!/^\d+$/.test(round.round_id || '') || round.product_id !== '01' || round.product !== 'toto') throw new Error('Verified toto round metadata is required');
  for (const key of ['fetched_at']) {
    const age = now - new Date(round[key]);
    if (!Number.isFinite(age) || age < -60000 || age > 6*3600000) throw new Error(`Stale/invalid ${key}`);
  }
  if (!(now >= new Date(round.sales_open_at) && now < new Date(round.sales_close_at))) throw new Error('Sales period expired/not open');
  if (round.matches?.length !== 13) throw new Error('Exactly 13 matches are required');
  const games = new Set(), teams = new Set();
  round.matches.forEach((m,i) => {
    if (m.number !== i+1 || !m.official_game_id || !m.home_team_id || !m.away_team_id || !['J1','J2','J3'].includes(m.league)) throw new Error(`Invalid match identity: ${i+1}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.match_date || '')) throw new Error('Full match date required');
    games.add(m.official_game_id); teams.add(m.home_team_id); teams.add(m.away_team_id);
  });
  if (games.size !== 13 || teams.size !== 26) throw new Error('Duplicate game/team identities');
}
export function roundMetadata(round) {
  return Object.fromEntries(['round_id','product','product_id','sales_open_at','sales_close_at'].map(k => [k,round[k]]));
}
export function validateBundle(round, predictions, recommendation, weather, now = new Date()) {
  validateRound(round, now);
  for (const [name,data] of Object.entries({predictions,recommendation,weather})) {
    if (data.matches?.length !== 13) throw new Error(`${name}: incomplete match set`);
    for (let i=0;i<13;i++) {
      const expected = round.matches[i], actual = data.matches.find(m => m.number === expected.number);
      if (!actual || actual.home !== expected.home || actual.away !== expected.away) throw new Error(`${name}: mismatched match ${expected.number}`);
    }
  }
  for (const [name,data] of Object.entries({predictions,recommendation})) {
    for (const key of ['round_id','product','product_id','sales_open_at','sales_close_at']) {
      if (data[key] !== round[key]) throw new Error(`${name}: ${key} mismatch`);
    }
  }
  if(predictions.model?.data_usage?.weather===true&&weather.matches.some(m=>m.available!==true))throw new Error('Required weather inputs missing');
  predictions.matches.forEach(m => {
    const p = ['1','0','2'].map(k => m.probabilities?.[k]);
    if (!p.every(n => Number.isFinite(n) && n >= 0 && n <= 1) || Math.abs(p.reduce((a,b)=>a+b,0)-1) > 0.002) throw new Error('Invalid prediction probabilities');
  });
}
