import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { fetchText } from './lib/http.mjs';
import { parseToto } from './lib/toto.mjs';
import { matchFixture } from './lib/teams.mjs';
const url = new URL('https://store.toto-dream.com/dcs/subos/screen/ps01/spsl000/PGSPSL00001InitTotoSingle.form');
if (process.env.JUDGE90_ROUND) url.searchParams.set('holdCntId', process.env.JUDGE90_ROUND);
try {
  const data = JSON.parse(readFileSync('data/jleague_matches.json', 'utf8'));
  const age = Date.now() - Date.parse(data.fetched_at);
  if (!Number.isFinite(age) || age < -60000 || age > 6*3600000) throw new Error('J.League fixture data is stale');
  const round = parseToto(await fetchText(url), { expectedRound: process.env.JUDGE90_ROUND });
  const output = { ...round, source: 'official_toto', source_url: String(url), fetched_at: new Date().toISOString(), matches: round.matches.map(m => matchFixture(m, data)) };
  mkdirSync('data', { recursive: true });
  writeFileSync('data/toto_matches.json.tmp', JSON.stringify(output, null, 2) + '\n');
  renameSync('data/toto_matches.json.tmp', 'data/toto_matches.json');
  console.log(`Validated round ${round.round_id}, ${round.product}, official matches 1..13`);
} catch (error) { console.error('TOTO FETCH ERROR:', error.message); process.exitCode = 1; }
