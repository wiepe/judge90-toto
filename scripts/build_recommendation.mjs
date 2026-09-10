import { writeFileSync, mkdirSync } from "node:fs";

const targets = [
  {
    league: "J1",
    frameId: 1,
    competitionId: 725
  },
  {
    league: "J2",
    frameId: 2,
    competitionId: 727
  },
  {
    league: "J3",
    frameId: 3,
    competitionId: 730
  }
];

function stripTags(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(text) {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{2})/);

  if (!match) {
    return null;
  }

  const [, yy, mm, dd] = match;

  return `20${yy}-${mm}-${dd}`;
}

function extractRows(html) {
  const rows = [];
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];

    const cells = [
      ...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)
    ].map(match => stripTags(match[1]));

    if (cells.length < 9) {
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

    if (!season || !season.startsWith("2026")) {
      continue;
    }

    if (!home || !away) {
      continue;
    }

    rows.push({
      season,
      competition,
      section,
      date: parseDate(dateText),
      kickoff,
      home,
      score: score === "vs" ? null : score,
      away,
      stadium
    });
  }

  return rows;
}

async function fetchLeague(target) {
  const url =
    `https://data.j-league.or.jp/SFMS01/search` +
    `?competition_frame_ids=${target.frameId}` +
    `&competition_ids=${target.competitionId}` +
    `&competition_years=2026`;

  console.log(`Fetching ${target.league}...`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${target.league} HTTP ERROR: ${response.status}`
    );
  }

  const html = await response.text();

  const matches = extractRows(html);

  console.log(
    `${target.league}: ${matches.length} matches`
  );

  return {
    league: target.league,
    source: "J.League Data Site",
    source_url: url,
    fetched_at: new Date().toISOString(),
    matches
  };
}

const results = [];

for (const target of targets) {
  try {
    const result = await fetchLeague(target);
    results.push(result);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (results.length !== targets.length) {
  console.error("NOT ALL LEAGUES WERE FETCHED.");
  process.exit(1);
}

const output = {
  season: "2026/27",
  fetched_at: new Date().toISOString(),
  leagues: results
};

mkdirSync("data", { recursive: true });

writeFileSync(
  "data/jleague_matches.json",
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log("");
console.log("==============================");
console.log("JUDGE90 J.LEAGUE DATA");
console.log("==============================");
console.log("Saved: data/jleague_matches.json");
console.log(`J1: ${results[0].matches.length}`);
console.log(`J2: ${results[1].matches.length}`);
console.log(`J3: ${results[2].matches.length}`);
