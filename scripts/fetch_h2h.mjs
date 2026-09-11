import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const totoPath = "data/toto_matches.json";
const outputPath = "data/h2h.json";

const SEARCH_URL =
  "https://data.j-league.or.jp/SFMS01/search";

const toto =
  JSON.parse(
    readFileSync(totoPath, "utf8")
  );

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

function parseScore(score) {
  if (!score) return null;

  const match =
    score.match(/^(\d+)\s*-\s*(\d+)/);

  if (!match) return null;

  return {
    homeGoals: Number(match[1]),
    awayGoals: Number(match[2])
  };
}

function normalizeName(name) {

  const map = {
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

  return map[name] || name;
}


function parseRows(html) {

  const rows = [];

  const rowMatches =
    html.matchAll(
      /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    );

  for (const rowMatch of rowMatches) {

    const rowHtml =
      rowMatch[1];

    const cells = [
      ...rowHtml.matchAll(
        /<td[^>]*>([\s\S]*?)<\/td>/gi
      )
    ].map(
      match =>
        stripTags(match[1])
    );

    if (cells.length < 8) {
      continue;
    }

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

    if (!home || !away) {
      continue;
    }

    if (score === "vs") {
      continue;
    }

    const parsedScore =
      parseScore(score);

    if (!parsedScore) {
      continue;
    }

    const dateMatch =
      dateText.match(
        /(\d{2})\/(\d{2})\/(\d{2})/
      );

    if (!dateMatch) {
      continue;
    }

    const [
      ,
      yy,
      mm,
      dd
    ] = dateMatch;

    const date =
      `20${yy}-${mm}-${dd}`;

    /*
      H2H対象：
      J1/J2/J3リーグ戦
      ルヴァンカップ等のリーグカップ

      天皇杯などは除外。
    */

    const competitionText =
      competition || "";

    const isLeague =
      /Ｊ１|Ｊ２|Ｊ３|J1|J2|J3/.test(
        competitionText
      );

    const isLeagueCup =
      /ルヴァン|リーグカップ/.test(
        competitionText
      );

    if (
      !isLeague &&
      !isLeagueCup
    ) {
      continue;
    }

    rows.push({
      season,
      competition,
      date,
      kickoff,
      home:
        normalizeName(home),
      away:
        normalizeName(away),
      score,
      stadium,
      homeGoals:
        parsedScore.homeGoals,
      awayGoals:
        parsedScore.awayGoals
    });
  }

  return rows;
}


async function fetchTeamMatches(team) {

  console.log(
    `Fetching historical matches: ${team}`
  );

  /*
    まず検索フォームから
    チームIDを取得する。
  */

  const searchPage =
    await fetch(
      SEARCH_URL
    );

  if (!searchPage.ok) {
    throw new Error(
      `Search page HTTP ERROR: ${searchPage.status}`
    );
  }

  const searchHtml =
    await searchPage.text();

  /*
    チーム選択欄から
    チーム名とIDを探す。
  */

  const optionMatches =
    searchHtml.matchAll(
      /<option[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi
    );

  let teamId = null;

  for (
    const match of optionMatches
  ) {

    const value =
      match[1];

    const label =
      stripTags(match[2]);

    if (
      normalizeName(label) === team
    ) {

      teamId = value;

      break;
    }
  }

  if (!teamId) {

    throw new Error(
      `TEAM ID NOT FOUND: ${team}`
    );

  }

  const url =
    `${SEARCH_URL}?team_ids=${encodeURIComponent(teamId)}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${team} HTTP ERROR: ${response.status}`
    );
  }

  const html =
    await response.text();

  return parseRows(html);
}


function resultForTeam(
  team,
  match
) {

  if (
    match.home === team
  ) {

    if (
      match.homeGoals >
      match.awayGoals
    ) {
      return "W";
    }

    if (
      match.homeGoals <
      match.awayGoals
    ) {
      return "L";
    }

    return "D";
  }


  if (
    match.away === team
  ) {

    if (
      match.awayGoals >
      match.homeGoals
    ) {
      return "W";
    }

    if (
      match.awayGoals <
      match.homeGoals
    ) {
      return "L";
    }

    return "D";
  }

  return null;
}


function summarize(
  teamA,
  teamB,
  matches
) {

  const h2h =
    matches
      .filter(match =>
        (
          match.home === teamA &&
          match.away === teamB
        ) ||
        (
          match.home === teamB &&
          match.away === teamA
        )
      )
      .sort(
        (a,b) =>
          b.date.localeCompare(a.date)
      );

  const recent =
    h2h.slice(0,5);

  const recentStats = {
    matches: recent.length,
    teamA_wins: 0,
    draws: 0,
    teamB_wins: 0,
    teamA_goals: 0,
    teamB_goals: 0
  };


  for (
    const match of recent
  ) {

    const result =
      resultForTeam(
        teamA,
        match
      );

    if (result === "W") {
      recentStats.teamA_wins++;
    }

    if (result === "D") {
      recentStats.draws++;
    }

    if (result === "L") {
      recentStats.teamB_wins++;
    }

    if (
      match.home === teamA
    ) {

      recentStats.teamA_goals +=
        match.homeGoals;

      recentStats.teamB_goals +=
        match.awayGoals;

    } else {

      recentStats.teamA_goals +=
        match.awayGoals;

      recentStats.teamB_goals +=
        match.homeGoals;

    }

  }


  const allStats = {
    matches: h2h.length,
    teamA_wins: 0,
    draws: 0,
    teamB_wins: 0
  };


  for (
    const match of h2h
  ) {

    const result =
      resultForTeam(
        teamA,
        match
      );

    if (result === "W") {
      allStats.teamA_wins++;
    }

    if (result === "D") {
      allStats.draws++;
    }

    if (result === "L") {
      allStats.teamB_wins++;
    }

  }


  let recentAdvantage =
    "neutral";

  if (
    recentStats.teamA_wins >
    recentStats.teamB_wins
  ) {
    recentAdvantage =
      teamA;
  }

  if (
    recentStats.teamB_wins >
    recentStats.teamA_wins
  ) {
    recentAdvantage =
      teamB;
  }


  let overallAdvantage =
    "neutral";

  if (
    allStats.teamA_wins >
    allStats.teamB_wins
  ) {
    overallAdvantage =
      teamA;
  }

  if (
    allStats.teamB_wins >
    allStats.teamA_wins
  ) {
    overallAdvantage =
      teamB;
  }


  return {
    teamA,
    teamB,

    recent5: {
      matches:
        recent.map(match => ({
          date:
            match.date,
          competition:
            match.competition,
          home:
            match.home,
          away:
            match.away,
          score:
            match.score
        })),

      stats:
        recentStats,

      advantage:
        recentAdvantage
    },

    all_time: {
      stats:
        allStats,

      advantage:
        overallAdvantage
    },

    data_source:
      "J.League Data Site",

    generated_at:
      new Date().toISOString()
  };
}


async function main() {

  const targetTeams =
    [
      ...new Set(
        toto.matches.flatMap(
          match => [
            normalizeName(match.home),
            normalizeName(match.away)
          ]
        )
      )
    ];


  console.log("");
  console.log(
    "=============================="
  );
  console.log(
    "JUDGE90 H2H FETCH"
  );
  console.log(
    "=============================="
  );

  console.log(
    `Teams: ${targetTeams.length}`
  );


  const teamMatches =
    new Map();


  for (
    const team of targetTeams
  ) {

    try {

      const matches =
        await fetchTeamMatches(
          team
        );

      teamMatches.set(
        team,
        matches
      );

      console.log(
        `${team}: ${matches.length} historical matches`
      );

    } catch(error) {

      console.error(
        error.message
      );

      throw error;
    }

  }


  const outputMatches =
    toto.matches.map(
      match => {

        const teamA =
          normalizeName(
            match.home
          );

        const teamB =
          normalizeName(
            match.away
          );


        const sourceMatches =
          teamMatches.get(
            teamA
          ) || [];


        return {
          number:
            match.number,

          home:
            teamA,

          away:
            teamB,

          h2h:
            summarize(
              teamA,
              teamB,
              sourceMatches
            )
        };

      }
    );


  const output = {

    season:
      "2026/27",

    generated_at:
      new Date().toISOString(),

    source:
      "J.League Data Site",

    matches:
      outputMatches

  };


  mkdirSync(
    "data",
    { recursive:true }
  );


  writeFileSync(
    outputPath,
    JSON.stringify(
      output,
      null,
      2
    ),
    "utf8"
  );


  console.log("");

  console.log(
    "=============================="
  );

  console.log(
    "JUDGE90 H2H DATA"
  );

  console.log(
    "=============================="
  );


  for (
    const match of outputMatches
  ) {

    const h2h =
      match.h2h;

    console.log(
      `${match.number}. ` +
      `${match.home} vs ${match.away}`
    );

    console.log(
      `   recent5: ` +
      `${h2h.recent5.stats.teamA_wins}-` +
      `${h2h.recent5.stats.draws}-` +
      `${h2h.recent5.stats.teamB_wins}`
    );

    console.log(
      `   advantage: ` +
      `${h2h.recent5.advantage}`
    );

  }


  console.log("");

  console.log(
    `Saved: ${outputPath}`
  );

}


main().catch(error => {

  console.error("");

  console.error(
    "H2H FETCH ERROR"
  );

  console.error(error);

  process.exit(1);

});
