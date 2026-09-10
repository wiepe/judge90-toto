
import { writeFileSync, mkdirSync } from "node:fs";

const url =
  "https://store.toto-dream.com/dcs/subos/screen/ps01/spsl000/PGSPSL00001InitTotoSingle.form";

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRows(html) {
  const rows = [];

  const rowMatches = html.matchAll(
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  );

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];

    const text = stripTags(rowHtml);

    const match = text.match(
      /(09\/\d{2}|10\/\d{2}|11\/\d{2}|12\/\d{2}|01\/\d{2}|02\/\d{2})\s+(.+?)\s+vs\s+(.+?)(?:\s|$)/
    );

    if (!match) {
      continue;
    }

    const [, date, home, away] = match;

    rows.push({
      date,
      home: home.trim(),
      away: away.trim()
    });
  }

  return rows;
}

function normalizeTeamName(name) {
  const map = {
    "水戸": "水戸ホーリーホック",
    "川崎Ｆ": "川崎フロンターレ",
    "清水": "清水エスパルス",
    "福岡": "アビスパ福岡",
    "Ｇ大阪": "ガンバ大阪",
    "FC東京": "ＦＣ東京",
    "町田": "ＦＣ町田ゼルビア",
    "横浜FM": "横浜Ｆ・マリノス",
    "長崎": "Ｖ・ファーレン長崎",
    "名古屋": "名古屋グランパス",
    "広島": "サンフレッチェ広島",
    "Ｃ大阪": "セレッソ大阪",
    "東京Ｖ": "東京ヴェルディ",
    "千葉": "ジェフユナイテッド千葉",
    "浦和": "浦和レッズ",
    "岡山": "ファジアーノ岡山",
    "今治": "ＦＣ今治",
    "鳥栖": "サガン鳥栖",
    "いわき": "いわきＦＣ",
    "横浜FC": "横浜ＦＣ",
    "八戸": "ヴァンラーレ八戸",
    "湘南": "湘南ベルマーレ",
    "甲府": "ヴァンフォーレ甲府",
    "磐田": "ジュビロ磐田",
    "秋田": "ブラウブリッツ秋田",
    "徳島": "徳島ヴォルティス"
  };

  return map[name] || name;
}

function detectLeague(home, away) {
  const j1Teams = [
    "水戸ホーリーホック",
    "川崎フロンターレ",
    "清水エスパルス",
    "アビスパ福岡",
    "ガンバ大阪",
    "ＦＣ東京",
    "ＦＣ町田ゼルビア",
    "横浜Ｆ・マリノス",
    "Ｖ・ファーレン長崎",
    "名古屋グランパス",
    "サンフレッチェ広島",
    "セレッソ大阪",
    "浦和レッズ"
  ];

  if (
    j1Teams.includes(home) ||
    j1Teams.includes(away)
  ) {
    return "J1";
  }

  return "J2";
}

async function main() {
  console.log("Fetching official toto data...");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ERROR: ${response.status}`);
  }

  const html = await response.text();

  console.log("HTML LENGTH:", html.length);

  const rows = parseRows(html);

  console.log("RAW MATCHES FOUND:", rows.length);

  if (rows.length < 13) {
    throw new Error(
      `13試合を取得できませんでした。取得件数: ${rows.length}`
    );
  }

  const matches = rows
    .slice(0, 13)
    .map((match, index) => {
      const home = normalizeTeamName(match.home);
      const away = normalizeTeamName(match.away);

      return {
        number: index + 1,
        date: match.date,
        home,
        away,
        league: detectLeague(home, away)
      };
    });

  const output = {
    source: "official_toto",
    source_url: url,
    fetched_at: new Date().toISOString(),
    matches
  };

  mkdirSync("data", { recursive: true });

  writeFileSync(
    "data/toto_matches.json",
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log("");
  console.log("==============================");
  console.log("JUDGE90 TOTO DATA");
  console.log("==============================");

  for (const match of matches) {
    console.log(
      `${match.number}. ${match.home} vs ${match.away}`
    );
  }

  console.log("");
  console.log("Saved: data/toto_matches.json");
}

main().catch(error => {
  console.error("");
  console.error("TOTO FETCH ERROR");
  console.error(error);
  process.exit(1);
});
