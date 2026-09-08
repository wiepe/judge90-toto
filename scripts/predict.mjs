import fs from "node:fs";

const teamMetrics = JSON.parse(
  fs.readFileSync("data/team_metrics.json", "utf8")
);

const totoData = JSON.parse(
  fs.readFileSync("data/toto_matches.json", "utf8")
);

// ========================================
// Utility
// ========================================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ========================================
// Recent form score
// W = 100
// D = 50
// L = 0
// ========================================

function calculateFormScore(form) {
  if (!Array.isArray(form) || form.length === 0) {
    return 50;
  }

  const values = {
    W: 100,
    D: 50,
    L: 0
  };

  const total = form.reduce(
    (sum, result) => sum + (values[result] ?? 50),
    0
  );

  return total / form.length;
}

// ========================================
// Team score
// ========================================

function calculateScore(team, venue = "neutral") {

  if (!team) return 50;

  let score = 50;

  // -----------------------------
  // League rank
  // -----------------------------

  if (typeof team.rank === "number") {

    score += (20 - team.rank) * 1.2;

  }

  // -----------------------------
  // Win rate
  // -----------------------------

  if (
    typeof team.wins === "number" &&
    typeof team.played === "number" &&
    team.played > 0
  ) {

    const winRate =
      (team.wins / team.played) * 100;

    score += (winRate - 50) * 0.35;

  }

  // -----------------------------
  // Goal difference
  // -----------------------------

  if (
    typeof team.goals_for === "number" &&
    typeof team.goals_against === "number"
  ) {

    const goalDifference =
      team.goals_for - team.goals_against;

    score += goalDifference * 0.6;

  }

  // -----------------------------
  // Recent form
  // -----------------------------

  const formScore =
    calculateFormScore(team.recent_form);

  score += (formScore - 50) * 0.25;

  // -----------------------------
  // Home / Away strength
  // -----------------------------

  if (
    venue === "home" &&
    typeof team.home_strength === "number"
  ) {

    score +=
      (team.home_strength * 100 - 50) * 0.15;

  }

  if (
    venue === "away" &&
    typeof team.away_strength === "number"
  ) {

    score +=
      (team.away_strength * 100 - 50) * 0.15;

  }

  // -----------------------------
  // Injury risk penalty
  // -----------------------------

  if (typeof team.injury_risk === "number") {

    score -= team.injury_risk * 10;

  }

  return clamp(score, 1, 99);

}

// ========================================
// Probability calculation
// ========================================

function calculateProbabilities(
  homeScore,
  awayScore
) {

  const difference =
    homeScore - awayScore;

  let home =
    33.3 + difference * 1.8;

  let away =
    33.3 - difference * 1.8;

  // Stronger teams → lower draw probability
  let draw =
    33.4 - Math.abs(difference) * 0.4;

  home = clamp(home, 5, 85);
  away = clamp(away, 5, 85);
  draw = clamp(draw, 10, 40);

  const total =
    home + draw + away;

  return {

    home: +(
      home / total * 100
    ).toFixed(1),

    draw: +(
      draw / total * 100
    ).toFixed(1),

    away: +(
      away / total * 100
    ).toFixed(1)

  };

}

// ========================================
// Prediction
// ========================================

function getPrediction(probabilities) {

  const entries = [

    ["1", probabilities.home],

    ["0", probabilities.draw],

    ["2", probabilities.away]

  ];

  entries.sort(
    (a, b) => b[1] - a[1]
  );

  return entries[0][0];

}

// ========================================
// Recommendation
// ========================================

function getRecommendation(
  probabilities,
  confidence
) {

  const values = [

    probabilities.home,

    probabilities.draw,

    probabilities.away

  ].sort((a, b) => b - a);

  const gap =
    values[0] - values[1];

  if (
    confidence < 30 ||
    gap < 8
  ) {

    return "triple";

  }

  if (
    confidence < 45 ||
    gap < 15
  ) {

    return "double";

  }

  return "single";

}

// ========================================
// Explanation factors
// ========================================

function getFactors(
  homeTeam,
  awayTeam,
  homeScore,
  awayScore
) {

  const factors = [];

  // League rank

  if (
    typeof homeTeam?.rank === "number" &&
    typeof awayTeam?.rank === "number"
  ) {

    if (
      homeTeam.rank < awayTeam.rank
    ) {

      factors.push(
        "リーグ順位：ホームチームが上位"
      );

    } else if (
      homeTeam.rank > awayTeam.rank
    ) {

      factors.push(
        "リーグ順位：アウェイチームが上位"
      );

    } else {

      factors.push(
        "リーグ順位は拮抗"
      );

    }

  }

  // Recent form

  const homeForm =
    calculateFormScore(
      homeTeam?.recent_form
    );

  const awayForm =
    calculateFormScore(
      awayTeam?.recent_form
    );

  const formDiff =
    homeForm - awayForm;

  if (formDiff > 15) {

    factors.push(
      "直近フォーム：ホームチームが優勢"
    );

  } else if (formDiff < -15) {

    factors.push(
      "直近フォーム：アウェイチームが優勢"
    );

  } else {

    factors.push(
      "直近フォームは拮抗"
    );

  }

  // Team strength

  if (
    Math.abs(
      homeScore - awayScore
    ) < 5
  ) {

    factors.push(
      "総合戦力が拮抗しており予測難度が高い"
    );

  }

  // Injury risk

  if (
    homeTeam?.injury_risk >= 0.2
  ) {

    factors.push(
      "ホームチーム：選手コンディションに注意"
    );

  }

  if (
    awayTeam?.injury_risk >= 0.2
  ) {

    factors.push(
      "アウェイチーム：選手コンディションに注意"
    );

  }

  return factors;

}

// ========================================
// Match analysis
// ========================================

const matches =
  totoData.matches.map((match) => {

    const homeTeam =
      teamMetrics[match.home];

    const awayTeam =
      teamMetrics[match.away];

    const homeScore =
      calculateScore(
        homeTeam,
        "home"
      );

    const awayScore =
      calculateScore(
        awayTeam,
        "away"
      );

    const probabilities =
      calculateProbabilities(
        homeScore,
        awayScore
      );

    const sortedProbabilities = [

      probabilities.home,

      probabilities.draw,

      probabilities.away

    ].sort((a, b) => b - a);

    const confidence =
      Math.round(

        sortedProbabilities[0] -
        sortedProbabilities[1] +
        30

      );

    const recommendation =
      getRecommendation(
        probabilities,
        confidence
      );

    return {

      number: match.number,

      competition: match.competition,

      date: match.date,

      home: match.home,

      away: match.away,

      prediction:
        getPrediction(probabilities),

      probabilities,

      confidence:
        clamp(confidence, 1, 99),

      recommendation,

      upset:
        confidence < 35,

      factors:

        getFactors(
          homeTeam,
          awayTeam,
          homeScore,
          awayScore
        ),

      diagnostics: {

        homeScore:
          +homeScore.toFixed(1),

        awayScore:
          +awayScore.toFixed(1),

        difference:
          +(
            homeScore - awayScore
          ).toFixed(1)

      }

    };

  });

// ========================================
// Output
// ========================================

const output = {

  updated_at:
    new Date().toISOString(),

  mode:
    totoData.round.startsWith("TEST")
      ? totoData.round
      : "LIVE",

  toto: {

    round:
      totoData.round,

    type:
      totoData.type,

    deadline:
      totoData.deadline

  },

  model: {

    name:
      "JUDGE SCORE v1.4",

    version:
      "1.4",

    note:
      "順位・勝率・得失点差・直近フォーム・ホームアウェイ適性・選手コンディションを加味した説明可能toto予測モデル"

  },

  matches

};

fs.writeFileSync(

  "predictions.json",

  JSON.stringify(
    output,
    null,
    2
  )

);

console.log(
  `JUDGE90 prediction complete: ${matches.length} matches analyzed`
);
