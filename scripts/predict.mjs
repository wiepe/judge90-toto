
import fs from "node:fs";

// ================================
// JUDGE 90 Prediction Engine v1
// ================================

// データ読み込み
const fixturesData = JSON.parse(
  fs.readFileSync("data/fixtures.json", "utf8")
);

const teams = JSON.parse(
  fs.readFileSync("data/team_metrics.json", "utf8")
);


// ================================
// 直近フォームを数値化
// W = 勝ち
// D = 引き分け
// L = 負け
// ================================

function calculateForm(form) {
  const points = {
    W: 1,
    D: 0.5,
    L: 0
  };

  const total = form.reduce(
    (sum, result) => sum + points[result],
    0
  );

  return total / form.length;
}


// ================================
// チーム総合スコア
// ================================

function calculateTeamScore(team, isHome) {

  const winRate =
    team.wins / team.played;

  const goalDifference =
    (team.goals_for - team.goals_against) /
    team.played;

  const formScore =
    calculateForm(team.recent_form);

  const venueStrength =
    isHome
      ? team.home_strength
      : team.away_strength;

  const injuryPenalty =
    team.injury_risk;

  const score =
    winRate * 30 +
    goalDifference * 8 +
    formScore * 25 +
    venueStrength * 20 -
    injuryPenalty * 10;

  return score;
}


// ================================
// 試合予測
// ================================

function predictMatch(match) {

  const home = teams[match.home];
  const away = teams[match.away];

  if (!home || !away) {
    console.warn(
      `Team data missing: ${match.home} vs ${match.away}`
    );
    return null;
  }

  const homeScore =
    calculateTeamScore(home, true);

  const awayScore =
    calculateTeamScore(away, false);

  // ホームアドバンテージ
  const adjustedHomeScore =
    homeScore + 3;

  const difference =
    adjustedHomeScore - awayScore;


  // ================================
  // 勝敗確率計算
  // ================================

  let homeWin =
    45 + difference * 2;

  let awayWin =
    30 - difference * 2;

  // 実力差が小さいほど引き分け増加
  let draw =
    25 - Math.abs(difference) * 0.5;


  // 最低値
  homeWin = Math.max(homeWin, 5);
  awayWin = Math.max(awayWin, 5);
  draw = Math.max(draw, 10);


  // 合計100に正規化
  const total =
    homeWin + draw + awayWin;

  homeWin =
    (homeWin / total) * 100;

  draw =
    (draw / total) * 100;

  awayWin =
    (awayWin / total) * 100;


  // 小数点1桁
  homeWin =
    Number(homeWin.toFixed(1));

  draw =
    Number(draw.toFixed(1));

  awayWin =
    Number(awayWin.toFixed(1));


  // ================================
  // 最終予想
  // ================================

  const probabilities = {
    "1": homeWin,
    "0": draw,
    "2": awayWin
  };

  const sorted =
    Object.entries(probabilities)
      .sort((a, b) => b[1] - a[1]);

  const prediction =
    sorted[0][0];

  const confidence =
    Math.round(
      sorted[0][1] -
      sorted[1][1]
    );


  // ================================
  // toto買い方判定
  // ================================

  let recommendation;

  if (
    confidence >= 20 &&
    sorted[0][1] >= 55
  ) {
    recommendation = "SINGLE";
  }

  else if (
    confidence >= 10
  ) {
    recommendation = "DOUBLE";
  }

  else {
    recommendation = "TRIPLE";
  }


  return {
    id: match.id,
    competition: match.competition,
    date: match.date,
    home: match.home,
    away: match.away,

    prediction,

    probabilities: {
      home: homeWin,
      draw: draw,
      away: awayWin
    },

    confidence,

    recommendation,

    analysis: {
      homeScore:
        Number(adjustedHomeScore.toFixed(2)),
      awayScore:
        Number(awayScore.toFixed(2)),
      difference:
        Number(difference.toFixed(2))
    }
  };
}


// ================================
// 全試合予測
// ================================

const predictions =
  fixturesData.matches
    .map(predictMatch)
    .filter(Boolean);


// ================================
// predictions.json生成
// ================================

const output = {
  generatedAt:
    new Date().toISOString(),

  model:
    "JUDGE SCORE v1",

  matches:
    predictions
};

fs.writeFileSync(
  "predictions.json",
  JSON.stringify(output, null, 2)
);

console.log(
  `Generated ${predictions.length} predictions`
);
