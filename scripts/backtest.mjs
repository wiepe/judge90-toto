
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const INPUT = "data/jleague_matches.json";
const OUTPUT = "data/backtest.json";

const data = JSON.parse(readFileSync(INPUT, "utf8"));

const ALIASES = {
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

const canonical = (name) => ALIASES[name] || name;

const outcome = (homeGoals, awayGoals) => {
  if (homeGoals > awayGoals) return "1";
  if (homeGoals < awayGoals) return "2";
  return "0";
};

const clamp = (v, min, max) =>
  Math.max(min, Math.min(max, v));

const normalize = (v, min, max) =>
  max === min
    ? 0.5
    : clamp((v - min) / (max - min), 0, 1);

const matches = data.leagues
  .flatMap((leagueData) =>
    leagueData.matches.map((match) => ({
      ...match,
      league: leagueData.league
    }))
  )
  .filter((match) => /^\d+\s*-\s*\d+$/.test(match.score || ""))
  .sort((a, b) => a.date.localeCompare(b.date));

function makeTeam() {
  return {
    played: 0,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_for: 0,
    goals_against: 0,

    home: {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0
    },

    away: {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0
    },

    form: []
  };
}

function getTeam(map, league, name) {
  const key = `${league}::${canonical(name)}`;

  if (!map.has(key)) {
    map.set(key, makeTeam());
  }

  return map.get(key);
}

function addResult(team, result, gf, ga, venue) {
  team.played += 1;
  team.goals_for += gf;
  team.goals_against += ga;

  if (result === "W") {
    team.wins += 1;
    team.points += 3;
  } else if (result === "D") {
    team.draws += 1;
    team.points += 1;
  } else {
    team.losses += 1;
  }

  const side = team[venue];

  side.played += 1;

  if (result === "W") {
    side.wins += 1;
  } else if (result === "D") {
    side.draws += 1;
  } else {
    side.losses += 1;
  }

  team.form.push(result);

  if (team.form.length > 5) {
    team.form.shift();
  }
}

const winRate = (team) =>
  team.played ? team.wins / team.played : 0.33;

const ppg = (team) =>
  team.played ? team.points / team.played : 1;

const gdpg = (team) =>
  team.played
    ? (team.goals_for - team.goals_against) / team.played
    : 0;

const formScore = (team) =>
  team.form.length
    ? team.form.reduce(
        (sum, result) =>
          sum +
          (result === "W"
            ? 1
            : result === "D"
            ? 0.5
            : 0),
        0
      ) / team.form.length
    : 0.5;

const venueScore = (team, side) =>
  team[side].played
    ? (team[side].wins + team[side].draws * 0.5) /
      team[side].played
    : 0.5;

function strength(team, side, weights) {
  const p = normalize(ppg(team), 0, 3);

  const r = winRate(team);

  const gd = clamp(
    (gdpg(team) + 2) / 4,
    0,
    1
  );

  const f = formScore(team);

  const v = venueScore(team, side);

  return (
    p * weights.ppg +
    r * weights.winRate +
    gd * weights.gd +
    f * weights.form +
    v * weights.venue
  );
}

function h2hEffect(home, away, priorMatches, weights) {
  if (!weights.h2hScale) {
    return 0;
  }

  const recent = priorMatches
    .filter((match) => {
      const h = canonical(match.home);
      const a = canonical(match.away);

      return (
        (h === home && a === away) ||
        (h === away && a === home)
      );
    })
    .slice(-5);

  if (!recent.length) {
    return 0;
  }

  let homeWins = 0;
  let awayWins = 0;

  for (const match of recent) {
    const [homeGoals, awayGoals] =
      match.score.split("-").map(Number);

    const result = outcome(
      homeGoals,
      awayGoals
    );

    const actualHome = canonical(match.home);

    if (
      (actualHome === home && result === "1") ||
      (actualHome === away && result === "2")
    ) {
      homeWins++;
    }

    if (
      (actualHome === home && result === "2") ||
      (actualHome === away && result === "1")
    ) {
      awayWins++;
    }
  }

  return clamp(
    ((homeWins - awayWins) / recent.length) *
      0.025 *
      weights.h2hScale,
    -0.025,
    0.025
  );
}

function probabilities(
  home,
  away,
  h2h,
  weights
) {
  const difference =
    strength(home, "home", weights) -
    strength(away, "away", weights) +
    weights.homeAdvantage +
    h2h;

  const draw = clamp(
    weights.drawBase +
      (1 - Math.min(Math.abs(difference) * 2, 1)) *
        weights.drawRange,
    0.15,
    0.40
  );

  let homeProb = clamp(
    0.5 +
      difference * weights.directionScale,
    0.12,
    0.70
  );

  let awayProb = clamp(
    0.5 -
      difference * weights.directionScale,
    0.12,
    0.70
  );

  const remaining = 1 - draw;
  const total = homeProb + awayProb;

  return {
    "1": (homeProb / total) * remaining,
    "0": draw,
    "2": (awayProb / total) * remaining
  };
}

/*
 * JUDGE90 v2.1 baseline
 *
 * このバックテストでは、
 * 現在のモデルを基準として複数パターンを比較する。
 *
 * 重要：
 * このファイルから predict.mjs は変更しない。
 */
const VARIANTS = {
  baseline: {
    ppg: 0.25,
    winRate: 0.20,
    gd: 0.20,
    form: 0.15,
    venue: 0.20,
    homeAdvantage: 0.055,
    h2hScale: 1,
    drawBase: 0.24,
    drawRange: 0.12,
    directionScale: 0.55
  },

  noH2H: {
    ppg: 0.25,
    winRate: 0.20,
    gd: 0.20,
    form: 0.15,
    venue: 0.20,
    homeAdvantage: 0.055,
    h2hScale: 0,
    drawBase: 0.24,
    drawRange: 0.12,
    directionScale: 0.55
  },

  drawLower: {
    ppg: 0.25,
    winRate: 0.20,
    gd: 0.20,
    form: 0.15,
    venue: 0.20,
    homeAdvantage: 0.055,
    h2hScale: 1,
    drawBase: 0.22,
    drawRange: 0.10,
    directionScale: 0.55
  },

  drawMid: {
    ppg: 0.25,
    winRate: 0.20,
    gd: 0.20,
    form: 0.15,
    venue: 0.20,
    homeAdvantage: 0.055,
    h2hScale: 1,
    drawBase: 0.23,
    drawRange: 0.08,
    directionScale: 0.55
  },

  strongerDir: {
    ppg: 0.25,
    winRate: 0.20,
    gd: 0.20,
    form: 0.15,
    venue: 0.20,
    homeAdvantage: 0.055,
    h2hScale: 1,
    drawBase: 0.24,
    drawRange: 0.12,
    directionScale: 0.70
  },

  ppgHeavy: {
    ppg: 0.35,
    winRate: 0.15,
    gd: 0.20,
    form: 0.10,
    venue: 0.20,
    homeAdvantage: 0.055,
    h2hScale: 1,
    drawBase: 0.24,
    drawRange: 0.12,
    directionScale: 0.55
  },

  formHeavy: {
    ppg: 0.20,
    winRate: 0.15,
    gd: 0.20,
    form: 0.25,
    venue: 0.20,
    homeAdvantage: 0.055,
    h2hScale: 1,
    drawBase: 0.24,
    drawRange: 0.12,
    directionScale: 0.55
  },

  venueLower: {
    ppg: 0.30,
    winRate: 0.20,
    gd: 0.20,
    form: 0.15,
    venue: 0.15,
    homeAdvantage: 0.055,
    h2hScale: 1,
    drawBase: 0.24,
    drawRange: 0.12,
    directionScale: 0.55
  }
};

function emptyResult() {
  return {
    matches: 0,
    hits: 0,
    accuracy: 0,
    logLoss: 0,
    brier: 0,

    byOutcome: {
      "1": {
        n: 0,
        hit: 0,
        accuracy: 0
      },

      "0": {
        n: 0,
        hit: 0,
        accuracy: 0
      },

      "2": {
        n: 0,
        hit: 0,
        accuracy: 0
      }
    }
  };
}

function runBacktest(startIndex = 0) {
  const teams = new Map();

  const prior = [];

  const results = Object.fromEntries(
    Object.keys(VARIANTS).map((name) => [
      name,
      emptyResult()
    ])
  );

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];

    const [homeGoals, awayGoals] =
      match.score.split("-").map(Number);

    const actual = outcome(
      homeGoals,
      awayGoals
    );

    const home = getTeam(
      teams,
      match.league,
      match.home
    );

    const away = getTeam(
      teams,
      match.league,
      match.away
    );

    /*
     * 予測は試合結果をチーム成績へ追加する前に行う。
     *
     * これにより未来情報が混入しない
     * leakage-safe な walk-forward backtest になる。
     */
    if (i >= startIndex) {
      for (const [
        name,
        weights
      ] of Object.entries(VARIANTS)) {
        const h2h = h2hEffect(
          canonical(match.home),
          canonical(match.away),
          prior,
          weights
        );

        const probabilitiesResult =
          probabilities(
            home,
            away,
            h2h,
            weights
          );

        const prediction =
          Object.entries(
            probabilitiesResult
          ).sort(
            (a, b) => b[1] - a[1]
          )[0][0];

        const y = {
          "1": 0,
          "0": 0,
          "2": 0
        };

        y[actual] = 1;

        const result = results[name];

        result.matches++;

        if (prediction === actual) {
          result.hits++;
        }

        result.logLoss +=
          -Math.log(
            Math.max(
              probabilitiesResult[actual],
              1e-12
            )
          );

        result.brier +=
          Object.keys(y).reduce(
            (sum, key) =>
              sum +
              (
                probabilitiesResult[key] -
                y[key]
              ) ** 2,
            0
          );

        result.byOutcome[actual].n++;

        if (prediction === actual) {
          result.byOutcome[actual].hit++;
        }
      }
    }

    /*
     * 試合結果をチーム状態へ追加。
     * 次の試合から初めて利用可能になる。
     */
    const homeResult =
      actual === "1"
        ? "W"
        : actual === "0"
        ? "D"
        : "L";

    const awayResult =
      actual === "2"
        ? "W"
        : actual === "0"
        ? "D"
        : "L";

    addResult(
      home,
      homeResult,
      homeGoals,
      awayGoals,
      "home"
    );

    addResult(
      away,
      awayResult,
      awayGoals,
      homeGoals,
      "away"
    );

    prior.push(match);
  }

  for (const result of Object.values(results)) {
    result.accuracy =
      result.matches
        ? result.hits / result.matches
        : 0;

    result.logLoss =
      result.matches
        ? result.logLoss / result.matches
        : 0;

    result.brier =
      result.matches
        ? result.brier / result.matches
        : 0;

    for (const outcomeResult of Object.values(
      result.byOutcome
    )) {
      outcomeResult.accuracy =
        outcomeResult.n
          ? outcomeResult.hit /
            outcomeResult.n
          : 0;
    }
  }

  return results;
}

/*
 * テスト区間
 *
 * all:
 *   全期間
 *
 * second_half:
 *   データ後半
 *
 * final_30pct:
 *   最後の30%
 *
 * 特に final_30pct を重視する。
 * 過去全体に合わせすぎたモデルより、
 * 最近の未知データで強いモデルを優先するため。
 */
const half = Math.floor(
  matches.length / 2
);

const late = Math.floor(
  matches.length * 0.70
);

const output = {
  generated_at:
    new Date().toISOString(),

  source: INPUT,

  methodology: {
    type: "walk-forward",
    leakage_safe: true,

    note:
      "各試合の予測時点より後の結果をチーム成績・H2Hに使用しない。2026シーズンの完了済みJ1/J2/J3リーグ戦を対象。",

    interpretation:
      "accuracyだけでなくLogLossとBrierも比較し、単純な的中率の偶然を避ける。"
  },

  coverage: {
    completed_matches:
      matches.length,

    first_date:
      matches[0]?.date ?? null,

    last_date:
      matches.at(-1)?.date ?? null,

    test_from_half:
      matches[half]?.date ?? null,

    test_from_70pct:
      matches[late]?.date ?? null
  },

  results: {
    all: runBacktest(0),

    second_half:
      runBacktest(half),

    final_30pct:
      runBacktest(late)
  },

  variants: VARIANTS,

  model_change:
    "このファイルは検証のみ。自動でpredict.mjsを変更しない。"
};

mkdirSync(
  "data",
  { recursive: true }
);

writeFileSync(
  OUTPUT,
  JSON.stringify(
    output,
    null,
    2
  ),
  "utf8"
);

console.log(
  "=============================="
);

console.log(
  "JUDGE90 WALK-FORWARD BACKTEST"
);

console.log(
  "=============================="
);

console.log(
  `Completed matches: ${matches.length}`
);

console.log(
  `Period: ${
    matches[0]?.date ?? "-"
  } -> ${
    matches.at(-1)?.date ?? "-"
  }`
);

console.log("");

for (const [
  name,
  result
] of Object.entries(
  output.results.all
)) {
  console.log(
    `${name.padEnd(14)} ` +
      `accuracy=${(
        result.accuracy * 100
      ).toFixed(1)}%  ` +
      `logloss=${result.logLoss.toFixed(
        3
      )}  ` +
      `brier=${result.brier.toFixed(3)}`
  );
}

console.log("");

console.log(
  `Wrote ${OUTPUT}`
);
