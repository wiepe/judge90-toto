import { readFileSync, writeFileSync } from "node:fs";

const totoPath = "data/toto_matches.json";
const metricsPath = "data/team_metrics.json";
const outputPath = "predictions.json";

const toto = JSON.parse(
  readFileSync(totoPath, "utf8")
);

const metricsData = JSON.parse(
  readFileSync(metricsPath, "utf8")
);

const teams = metricsData.teams;

function findTeam(name) {
  return teams.find(team => team.team === name);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value, min, max) {
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

function winRate(team) {
  if (!team.played) return 0.33;
  return team.wins / team.played;
}

function pointsPerGame(team) {
  if (!team.played) return 1;
  return team.points / team.played;
}

function goalDifferencePerGame(team) {
  if (!team.played) return 0;
  return (
    (team.goals_for - team.goals_against) /
    team.played
  );
}

function recentFormScore(team) {
  if (!team.recent_form?.length) {
    return 0.5;
  }

  let score = 0;

  for (const match of team.recent_form) {
    if (match.result === "W") score += 1;
    if (match.result === "D") score += 0.5;
  }

  return score / team.recent_form.length;
}

function venueScore(team, venue) {
  const data = team[venue];

  if (!data || !data.played) {
    return 0.5;
  }

  return (
    (data.wins + data.draws * 0.5) /
    data.played
  );
}

function calculateStrength(team, venue) {
  const ppg = normalize(
    pointsPerGame(team),
    0,
    3
  );

  const wr = winRate(team);

  const gd = clamp(
    (goalDifferencePerGame(team) + 2) / 4,
    0,
    1
  );

  const form = recentFormScore(team);

  const venue = venueScore(team, venue);

  return (
    ppg * 0.25 +
    wr * 0.20 +
    gd * 0.20 +
    form * 0.15 +
    venue * 0.20
  );
}

function calculateProbabilities(home, away) {
  const homeStrength =
    calculateStrength(home, "home");

  const awayStrength =
    calculateStrength(away, "away");

  // ホームアドバンテージ
  const homeAdvantage = 0.055;

  const difference =
    homeStrength -
    awayStrength +
    homeAdvantage;

  // 差が小さいほど引き分けを厚くする
  const drawBase =
    0.24 +
    (1 - Math.min(Math.abs(difference) * 2, 1)) * 0.12;

  let homeProb =
    0.5 + difference * 0.55;

  let awayProb =
    0.5 - difference * 0.55;

  homeProb = clamp(homeProb, 0.12, 0.70);
  awayProb = clamp(awayProb, 0.12, 0.70);

  const remaining =
    1 - drawBase;

  const directionalTotal =
    homeProb + awayProb;

  homeProb =
    (homeProb / directionalTotal) *
    remaining;

  awayProb =
    (awayProb / directionalTotal) *
    remaining;

  return {
    "1": homeProb,
    "0": drawBase,
    "2": awayProb
  };
}

function getPrediction(probabilities) {
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])[0][0];
}

function getConfidence(probabilities) {
  const values =
    Object.values(probabilities).sort((a, b) => b - a);

  const margin = values[0] - values[1];

  return Math.round(
    clamp(margin * 180, 10, 90)
  );
}

function getUncertainty(probabilities) {
  const values =
    Object.values(probabilities).sort((a, b) => b - a);

  const margin = values[0] - values[1];

  if (margin < 0.08) {
    return "HIGH";
  }

  if (margin < 0.16) {
    return "MEDIUM";
  }

  return "LOW";
}

function getReasons(home, away, probabilities) {
  const reasons = [];

  const homeStrength =
    calculateStrength(home, "home");

  const awayStrength =
    calculateStrength(away, "away");

  if (Math.abs(homeStrength - awayStrength) < 0.08) {
    reasons.push(
      "両チームの総合評価が近い"
    );
  }

  if (
    probabilities["0"] >= 0.32
  ) {
    reasons.push(
      "引き分け確率が高い"
    );
  }

  if (
    venueScore(home, "home") >
    venueScore(away, "away") + 0.12
  ) {
    reasons.push(
      "ホーム成績が優位"
    );
  }

  if (
    recentFormScore(away) >
    recentFormScore(home) + 0.12
  ) {
    reasons.push(
      "アウェイ側の直近フォームが優位"
    );
  }

  if (
    recentFormScore(home) >
    recentFormScore(away) + 0.12
  ) {
    reasons.push(
      "ホーム側の直近フォームが優位"
    );
  }

  if (!reasons.length) {
    reasons.push(
      "複数の指標から総合評価"
    );
  }

  return reasons;
}

const predictions = [];

for (const match of toto.matches) {
  const home = findTeam(match.home);
  const away = findTeam(match.away);

  if (!home || !away) {
    console.warn(
      `TEAM NOT FOUND: ${match.home} vs ${match.away}`
    );

    continue;
  }

  const probabilities =
    calculateProbabilities(home, away);

  const prediction =
    getPrediction(probabilities);

  const confidence =
    getConfidence(probabilities);

  const uncertainty =
    getUncertainty(probabilities);

  predictions.push({
    number: match.number,
    home: match.home,
    away: match.away,
    league: match.league,

    prediction,

    probabilities: {
      "1": Number(
        probabilities["1"].toFixed(3)
      ),
      "0": Number(
        probabilities["0"].toFixed(3)
      ),
      "2": Number(
        probabilities["2"].toFixed(3)
      )
    },

    confidence,

    uncertainty: {
      level: uncertainty,
      reasons: getReasons(
        home,
        away,
        probabilities
      )
    },

    signals: {
      season_strength:
        home.points >= away.points
          ? home.team
          : away.team,

      momentum:
        recentFormScore(home) >=
        recentFormScore(away)
          ? home.team
          : away.team,

      home_advantage:
        home.home.played > 0
          ? home.team
          : "neutral"
    }
  });
}

const output = {
  updated_at: new Date().toISOString(),

  model: {
    name: "JUDGE SCORE",
    version: "2.0",

    description:
      "今季成績・得失点・ホーム/アウェイ成績・直近5試合・ホームアドバンテージを統合"
  },

  matches: predictions
};

writeFileSync(
  outputPath,
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log("");
console.log("==============================");
console.log("JUDGE90 PREDICTION ENGINE");
console.log("==============================");

for (const match of predictions) {
  console.log(
    `${match.number}. ${match.home} vs ${match.away} → ${match.prediction}`
  );

  console.log(
    `   1=${match.probabilities["1"]} ` +
    `0=${match.probabilities["0"]} ` +
    `2=${match.probabilities["2"]} ` +
    `confidence=${match.confidence}`
  );

  console.log(
    `   uncertainty=${match.uncertainty.level}`
  );
}

console.log("");
console.log(
  `Generated ${predictions.length} predictions`
);

console.log(
  `Saved: ${outputPath}`
);
