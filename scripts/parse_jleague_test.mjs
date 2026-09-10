const targets = [
  {
    name: "J1",
    frameId: 1,
    competitionId: 725
  },
  {
    name: "J2",
    frameId: 2,
    competitionId: 727
  },
  {
    name: "J3",
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

    // ヘッダーなどを除外
    if (!season || !season.match(/^2026/)) {
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

for (const target of targets) {
  console.log("\n==============================");
  console.log(`${target.name} PARSE TEST`);
  console.log("==============================");

  const url =
    `https://data.j-league.or.jp/SFMS01/search` +
    `?competition_frame_ids=${target.frameId}` +
    `&competition_ids=${target.competitionId}` +
    `&competition_years=2026`;

  console.log("URL:", url);

  try {
    const response = await fetch(url);

    console.log("HTTP STATUS:", response.status);

    if (!response.ok) {
      console.error("FETCH FAILED");
      continue;
    }

    const html = await response.text();

    console.log("HTML LENGTH:", html.length);

    const matches = extractRows(html);

    console.log("MATCHES FOUND:", matches.length);

    console.log("\n--- FIRST 5 MATCHES ---");

    for (const match of matches.slice(0, 5)) {
      console.log(JSON.stringify(match, null, 2));
    }

    console.log("\n--- UPCOMING MATCHES ---");

    const upcoming = matches
      .filter(match => match.score === null)
      .slice(0, 5);

    for (const match of upcoming) {
      console.log(JSON.stringify(match, null, 2));
    }

    console.log("\n--- PARSE STATUS ---");

    if (matches.length > 0) {
      console.log("SUCCESS");
    } else {
      console.log("FAILED: NO MATCHES");
    }

  } catch (error) {
    console.error(`${target.name} PARSE ERROR:`, error);
  }
}
