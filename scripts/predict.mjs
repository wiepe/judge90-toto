import fs from "node:fs";

// =================================
// JUDGE 90 Prediction Engine v1.1
// =================================

const fixturesData = JSON.parse(
  fs.readFileSync("data/fixtures.json", "utf8")
);

const teams = JSON.parse(
  fs.readFileSync("data/team_metrics.json", "utf8")
);


// 直近フォームを数値化
function calculateForm(form) {
  const points = {
    W: 1,
    D: 0.5,
    L: 0
  };

  const total = form.reduce(
    (sum, result) => sum + (points[result] ?? 0),
    0
  );

  return total / form.length;
}


// チーム総合スコア
function calculateTeamScore(team, isHome) {

  const winRate = team.wins / team.played;

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


// 試合予測
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


  // 勝敗確率
  let homeWin =
    45 + difference * 2;

  let awayWin =
    30 - difference * 2;

  let draw =
    25 - Math.abs(difference) * 0.5;


  // 最低確率
  homeWin = Math.max(homeWin, 5);
  awayWin = Math.max(awayWin, 5);
  draw = Math.max(draw, 10);


  // 合計100に正規化
  const total =
    homeWin + draw + awayWin;

  homeWin =
    Number(((homeWin / total) * 100).toFixed(1));

  draw =
    Number(((draw / total) * 100).toFixed(1));

  awayWin =
    Number(((awayWin / total) * 100).toFixed(1));


  // 予想順位
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


  // toto買い方判定
  let recommendation;

  if (
    confidence >= 20 &&
    sorted[0][1] >= 55
  ) {
    recommendation = "single";
  }

  else if (
    confidence >= 10
  ) {
    recommendation = "double";
  }

  else {
    recommendation = "triple";
  }


  // 分析コメント
  const factors = [];

  if (home.form && away.form) {
    // placeholder
  }

  if (home.rank < away.rank) {
    factors.push(
      `リーグ順位：${match.home}が上位`
    );
  } else if (away.rank < home.rank) {
    factors.push(
      `リーグ順位：${match.away}が上位`
    );
  }

  const homeForm =
    calculateForm(home.recent_form);

  const awayForm =
    calculateForm(away.recent_form);

  if (homeForm - awayForm >= 0.2) {
    factors.push(
      `直近フォーム：${match.home}が優勢`
    );
  } else if (awayForm - homeForm >= 0.2) {
    factors.push(
      `直近フォーム：${match.away}が優勢`
    );
  } else {
    factors.push(
      "直近フォームは拮抗"
    );
  }

  if (home.injury_risk >= 0.14) {
    factors.push(
      `${match.home}：選手コンディションに注意`
    );
  }

  if (away.injury_risk >= 0.14) {
    factors.push(
      `${match.away}：選手コンディションに注意`
    );
  }

  if (Math.abs(difference) < 3) {
    factors.push(
      "戦力差が小さく、引き分けも警戒"
    );
  }

  // 波乱注意
  const upset =
    confidence < 10 ||
    (
      prediction !== "1" &&
      Math.abs(difference) < 5
    );


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

    upset,

    factors,

    diagnostics: {
      homeScore:
        Number(adjustedHomeScore.toFixed(2)),
      awayScore:
        Number(awayScore.toFixed(2)),
      difference:
        Number(difference.toFixed(2))
    }
  };
}


// 全試合予測
const predictions =
  fixturesData.matches
    .map(predictMatch)
    .filter(Boolean);


// predictions.json生成
const output = {

  updated_at:
    new Date().toISOString(),

  mode:
    "TEST",

  model: {
    name:
      "JUDGE SCORE v1.1",
    version:
      "1.1",
    note:
      "順位・勝率・得失点差・直近フォーム・ホームアウェイ適性を加味した説明可能モデル"
  },

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
