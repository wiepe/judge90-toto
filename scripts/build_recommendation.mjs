
import fs from "node:fs";

// =================================
// JUDGE 90 Betting Strategy Engine v1
// =================================

// 予測結果を読み込む
const predictionData = JSON.parse(
  fs.readFileSync("predictions.json", "utf8")
);


// =================================
// 各試合の買い目候補を作る
// =================================

function buildSelection(match) {

  const outcomes = [
    {
      mark: "1",
      probability: match.probabilities.home
    },
    {
      mark: "0",
      probability: match.probabilities.draw
    },
    {
      mark: "2",
      probability: match.probabilities.away
    }
  ];

  // 確率が高い順
  outcomes.sort(
    (a, b) => b.probability - a.probability
  );

  // 基本は予測エンジンのrecommendationを採用
  let selectionCount = 1;

  if (match.recommendation === "double") {
    selectionCount = 2;
  }

  if (match.recommendation === "triple") {
    selectionCount = 3;
  }


  const selections =
    outcomes
      .slice(0, selectionCount)
      .map(item => item.mark);


  return {
    number: match.number,
    home: match.home,
    away: match.away,

    selections,

    confidence: match.confidence,

    recommendation: match.recommendation,

    upset: match.upset,

    probabilities: outcomes
  };
}


// =================================
// 全試合の買い目生成
// =================================

const selections =
  predictionData.matches.map(
    buildSelection
  );


// =================================
// 購入口数計算
// =================================

function calculateCombinations(items) {

  return items.reduce(
    (total, item) =>
      total * item.selections.length,
    1
  );
}


const combinations =
  calculateCombinations(selections);

const price =
  combinations * 100;


// =================================
// 信頼度ランキング
// =================================

const confidenceRanking =
  [...selections]
    .sort(
      (a, b) =>
        b.confidence - a.confidence
    )
    .map((item, index) => ({
      rank: index + 1,
      number: item.number,
      match:
        `${item.home} vs ${item.away}`,
      confidence: item.confidence
    }));


// =================================
// 戦略判定
// =================================

let strategy;

if (combinations <= 16) {

  strategy =
    "堅実型：高信頼度の本命を中心に購入";

}

else if (combinations <= 64) {

  strategy =
    "バランス型：不確実な試合をダブルでカバー";

}

else {

  strategy =
    "波乱対応型：複数の結果を広くカバー";

}


// =================================
// recommendation.json生成
// =================================

const output = {

  generated_at:
    new Date().toISOString(),

  engine: {
    name:
      "JUDGE 90 Betting Strategy Engine",

    version:
      "1.0"
  },

  toto: predictionData.toto,

  summary: {

    matches:
      selections.length,

    combinations,

    price,

    strategy
  },

  selections,

  confidence_ranking:
    confidenceRanking
};


fs.writeFileSync(
  "recommendation.json",

  JSON.stringify(
    output,
    null,
    2
  )
);


console.log(
  `Generated recommendation: ${combinations} combinations / ¥${price}`
);
