
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const inputPath = "data/jleague_matches.json";
const outputPath = "data/team_metrics.json";

const data = JSON.parse(
  readFileSync(inputPath, "utf8")
);

function parseScore(score) {
  if (!score) return null;

  const match = score.match(/^(\d+)\s*-\s*(\d+)$/);

  if (!match) return null;

  return {
    homeGoals: Number(match[1]),
    awayGoals: Number(match[2])
  };
}

function createTeam(name, league) {
  return {
    team_id: `${league}_${name}`,
    team: name,
    league,
    season: 2026,

    rank: null,
    points: 0,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,

    goals_for: 0,
    goals_against: 0,
    goal_difference: 0,

    recent_form: [],

    home: {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goals_for: 0,
      goals_against: 0
    },

    away: {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goals_for: 0,
      goals_against: 0
    },

    performance: {
      xg: null,
      xga: null,
      shots: null,
      shots_on_target: null
    },

    availability: {
      injury_risk: null
    }
  };
}

function getResult(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return "1";
  if (homeGoals < awayGoals) return "2";
  return "0";
}

function addResult(team, result, goalsFor, goalsAgainst, venue) {
  team.played += 1;
  team.goals_for += goalsFor;
  team.goals_against += goalsAgainst;

  if (result === "1") {
    team.wins += 1;
    team.points += 3;
  } else if (result === "0") {
    team.draws += 1;
    team.points += 1;
  } else {
    team.losses += 1;
  }

  const side = team[venue];

  side.played += 1;
  side.goals_for += goalsFor;
  side.goals_against += goalsAgainst;

  if (result === "1") {
    side.wins += 1;
    side.points += 3;
  } else if (result === "0") {
    side.draws += 1;
    side.points += 1;
  } else {
    side.losses += 1;
  }
}

function getTeamResult(teamName, home, away, homeGoals, awayGoals) {
  if (teamName === home) {
    if (homeGoals > awayGoals) return "W";
    if (homeGoals < awayGoals) return "L";
    return "D";
  }

  if (awayGoals > homeGoals) return "W";
  if (awayGoals < homeGoals) return "L";
  return "D";
}

const teams = new Map();

for (const leagueData of data.leagues) {
  const league = leagueData.league;

  for (const match of leagueData.matches) {
    const score = parseScore(match.score);

    // 未開催試合は成績集計から除外
    if (!score) {
      continue;
    }

    const home = match.home;
    const away = match.away;

    if (!teams.has(`${league}_${home}`)) {
      teams.set(
        `${league}_${home}`,
        createTeam(home, league)
      );
    }

    if (!teams.has(`${league}_${away}`)) {
      teams.set(
        `${league}_${away}`,
        createTeam(away, league)
      );
    }

    const homeTeam = teams.get(`${league}_${home}`);
    const awayTeam = teams.get(`${league}_${away}`);

    const matchResult = getResult(
      score.homeGoals,
      score.awayGoals
    );

    addResult(
      homeTeam,
      matchResult,
      score.homeGoals,
      score.awayGoals,
      "home"
    );

    const awayResult =
      matchResult === "1"
        ? "2"
        : matchResult === "2"
          ? "1"
          : "0";

    addResult(
      awayTeam,
      awayResult,
      score.awayGoals,
      score.homeGoals,
      "away"
    );

    // 直近試合用の履歴
    homeTeam.recent_form.push({
      date: match.date,
      opponent: away,
      venue: "home",
      result: getTeamResult(
        home,
        home,
        away,
        score.homeGoals,
        score.awayGoals
      ),
      goals_for: score.homeGoals,
      goals_against: score.awayGoals
    });

    awayTeam.recent_form.push({
      date: match.date,
      opponent: home,
      venue: "away",
      result: getTeamResult(
        away,
        home,
        away,
        score.homeGoals,
        score.awayGoals
      ),
      goals_for: score.awayGoals,
      goals_against: score.homeGoals
    });
  }
}

// リーグごとに順位を計算
const leagues = ["J1", "J2", "J3"];

for (const league of leagues) {
  const leagueTeams = [...teams.values()]
    .filter(team => team.league === league)
    .sort((a, b) => {
      // 勝点 → 得失点差 → 得点
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      const gdA =
        a.goals_for - a.goals_against;

      const gdB =
        b.goals_for - b.goals_against;

      if (gdB !== gdA) {
        return gdB - gdA;
      }

      return b.goals_for - a.goals_for;
    });

  leagueTeams.forEach((team, index) => {
    team.rank = index + 1;

    // 日付順に並べてから直近5試合
    team.recent_form.sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    team.recent_form =
      team.recent_form.slice(-5);

    team.goal_difference =
      team.goals_for - team.goals_against;
  });
}

const output = {
  season: "2026/27",
  source: "J.League Data Site",
  generated_at: new Date().toISOString(),
  teams: [...teams.values()]
};

mkdirSync("data", { recursive: true });

writeFileSync(
  outputPath,
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log("");
console.log("==============================");
console.log("JUDGE90 TEAM METRICS");
console.log("==============================");

for (const league of leagues) {
  const count = output.teams.filter(
    team => team.league === league
  ).length;

  console.log(`${league}: ${count} teams`);
}

console.log("");
console.log(`Saved: ${outputPath}`);
