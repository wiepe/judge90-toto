import { readFileSync, writeFileSync } from "node:fs";

const predictionsPath = "predictions.json";
const outputPath = "recommendation.json";

// ----------------------------------------
// 設定
// ----------------------------------------

const BUDGET = Number(
  process.env.JUDGE90_BUDGET || 1000
);

const predictionsData = JSON.parse(
  readFileSync(predictionsPath, "utf8")
);

const matches = predictionsData.matches || [];

// totoは1通り100円
const UNIT_PRICE = 100;

// ----------------------------------------
// 基本関数
// ----------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getSortedOutcomes(probabilities) {
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1]);
}

function getTopOutcome(probabilities) {
  return getSortedOutcomes(probabilities)[0][0];
}

function getSecondOutcome(probabilities) {
  return getSortedOutcomes(probabilities)[1][0];
}

function getThirdOutcome(probabilities) {
  return getSortedOutcomes(probabilities)[2][0];
}

// ----------------------------------------
// 不確実性スコア
//
// 高いほど「ダブル・トリプルを検討すべき」
// ----------------------------------------

function calculateUncertainty(match) {
  const probabilities = match.probabilities;

  const sorted =
    getSortedOutcomes(probabilities);

  const first = sorted[0][1];
  const second = sorted[1][1];
  const third = sorted[2][1];

  const margin = first - second;

  // エントロピー
  let entropy = 0;

  for (const value of Object.values(probabilities)) {
    if (value > 0) {
      entropy -= value * Math.log2(value);
    }
  }

  const normalizedEntropy =
    entropy / Math.log2(3);

  // 1位と2位が近いほど危険
  const closeness =
    1 - clamp(margin / 0.35, 0, 1);

  // 3択が均等ならさらに危険
  const balance =
    1 - clamp(
      (first - third) / 0.45,
      0,
      1
    );

  const score =
    normalizedEntropy * 0.45 +
    closeness * 0.40 +
    balance * 0.15;

  return {
    score,
    margin,
    entropy: normalizedEntropy
  };
}

// ----------------------------------------
// ダブル候補の評価
//
// 「2つ選ぶことでどれだけ確率を拾えるか」
// ----------------------------------------

function evaluateDouble(match) {
  const probabilities =
    match.probabilities;

  const sorted =
    getSortedOutcomes(probabilities);

  const first = sorted[0];
  const second = sorted[1];

  const coverage =
    first[1] + second[1];

  const uncertainty =
    calculateUncertainty(match);

  // 追加する2択目の価値
  const gain = second[1];

  // 不確実な試合ほどダブル優先
  const value =
    gain * 0.60 +
    uncertainty.score * 0.40;

  return {
    outcomes: [
      first[0],
      second[0]
    ],

    coverage,

    added_probability: gain,

    uncertainty_score:
      uncertainty.score,

    value
  };
}

// ----------------------------------------
// トリプル候補
// ----------------------------------------

function evaluateTriple(match) {
  const probabilities =
    match.probabilities;

  const coverage =
    Object.values(probabilities)
      .reduce(
        (sum, value) => sum + value,
        0
      );

  const uncertainty =
    calculateUncertainty(match);

  return {
    outcomes: ["1", "0", "2"],

    coverage,

    uncertainty_score:
      uncertainty.score,

    value:
      uncertainty.score
  };
}

// ----------------------------------------
// 予算内で最も効率の良い構成を探す
//
// ダブル1個 = 2通り
// トリプル1個 = 3通り
//
// 例:
// ダブル3個
// → 2 × 2 × 2 = 8通り
// → 800円
// ----------------------------------------

function findBestPortfolio(matches) {
  const candidates = [];

  for (const match of matches) {
    const double =
      evaluateDouble(match);

    const triple =
      evaluateTriple(match);

    candidates.push({
      number: match.number,
      double,
      triple
    });
  }

  let best = null;

  // 最大13試合
  // ダブル・トリプルの組み合わせを探索
  //
  // 2^13 = 8192
  // 十分軽いので総当たりする
  const totalPatterns =
    Math.pow(3, matches.length);

  for (
    let pattern = 0;
    pattern < totalPatterns;
    pattern++
  ) {
    let temp = pattern;

    let combinations = 1;
    let score = 0;

    const selections = [];

    let valid = true;

    for (const candidate of candidates) {
      const state = temp % 3;
      temp = Math.floor(temp / 3);

      let type = "single";
      let evaluation = null;

      if (state === 1) {
        type = "double";

        evaluation =
          candidate.double;

        combinations *= 2;
      }

      if (state === 2) {
        type = "triple";

        evaluation =
          candidate.triple;

        combinations *= 3;
      }

      selections.push({
        number: candidate.number,
        type
      });

      if (evaluation) {
        score += evaluation.value;
      }

      if (
        combinations * UNIT_PRICE >
        BUDGET
      ) {
        valid = false;
        break;
      }
    }

    if (!valid) {
      continue;
    }

    const cost =
      combinations * UNIT_PRICE;

    if (cost > BUDGET) {
      continue;
    }

    // 同点なら安い方を優先
    if (
      !best ||
      score > best.score ||
      (
        score === best.score &&
        cost < best.cost
      )
    ) {
      best = {
        score,
        cost,
        combinations,
        selections
      };
    }
  }

  return best;
}

// ----------------------------------------
// 推奨タイプ
// ----------------------------------------

function getStrategyType(
  selections,
  matches
) {
  const doubles =
    selections.filter(
      item => item.type === "double"
    ).length;

  const triples =
    selections.filter(
      item => item.type === "triple"
    ).length;

  const uncertain =
    matches.filter(match => {
      return calculateUncertainty(match)
        .score >= 0.60;
    }).length;

  if (triples >= 1) {
    return "波乱対応型";
  }

  if (
    doubles >= 4 ||
    uncertain >= 5
  ) {
    return "分散型";
  }

  if (doubles >= 2) {
    return "堅実型";
  }

  return "一点集中型";
}

// ----------------------------------------
// 各試合の推奨
// ----------------------------------------

function buildMatchRecommendation(
  match,
  selection
) {
  const probabilities =
    match.probabilities;

  const sorted =
    getSortedOutcomes(probabilities);

  const uncertainty =
    calculateUncertainty(match);

  let coverage = [
    sorted[0][0]
  ];

  if (selection.type === "double") {
    coverage = [
      sorted[0][0],
      sorted[1][0]
    ];
  }

  if (selection.type === "triple") {
    coverage = [
      "1",
      "0",
      "2"
    ];
  }

  return {
    number: match.number,

    home: match.home,

    away: match.away,

    league: match.league,

    recommendation: coverage,

    type: selection.type,

    probability_coverage:
      Number(
        coverage
          .reduce(
            (sum, outcome) =>
              sum +
              probabilities[outcome],
            0
          )
          .toFixed(3)
      ),

    confidence:
      match.confidence,

    uncertainty:
      match.uncertainty,

    uncertainty_score:
      Number(
        uncertainty.score
          .toFixed(3)
      )
  };
}

// ----------------------------------------
// 予測が13試合あるか確認
// ----------------------------------------

if (matches.length === 0) {
  throw new Error(
    "predictions.json に予測データがありません。"
  );
}

if (matches.length !== 13) {
  throw new Error(
    `totoは13試合必要です。現在 ${matches.length} 試合です。`
  );
}

// ----------------------------------------
// ポートフォリオ決定
// ----------------------------------------

const portfolio =
  findBestPortfolio(matches);

if (!portfolio) {
  throw new Error(
    `予算 ${BUDGET}円以内で購入パターンを作成できませんでした。`
  );
}

// ----------------------------------------
// 各試合の推奨を作成
// ----------------------------------------

const recommendations =
  matches.map(match => {
    const selection =
      portfolio.selections.find(
        item =>
          item.number === match.number
      );

    return buildMatchRecommendation(
      match,
      selection
    );
  });

// ----------------------------------------
// ダブル・トリプル一覧
// ----------------------------------------

const doubles =
  recommendations.filter(
    match => match.type === "double"
  );

const triples =
  recommendations.filter(
    match => match.type === "triple"
  );

const singles =
  recommendations.filter(
    match => match.type === "single"
  );

// ----------------------------------------
// サマリー
// ----------------------------------------

const strategyType =
  getStrategyType(
    portfolio.selections,
    matches
  );

const output = {
  generated_at:
    new Date().toISOString(),

  engine:
    "JUDGE 90 Betting Strategy Engine",

  version:
    "2.0",

  budget: BUDGET,

  unit_price: UNIT_PRICE,

  summary: {
    matches: matches.length,

    combinations:
      portfolio.combinations,

    price:
      portfolio.cost,

    strategy:
      strategyType,

    singles:
      singles.length,

    doubles:
      doubles.length,

    triples:
      triples.length
  },

  strategy: {
    description:
      "予測確率と不確実性をもとに、限られた購入金額を不確実な試合へ配分する",

    priority:
      "不確実性の高い試合を優先してダブル・トリプル化"
  },

  matches:
    recommendations
};

// ----------------------------------------
// 保存
// ----------------------------------------

writeFileSync(
  outputPath,
  JSON.stringify(
    output,
    null,
    2
  ),
  "utf8"
);

// ----------------------------------------
// ログ
// ----------------------------------------

console.log("");

console.log(
  "=============================="
);

console.log(
  "JUDGE90 BETTING STRATEGY"
);

console.log(
  "=============================="
);

console.log(
  `Budget: ${BUDGET}円`
);

console.log(
  `Combinations: ${portfolio.combinations}`
);

console.log(
  `Price: ${portfolio.cost}円`
);

console.log(
  `Strategy: ${strategyType}`
);

console.log("");

for (const recommendation of recommendations) {
  console.log(
    `${recommendation.number}. ` +
    `${recommendation.home} vs ` +
    `${recommendation.away}`
  );

  console.log(
    `   ${recommendation.type}: ` +
    recommendation.recommendation.join("/")
  );

  console.log(
    `   coverage=${formatPercent(
      recommendation.probability_coverage
    )}`
  );
}

console.log("");

console.log(
  `Doubles: ${doubles.length}`
);

console.log(
  `Triples: ${triples.length}`
);

console.log("");

console.log(
  `Saved: ${outputPath}`
);
