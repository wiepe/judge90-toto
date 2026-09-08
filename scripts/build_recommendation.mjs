import fs from "fs";

const predictions = JSON.parse(
  fs.readFileSync("predictions.json", "utf8")
);

const matches = predictions.matches;

// -----------------------------
// 基本設定
// -----------------------------

const BET_PRICE = 100;

// 最大予算ごとの戦略
const STRATEGIES = {
  safe: {
    name: "堅実型",
    description: "高信頼度の本命を中心に購入",
    doubles: 2,
    triples: 0
  },

  balance: {
    name: "バランス型",
    description: "不確実な試合を重点的にカバー",
    doubles: 4,
    triples: 0
  },

  aggressive: {
    name: "攻め型",
    description: "波乱試合まで広くカバー",
    doubles: 3,
    triples: 1
  }
};

// -----------------------------
// 確率から順位付け
// -----------------------------

function getProbabilities(match) {

  return [
    { mark: "1", probability: match.probabilities.home },
    { mark: "0", probability: match.probabilities.draw },
    { mark: "2", probability: match.probabilities.away }
  ].sort((a, b) => b.probability - a.probability);

}

// -----------------------------
// 戦略ごとの買い目生成
// -----------------------------

function buildStrategy(type) {

  const strategy = STRATEGIES[type];

  // 信頼度が低い試合から優先
  const uncertainMatches = [...matches]
    .sort((a, b) => a.confidence - b.confidence);

  const tripleNumbers = uncertainMatches
    .slice(0, strategy.triples)
    .map(m => m.number);

  const remaining = uncertainMatches
    .filter(m => !tripleNumbers.includes(m.number));

  const doubleNumbers = remaining
    .slice(0, strategy.doubles)
    .map(m => m.number);

  const selections = matches.map(match => {

    const ranked = getProbabilities(match);

    let picks = [ranked[0].mark];
    let recommendation = "single";

    if (tripleNumbers.includes(match.number)) {

      picks = ["1", "0", "2"];
      recommendation = "triple";

    } else if (doubleNumbers.includes(match.number)) {

      picks = [
        ranked[0].mark,
        ranked[1].mark
      ];

      recommendation = "double";

    }

    return {
      number: match.number,
      home: match.home,
      away: match.away,
      selections: picks,
      confidence: match.confidence,
      recommendation,
      upset: match.upset,
      probabilities: ranked
    };

  });

  // 組み合わせ数計算
  const combinations = selections.reduce(
    (total, match) => total * match.selections.length,
    1
  );

  return {
    type,
    name: strategy.name,
    description: strategy.description,
    combinations,
    price: combinations * BET_PRICE,
    selections
  };

}

// -----------------------------
// 全戦略生成
// -----------------------------

const strategies = {
  safe: buildStrategy("safe"),
  balance: buildStrategy("balance"),
  aggressive: buildStrategy("aggressive")
};

// -----------------------------
// メインおすすめ戦略
// -----------------------------

const mainStrategy = strategies.balance;

// -----------------------------
// 信頼度ランキング
// -----------------------------

const confidenceRanking = [...matches]
  .sort((a, b) => b.confidence - a.confidence)
  .map((match, index) => ({
    rank: index + 1,
    number: match.number,
    match: `${match.home} vs ${match.away}`,
    confidence: match.confidence
  }));

// -----------------------------
// JSON生成
// -----------------------------

const recommendation = {
  generated_at: new Date().toISOString(),

  engine: {
    name: "JUDGE 90 Betting Strategy Engine",
    version: "2.0"
  },

  toto: predictions.toto,

  summary: {
    matches: matches.length,

    main_strategy: mainStrategy.name,

    combinations: mainStrategy.combinations,

    price: mainStrategy.price,

    strategy: mainStrategy.description
  },

  strategies,

  selections: mainStrategy.selections,

  confidence_ranking: confidenceRanking
};

// -----------------------------
// ファイル出力
// -----------------------------

fs.writeFileSync(
  "recommendation.json",
  JSON.stringify(recommendation, null, 2)
);

console.log("JUDGE 90 recommendation generated");

console.log(
  `Main strategy: ${mainStrategy.name}`
);

console.log(
  `Combinations: ${mainStrategy.combinations}`
);

console.log(
  `Price: ¥${mainStrategy.price}`
);
