import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const TOTO_FILE = "data/toto_matches.json";
const OUTPUT_FILE = "data/h2h.json";
const BASE_URL = "https://data.j-league.or.jp/SFMS01/search";

const toto = JSON.parse(
  readFileSync(TOTO_FILE, "utf8")
);

const aliases = {
  "水戸ホーリーホック": "水戸",
  "川崎フロンターレ": "川崎Ｆ",
  "清水エスパルス": "清水",
  "アビスパ福岡": "福岡",
  "ガンバ大阪": "Ｇ大阪",
  "ＦＣ東京": "FC東京",
  "FC東京": "FC東京",
  "ＦＣ町田ゼルビア": "町田",
  "町田": "町田",
  "横浜Ｆ・マリノス": "横浜FM",
  "横浜F・マリノス": "横浜FM",
  "Ｖ・ファーレン長崎": "長崎",
  "名古屋グランパス": "名古屋",
  "サンフレッチェ広島": "広島",
  "セレッソ大阪": "Ｃ大阪",
  "東京ヴェルディ": "東京Ｖ",
  "ジェフユナイテッド千葉": "千葉",
  "ジェフ千葉": "千葉",
  "浦和レッズ": "浦和",
  "ファジアーノ岡山": "岡山",
  "ＦＣ今治": "今治",
  "FC今治": "今治",
  "サガン鳥栖": "鳥栖",
  "いわきＦＣ": "いわき",
  "いわきFC": "いわき",
  "横浜ＦＣ": "横浜FC",
  "ヴァンラーレ八戸": "八戸",
  "湘南ベルマーレ": "湘南",
  "ヴァンフォーレ甲府": "甲府",
  "ジュビロ磐田": "磐田",
  "ブラウブリッツ秋田": "秋田",
  "徳島ヴォルティス": "徳島"
};

function normalize(name) {
  return aliases[name] || name;
}

function text(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRows(html) {
  const rows = [];

  for (const row of html.matchAll(
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  )) {
    const cells = [
      ...row[1].matchAll(
        /<td[^>]*>([\s\S]*?)<\/td>/gi
      )
    ].map(x => text(x[1]));

    if (cells.length < 8) continue;

    const [
      season,
      competition,
      section,
      dateText,
      kickoff,
      home,
      score,
      away,
      stadium
    ] = cells;

    if (!home || !away || !score) continue;

    const scoreMatch =
      score.match(/^(\d+)\s*-\s*(\d+)/);

    if (!scoreMatch) continue;

    const dateMatch =
      dateText.match(/(\d{2})\/(\d{2})\/(\d{2})/);

    if (!dateMatch) continue;

    const [, yy, mm, dd] = dateMatch;

    const competitionName = competition || "";

    if (
      !/Ｊ１|Ｊ２|Ｊ３|J1|J2|J3|ルヴァン|リーグカップ|ヤマザキ/
        .test(competitionName)
    ) {
      continue;
    }

    rows.push({
      date: `20${yy}-${mm}-${dd}`,
      competition: competitionName,
      home: normalize(home),
      away: normalize(away),
      homeGoals: Number(scoreMatch[1]),
      awayGoals: Number(scoreMatch[2])
    });
  }

  return rows;
}

async function fetchYear(frame, year) {
  const url =
    `${BASE_URL}?competition_frame_ids=${frame}` +
    `&competition_years=${year}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return parseRows(
    await response.text()
  );
}

function result(team, match) {
  if (match.home === team) {
    if (match.homeGoals > match.awayGoals) return "W";
    if (match.homeGoals < match.awayGoals) return "L";
    return "D";
  }

  if (match.away === team) {
    if (match.awayGoals > match.homeGoals) return "W";
    if (match.awayGoals < match.homeGoals) return "L";
    return "D";
  }

  return null;
}

function summarize(home, away, allMatches) {
  const matches = allMatches
    .filter(m =>
      (m.home === home && m.away === away) ||
      (m.home === away && m.away === home)
    )
    .sort((a, b) =>
      b.date.localeCompare(a.date)
    );

  const recent = matches.slice(0, 5);

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let homeGoals = 0;
  let awayGoals = 0;

  for (const m of recent) {
    const r = result(home, m);

    if (r === "W") homeWins++;
    if (r === "D") draws++;
    if (r === "L") awayWins++;

    if (m.home === home) {
      homeGoals += m.homeGoals;
      awayGoals += m.awayGoals;
    } else {
      homeGoals += m.awayGoals;
      awayGoals += m.homeGoals;
    }
  }

  let advantage = "neutral";

  if (homeWins > awayWins) {
    advantage = "HOME_ADVANTAGE";
  } else if (awayWins > homeWins) {
    advantage = "AWAY_ADVANTAGE";
  }

  return {
    available: recent.length > 0,

    recent5: {
      matches: recent.length,
      home_wins: homeWins,
      draws,
      away_wins: awayWins,
      home_goals: homeGoals,
      away_goals: awayGoals,
      advantage
    },

    all_time: {
      matches: matches.length
    },

    effect: 0
  };
}

async function main() {
  console.log("");
  console.log("==============================");
  console.log("JUDGE90 H2H FETCH");
  console.log("==============================");

  const teams = [
    ...new Set(
      toto.matches.flatMap(m => [
        normalize(m.home),
        normalize(m.away)
      ])
    )
  ];

  console.log(
    `対象チーム: ${teams.length}`
  );

  const allMatches = [];

  /*
   * J.League Data Siteから
   * 2004〜2026年のJ1/J2/J3を取得。
   */
  for (const frame of [1, 2, 3]) {
    for (let year = 2004; year <= 2026; year++) {
      try {
        const matches =
          await fetchYear(frame, year);

        allMatches.push(...matches);

        console.log(
          `frame ${frame} / ${year}: ${matches.length}`
        );
      } catch (error) {
        console.log(
          `SKIP ${frame}/${year}: ${error.message}`
        );
      }
    }
  }

  /*
   * 同一試合を重複排除。
   */
  const unique = new Map();

  for (const m of allMatches) {
    const key =
      `${m.date}|${m.home}|${m.away}|` +
      `${m.homeGoals}-${m.awayGoals}`;

    unique.set(key, m);
  }

  const historical =
    [...unique.values()];

  console.log("");
  console.log(
    `取得した過去試合: ${historical.length}`
  );

  const matches =
    toto.matches.map(m => {
      const home = normalize(m.home);
      const away = normalize(m.away);

      const h2h =
        summarize(
          home,
          away,
          historical
        );

      return {
        number: m.number,
        home,
        away,
        h2h
      };
    });

  const available =
    matches.filter(
      m => m.h2h.available
    ).length;

  const output = {
    season: "2026/27",
    generated_at:
      new Date().toISOString(),
    source:
      "J.League Data Site",
    historical_range:
      "2004-2026",
    matches
  };

  mkdirSync(
    "data",
    { recursive: true }
  );

  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log("==============================");
  console.log("JUDGE90 H2H RESULT");
  console.log("==============================");

  for (const m of matches) {
    const h = m.h2h.recent5;

    console.log(
      `${m.number}. ${m.home} vs ${m.away}`
    );

    console.log(
      `   直近5: ${h.home_wins}-` +
      `${h.draws}-${h.away_wins}`
    );

    console.log(
      `   available: ${m.h2h.available}`
    );
  }

  console.log("");
  console.log(
    `H2H available: ${available}/13`
  );
  console.log(
    `Saved: ${OUTPUT_FILE}`
  );

  if (available === 0) {
    throw new Error(
      "H2Hを1件も取得できませんでした。"
    );
  }
}

main().catch(error => {
  console.error("");
  console.error("H2H FETCH ERROR");
  console.error(error);
  process.exit(1);
});
