import { readFileSync, writeFileSync } from "node:fs";

const totoPath = "data/toto_matches.json";
const metricsPath = "data/team_metrics.json";
const h2hPath = "data/h2h.json";
const outputPath = "predictions.json";

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
  if (!team.recent_form?.length) {
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

  const venueStrength =
    venueScore(team, venueType);

  return (
    ppg * 0.25 +
    wr * 0.20 +
    gd * 0.20 +
    form * 0.15 +
    venueStrength * 0.20
  );
}

// --------------------------------------------------
// H2H
// --------------------------------------------------

function findH2H(homeName, awayName) {
  const home = canonicalName(homeName);
  const away = canonicalName(awayName);

  const match = h2hData.matches?.find(item => {
    return (
      canonicalName(item.home) === home &&
      canonicalName(item.away) === away
    ) ||
    (
      canonicalName(item.home) === away &&
      canonicalName(item.away) === home
    );
  });

  return match?.h2h || null;
}

// --------------------------------------------------
// H2Hによる補助強度
//
// H2Hは現在のチーム力を上書きしない。
// 最大でも小さな補助補正に留める。
// --------------------------------------------------

function calculateH2HEffect(h2h, homeName, awayName) {
  if (!h2h) {
    return {
      home: 0,
      away: 0,
      status: "NO_DATA"
    };
  }

  const recent = h2h.recent5?.stats;

  if (!recent || recent.matches === 0) {
    return {
      home: 0,
      away: 0,
      status: "NO_DATA"
    };
  }

  const home = canonicalName(homeName);
  const away = canonicalName(awayName);

  let homeWins = 0;
  let awayWins = 0;

  if (h2h.recent5.advantage === home) {
    homeWins = recent.teamA_wins;
    awayWins = recent.teamB_wins;
  } else if (h2h.recent5.advantage === away) {
    awayWins = recent.teamA_wins;
    homeWins = recent.teamB_wins;
  } else {
    homeWins = recent.teamA_wins;
    awayWins = recent.teamB_wins;
  }

  const total =
    homeWins +
    awayWins +
    recent.draws;

  if (!total) {
    return {
      home: 0,
      away: 0,
      status: "NEUTRAL"
    };
  }

  const difference =
    (homeWins - awayWins) / total;

  // H2Hの影響は最大±0.025
  const effect =
    clamp(
      difference * 0.025,
      -0.025,
      0.025
    );

  let status = "NEUTRAL";

  if (effect > 0.008) {
    status = "HOME_ADVANTAGE";
  } else if (effect < -0.008) {
    status = "AWAY_ADVANTAGE";
  } else {
    status = "BALANCED";
  }

  return {
    home: effect,
    away: -effect,
    status
  };
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
    calculateStrength(
      home,
      "home"
    );

  const awayStrength =
    calculateStrength(
      away,
      "away"
    );

  // H2Hは補助材料としてのみ使用
  const h2hEffect =
    calculateH2HEffect(
      h2h,
      home.team,
      away.team
    );

  const homeAdvantage =
    0.055;

  const difference =
    homeStrength -
    awayStrength +
    homeAdvantage +
    h2hEffect.home;

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
    homeProb +
    awayProb;

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
    calculateStrength(
      home,
      "home"
    );

  const awayStrength =
    calculateStrength(
      away,
      "away"
    );

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
  if (h2h?.recent5?.stats?.matches > 0) {
    const stats =
      h2h.recent5.stats;

    if (
      h2h.recent5.advantage ===
      canonicalName(home.team)
    ) {
      reasons.push(
        `H2H直近5戦はホーム側が優勢（${stats.teamA_wins}-${stats.draws}-${stats.teamB_wins}）`
      );
    } else if (
      h2h.recent5.advantage ===
      canonicalName(away.team)
    ) {
      reasons.push(
        `H2H直近5戦はアウェイ側が優勢（${stats.teamB_wins}-${stats.draws}-${stats.teamA_wins}）`
      );
    } else {
      reasons.push(
        `H2H直近${stats.matches}戦は拮抗`
      );
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

function buildH2HSignal(
  home,
  away,
  h2h
) {
  if (
    !h2h ||
    !h2h.recent5 ||
    !h2h.recent5.stats ||
    h2h.recent5.stats.matches === 0
  ) {
    return {
      available: false,
      recent5: null,
      advantage: "neutral",
      effect: 0
    };
  }

  const effect =
    calculateH2HEffect(
      h2h,
      home.team,
      away.team
    );

  return {
    available: true,

    recent5: {
      matches:
        h2h.recent5.stats.matches,

      home_wins:
        h2h.recent5.stats.teamA_wins,

      draws:
        h2h.recent5.stats.draws,

      away_wins:
        h2h.recent5.stats.teamB_wins,

      home_goals:
        h2h.recent5.stats.teamA_goals,

      away_goals:
        h2h.recent5.stats.teamB_goals
    },

    advantage:
      h2h.recent5.advantage,

    effect:
      Number(
        effect.home.toFixed(3)
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
    getPrediction(
      probabilities
    );

  const confidence =
    getConfidence(
      probabilities
    );

  const uncertainty =
    getUncertainty(
      probabilities
    );

  predictions.push({
    number: match.number,

    home: match.home,

    away: match.away,

    league: match.league,

    prediction,

    probabilities: {
      "1": Number(
        probabilities["1"]
          .toFixed(3)
      ),

      "0": Number(
        probabilities["0"]
          .toFixed(3)
      ),

      "2": Number(
        probabilities["2"]
          .toFixed(3)
      )
    },

    confidence,

    uncertainty: {
      level: uncertainty,

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
        buildH2HSignal(
          home,
          away,
          h2h
        )
    }
  });
}

// --------------------------------------------------
// 13試合すべて取得できなければ失敗扱い
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
    name: "JUDGE SCORE",

    version: "2.1",

    description:
      "今季成績・得失点・ホーム/アウェイ成績・直近5試合・ホームアドバンテージ・H2Hを統合"
  },

  matches: predictions
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
    `${match.number}. ` +
    `${match.home} vs ${match.away} ` +
    `→ ${match.prediction}`
  );

  console.log(
    `   1=${match.probabilities["1"]} ` +
    `0=${match.probabilities["0"]} ` +
    `2=${match.probabilities["2"]
