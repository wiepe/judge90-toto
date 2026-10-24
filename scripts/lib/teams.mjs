import { readFileSync } from 'node:fs';
const normalize = name => String(name).normalize('NFKC').replace(/[\s・･]/g, '').toLowerCase();
export function teamRegistry(data = JSON.parse(readFileSync(new URL('../../data/teams.json', import.meta.url), 'utf8'))) {
  const aliases = new Map();
  const ids = new Set();
  for (const team of data.teams) {
    if (ids.has(team.id)) throw new Error(`Duplicate team ID: ${team.id}`);
    ids.add(team.id);
    for (const name of [team.name, ...team.aliases]) {
      const key = normalize(name);
      if (aliases.has(key) && aliases.get(key).id !== team.id) throw new Error(`Ambiguous team alias: ${name}`);
      aliases.set(key, team);
    }
  }
  return name => {
    const team = aliases.get(normalize(name));
    if (!team) throw new Error(`Unknown team: ${name}. Register a verified alias/ID before publishing.`);
    return team;
  };
}
export function matchFixture(match, data, resolve = teamRegistry()) {
  const home = resolve(match.home), away = resolve(match.away);
  const found = data.leagues.flatMap(l => l.matches.filter(m => m.date === match.match_date &&
    resolve(m.home).id === home.id && resolve(m.away).id === away.id).map(m => ({ ...m, league: l.league })));
  if (found.length !== 1) throw new Error(`Fixture must match exactly once: ${match.number} ${match.home} vs ${match.away} (${found.length})`);
  const game = found[0];
  if (!['J1', 'J2', 'J3'].includes(game.league)) throw new Error('Unsupported competition');
  if (game.score) throw new Error(`Match ${match.number} is already completed`);
  return { ...match, home: home.name, away: away.name, home_team_id: home.id, away_team_id: away.id, league: game.league, kickoff: game.kickoff, stadium: game.stadium };
}
