import { readFileSync, writeFileSync } from "node:fs";

const totoPath = "data/toto_matches.json";
const metricsPath = "data/team_metrics.json";
const h2hPath = "data/h2h.json";
const outputPath = "predictions.json";

// --------------------------------------------------
// データ読み込み
// --------------------------------------------------

const toto = JSON.parse(
  readFileSync(totoPath, "utf8")
);

const metricsData = JSON.parse(
  readFileSync(metricsPath, "utf8")
);

const h2hData = JSON.parse(
  readFileSync(h2hPath, "utf8")
);

const teams = metricsData.teams;

// --------------------------------------------------
// チーム名の違いを吸収
// --------------------------------------------------

const aliases = {
  "水戸ホーリーホック": "水戸",
  "川崎フロンターレ": "川崎Ｆ",
  "清水エスパルス": "清水",
  "アビスパ福岡": "福岡",
  "ガンバ大阪": "Ｇ大阪",
  "ＦＣ東京": "FC東京",
  "FC東京": "FC東京",
  "ＦＣ町田ゼルビア": "町田",
  "横浜Ｆ・マリノス": "横浜FM",
  "Ｖ・ファーレン長崎": "長崎",
  "名古屋グランパス": "名古屋",
  "サンフレッチェ広島": "広島",
  "セレッソ大阪": "Ｃ大阪",
  "東京ヴェルディ": "東京Ｖ",
  "ジェフユナイテッド千葉": "千葉",
  "浦和レッズ": "浦和",
  "ファジアーノ岡山": "岡山",
  "ＦＣ今治": "今治",
  "サガン鳥栖": "鳥栖",
  "いわきＦＣ": "いわき",
  "横浜ＦＣ": "横浜FC",
  "ヴァンラーレ八戸": "八戸",
  "湘南ベルマーレ": "湘南",
  "ヴァンフォーレ甲府": "甲府",
  "ジュビロ磐田": "磐田",
  "ブラウブリッツ秋田": "秋田",
  "徳島ヴォルティス": "徳島"
};

function canonicalName(name) {
  return aliases[name] || name;
}

function findTeam(name) {
  const target = canonicalName(name);

  return teams.find(team => {
    return canonicalName(team.team) === target;
  });
}

// --------------------------------------------------
// 数値処理
// --------------------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value, min, max) {
  if (max === min) {
    return 0.5;
  }

  return clamp(
    (value - min) / (max - min),
    0,
    1
  );
}

// --------------------------------------------------
// チーム指標
// --------------------------------------------------

function winRate(team) {
  if (!team.played) {
    return 0.33;
  }

  return team.wins / team.played;
}

function pointsPerGame(team) {
  if (!team.played) {
    return 1;
  }

  return team.points / team.played;
}

function goalDifferencePerGame(team) {
  if (!team.played) {
    return 0;
  }

  return (
    (team.goals_for - team.goals_against) /
    team.played
  );
}

function recentFormScore(team) {
  if (!team.recent_form || !team.recent_form.length) {
    return 0.5;
  }

  let score = 0;

  for (const match of team.recent_form) {
    if (match.result === "W") {
      score += 1;
    }

    if (match.result === "D") {
      score += 0.5;
    }
  }

  return score / team.recent_form.length;
}

function venueScore(team, venueType) {
  const data = team[venueType];

  if (!data || !data.played) {
    return 0.5;
  }

  return (
    (data.wins + data.draws * 0.5) /
    data.played
  );
}

// --------------------------------------------------
// 総合チーム力
// --------------------------------------------------

function calculateStrength(team, venueType) {
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

  const venueStrength = venueScore(
    team,
    venueType
  );

  return (
    ppg * 0.25 +
    wr * 0.20 +
    gd * 0.20 +
    form * 0.15 +
    venueStrength * 0.20
  );
}

// --------------------------------------------------
// H2Hデータ取得
// --------------------------------------------------

function findH2H(homeName, awayName) {
  const home = canonicalName(homeName);
  const away = canonicalName(awayName);

  if (!h2hData.matches) {
    return null;
  }

  const item = h2hData.matches.find(match => {
    const matchHome = canonicalName(match.home);
    const matchAway = canonicalName(match.away);

    return (
      (matchHome === home && matchAway === away) ||
      (matchHome === away && matchAway === home)
    );
  });

  return item ? item.h2h : null;
}

// --------------------------------------------------
// H2H補正
//
// H2Hは補助材料。
// 最大でも±0.025の小さな補正にする。
// --------------------------------------------------

function calculateH2HEffect(h2h) {
  if (!h2h) {
    return 0;
  }

  const stats = h2h.recent5?.stats;

  if (!stats || stats.matches === 0) {
    return 0;
  }

  const homeWins = stats.teamA_wins || 0;
  const awayWins = stats.teamB_wins || 0;
  const draws = stats.draws || 0;

  const total =
    homeWins +
    awayWins +
    draws;

  if (total === 0) {
    return 0;
  }

  const difference =
    (homeWins - awayWins) / total;

  return clamp(
    difference * 0.025,
    -0.025,
    0.025
  );
}

// --------------------------------------------------
// H2Hの状態
// --------------------------------------------------

function getH2HStatus(h2h) {
  if (!h2h) {
    return "NO_DATA";
  }

  const stats = h2h.recent5?.stats;

  if (!stats || stats.matches === 0) {
    return "NO_DATA";
  }

  const homeWins = stats.teamA_wins || 0;
  const awayWins = stats.teamB_wins || 0;

  if (homeWins > awayWins) {
    return "HOME_ADVANTAGE";
  }

  if (awayWins > homeWins) {
    return "AWAY_ADVANTAGE";
  }

  return "BALANCED";
}

// --------------------------------------------------
// 1 / 0 / 2 の確率
// --------------------------------------------------

function calculateProbabilities(
  home,
  away,
  h2h
) {
  const homeStrength =
    calculateStrength(home, "home");

  const awayStrength =
    calculateStrength(away, "away");

  // 通常のチーム力差
  const strengthDifference =
    homeStrength - awayStrength;

  // H2Hによる小さな補正
  const h2hEffect =
    calculateH2HEffect(h2h);

  // 控えめなホームアドバンテージ
  const homeAdvantage = 0.055;

  const difference =
    strengthDifference +
    homeAdvantage +
    h2hEffect;

  // 力が拮抗するほど引き分けを厚くする
  const drawBase =
    0.24 +
    (
      1 -
      Math.min(
        Math.abs(difference) * 2,
        1
      )
    ) * 0.12;

  let homeProb =
    0.5 +
    difference * 0.55;

  let awayProb =
    0.5 -
    difference * 0.55;

  homeProb = clamp(
    homeProb,
    0.12,
    0.70
  );

  awayProb = clamp(
    awayProb,
    0.12,
    0.70
  );

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

// --------------------------------------------------
// 本命判定
// --------------------------------------------------

function getPrediction(probabilities) {
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])[0][0];
}

// --------------------------------------------------
// 信頼度
// --------------------------------------------------

function getConfidence(probabilities) {
  const values =
    Object.values(probabilities)
      .sort((a, b) => b - a);

  const margin =
    values[0] - values[1];

  return Math.round(
    clamp(
      margin * 180,
      10,
      90
    )
  );
}

// --------------------------------------------------
// 不確実性
// --------------------------------------------------

function getUncertainty(probabilities) {
  const values =
    Object.values(probabilities)
      .sort((a, b) => b - a);

  const margin =
    values[0] - values[1];

  if (margin < 0.08) {
    return "HIGH";
  }

  if (margin < 0.16) {
    return "MEDIUM";
  }

  return "LOW";
}

// --------------------------------------------------
// 不確実性の理由
// --------------------------------------------------

function getReasons(
  home,
  away,
  probabilities,
  h2h
) {
  const reasons = [];

  const homeStrength =
    calculateStrength(home, "home");

  const awayStrength =
    calculateStrength(away, "away");

  if (
    Math.abs(
      homeStrength - awayStrength
    ) < 0.08
  ) {
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
      "ホーム側の開催地成績が優位"
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

  // H2H
  if (h2h) {
    const stats =
      h2h.recent5?.stats;

    if (stats && stats.matches > 0) {
      const homeWins =
        stats.teamA_wins || 0;

      const awayWins =
        stats.teamB_wins || 0;

      const draws =
        stats.draws || 0;

      if (homeWins > awayWins) {
        reasons.push(
          `H2H直近${stats.matches}戦はホーム側が優勢（${homeWins}-${draws}-${awayWins}）`
        );
      } else if (awayWins > homeWins) {
        reasons.push(
          `H2H直近${stats.matches}戦はアウェイ側が優勢（${homeWins}-${draws}-${awayWins}）`
        );
      } else {
        reasons.push(
          `H2H直近${stats.matches}戦は拮抗（${homeWins}-${draws}-${awayWins}）`
        );
      }
    }
  }

  if (!reasons.length) {
    reasons.push(
      "複数の指標から総合評価"
    );
  }

  return reasons;
}

// --------------------------------------------------
// H2Hシグナル
// --------------------------------------------------

function buildH2HSignal(h2h) {
  if (!h2h) {
    return {
      available: false,
      recent5: null,
      all_time: null,
      advantage: "neutral",
      effect: 0
    };
  }

  const recentStats =
    h2h.recent5?.stats;

  const allStats =
    h2h.all_time?.stats;

  if (
    !recentStats ||
    recentStats.matches === 0
  ) {
    return {
      available: false,
      recent5: null,
      all_time: null,
      advantage: "neutral",
      effect: 0
    };
  }

  return {
    available: true,

    recent5: {
      matches:
        recentStats.matches,

      home_wins:
        recentStats.teamA_wins || 0,

      draws:
        recentStats.draws || 0,

      away_wins:
        recentStats.teamB_wins || 0,

      home_goals:
        recentStats.teamA_goals || 0,

      away_goals:
        recentStats.teamB_goals || 0
    },

    all_time: allStats
      ? {
          matches:
            allStats.matches || 0,

          home_wins:
            allStats.teamA_wins || 0,

          draws:
            allStats.draws || 0,

          away_wins:
            allStats.teamB_wins || 0
        }
      : null,

    advantage:
      getH2HStatus(h2h),

    effect:
      Number(
        calculateH2HEffect(h2h).toFixed(3)
      )
  };
}

// --------------------------------------------------
// 予測実行
// --------------------------------------------------

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

  const h2h =
    findH2H(
      match.home,
      match.away
    );

  const probabilities =
    calculateProbabilities(
      home,
      away,
      h2h
    );

  const prediction =
    getPrediction(probabilities);

  const confidence =
    getConfidence(probabilities);

  const uncertainty =
    getUncertainty(probabilities);

  predictions.push({
    number:
      match.number,

    home:
      match.home,

    away:
      match.away,

    league:
      match.league,

    prediction,

    probabilities: {
      "1":
        Number(
          probabilities["1"].toFixed(3)
        ),

      "0":
        Number(
          probabilities["0"].toFixed(3)
        ),

      "2":
        Number(
          probabilities["2"].toFixed(3)
        )
    },

    confidence,

    uncertainty: {
      level:
        uncertainty,

      reasons:
        getReasons(
          home,
          away,
          probabilities,
          h2h
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
          : "neutral",

      h2h:
        buildH2HSignal(h2h)
    }
  });
}

// --------------------------------------------------
// 13試合すべて取得できなければ失敗
// --------------------------------------------------

if (
  predictions.length !==
  toto.matches.length
) {
  throw new Error(
    `予測できた試合数が不足しています。` +
    ` toto=${toto.matches.length},` +
    ` predictions=${predictions.length}`
  );
}

// --------------------------------------------------
// 出力
// --------------------------------------------------

const output = {
  updated_at:
    new Date().toISOString(),

  model: {
    name:
      "JUDGE SCORE",

    version:
      "2.1",

    description:
      "今季成績・得失点・ホーム/アウェイ成績・直近5試合・ホームアドバンテージ・H2Hを統合"
  },

  matches:
    predictions
};

writeFileSync(
  outputPath,
  JSON.stringify(
    output,
    null,
    2
  ),
  "utf8"
);

// --------------------------------------------------
// ログ
// --------------------------------------------------

console.log("");

console.log(
  "=============================="
);

console.log(
  "JUDGE90 PREDICTION ENGINE"
);

console.log(
  "=============================="
);

console.log(
  "H2H data loaded successfully"
);

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

  console.log(
    `   H2H=${match.signals.h2h.available ? "available" : "none"}`
  );
}

console.log("");

console.log(
  `Generated ${predictions.length} predictions`
);

console.log(
  `Saved: ${outputPath}`
);
