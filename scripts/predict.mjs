import fs from "node:fs";

const teamMetrics = JSON.parse(
  fs.readFileSync("data/team_metrics.json", "utf8")
);

const totoData = JSON.parse(
  fs.readFileSync("data/toto_matches.json", "utf8")
);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateScore(team) {
  if (!team) return 50;

  let score = 50;

  // リーグ順位
  if (typeof team.rank === "number") {
    score += (20 - team.rank) * 1.2;
  }

  // 勝率
  if (typeof team.winRate === "number") {
    score += (team.winRate - 50) * 0.35;
  }

  // 得失点差
  if (typeof team.goalDifference === "number") {
    score += team.goalDifference * 0.6;
  }

  // 直近フォーム
  if (typeof team.form === "number") {
    score += (team.form - 50) * 0.25;
  }

  // ホーム・アウェイ適性
  if (typeof team.homeStrength === "number") {
    score += (team.homeStrength - 50) * 0.15;
  }

  return clamp(score, 1, 99);
}

function calculateProbabilities(homeScore, awayScore) {
  const difference = homeScore - awayScore;

  let home = 33.3 + difference * 1.8;
  let away = 33.3 - difference * 1.8;

  // 実力差が小さいほど引き分け確率を上げる
  let draw = 33.4 - Math.abs(difference) * 0.4;

  home = clamp(home, 5, 85);
  away = clamp(away, 5, 85);
  draw = clamp(draw, 10, 40);

  const total = home + draw + away;

  return {
    home: +(home / total * 100).toFixed(1),
    draw: +(draw / total * 100).toFixed(1),
    away: +(away / total * 100).toFixed(1)
  };
}

function getPrediction(probabilities) {
  const entries = [
    ["1", probabilities.home],
    ["0", probabilities.draw],
    ["2", probabilities.away]
  ];

  entries.sort((a, b) => b[1] - a[1]);

  return entries[0][0];
}

function getRecommendation(probabilities, confidence) {
  const values = [
    probabilities.home,
    probabilities.draw,
    probabilities.away
  ].sort((a, b) => b - a);

  const gap = values[0] - values[1];

  if (confidence < 30 || gap < 8) return "triple";
  if (confidence < 45 || gap < 15) return "double";

  return "single";
}

function getFactors(homeTeam, awayTeam, homeScore, awayScore) {
  const factors = [];

  if (
    typeof homeTeam.rank === "number" &&
    typeof awayTeam.rank === "number"
  ) {
    if (homeTeam.rank < awayTeam.rank) {
      factors.push("リーグ順位：ホームチームが上位");
    } else if (homeTeam.rank > awayTeam.rank) {
      factors.push("リーグ順位：アウェイチームが上位");
    } else {
      factors.push("リーグ順位は拮抗");
    }
  }

  if (
    typeof homeTeam.form === "number" &&
    typeof awayTeam.form === "number"
  ) {
    const formDiff = homeTeam.form - awayTeam.form;

    if (formDiff > 10) {
      factors.push("直近フォーム：ホームチームが優勢");
    } else if (formDiff < -10) {
      factors.push("直近フォーム：アウェイチームが優勢");
    } else {
      factors.push("直近フォームは拮抗");
    }
  }

  if (Math.abs(homeScore - awayScore) < 5) {
    factors.push("総合戦力が拮抗しており予測難度が高い");
  }

  return factors;
}

const matches = totoData.matches.map((match) => {
  const homeTeam = teamMetrics[match.home];
  const awayTeam = teamMetrics[match.away];

  const homeScore = calculateScore(homeTeam);
  const awayScore = calculateScore(awayTeam);

  const probabilities = calculateProbabilities(
    homeScore,
    awayScore
  );

  const sortedProbabilities = [
    probabilities.home,
    probabilities.draw,
    probabilities.away
  ].sort((a, b) => b - a);

  const confidence = Math.round(
    sortedProbabilities[0] - sortedProbabilities[1] + 30
  );

  const recommendation = getRecommendation(
    probabilities,
    confidence
  );

  return {
    number: match.number,
    competition: match.competition,
    date: match.date,
    home: match.home,
    away: match.away,
    prediction: getPrediction(probabilities),
    probabilities,
    confidence: clamp(confidence, 1, 99),
    recommendation,
    upset: confidence < 35,
    factors: getFactors(
      homeTeam,
      awayTeam,
      homeScore,
      awayScore
    ),
    diagnostics: {
      homeScore: +homeScore.toFixed(1),
      awayScore: +awayScore.toFixed(1),
      difference: +(homeScore - awayScore).toFixed(1)
    }
  };
});

const output = {
  updated_at: new Date().toISOString(),
  mode: totoData.round.startsWith("TEST") ? totoData.round : "LIVE",
  toto: {
    round: totoData.round,
    type: totoData.type,
    deadline: totoData.deadline
  },
  model: {
    name: "JUDGE SCORE v1.3",
    version: "1.3",
    note: "toto対象試合を読み込み、チーム指標から勝敗確率を算出する説明可能モデル"
  },
  matches
};

fs.writeFileSync(
  "predictions.json",
  JSON.stringify(output, null, 2)
);

console.log(
  `JUDGE90 prediction complete: ${matches.length} matches analyzed`
);
