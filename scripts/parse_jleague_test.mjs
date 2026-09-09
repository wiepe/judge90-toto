
const targets = [
  {
    name: "J1",
    url: "https://data.j-league.or.jp/SFMS01/search?competition_frame_ids=1&competition_ids=725&competition_years=2026"
  },
  {
    name: "J2",
    url: "https://data.j-league.or.jp/SFMS01/search?competition_frame_ids=2&competition_ids=727&competition_years=2026"
  },
  {
    name: "J3",
    url: "https://data.j-league.or.jp/SFMS01/search?competition_frame_ids=3&competition_ids=730&competition_years=2026"
  }
];

function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .trim();
}

function extractMatches(html) {
  const matches = [];

  /*
   * J.League公式ページのHTMLから
   * 試合情報らしいブロックを探すための簡易テスト。
   *
   * この段階では「完全なパーサー」ではなく、
   * 実際のHTML構造を確認することを目的とする。
   */

  const dateMatches = [
    ...html.matchAll(
      /(\d{4})\/(\d{1,2})\/(\d{1,2})/g
    )
  ];

  for (const match of dateMatches.slice(0, 10)) {
    matches.push({
      date: `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`
    });
  }

  return matches;
}

for (const target of targets) {
  console.log("\n==============================");
  console.log(`${target.name} PARSE TEST`);
  console.log("==============================");

  try {
    const response = await fetch(target.url);

    console.log("HTTP STATUS:", response.status);

    const html = await response.text();

    console.log("HTML LENGTH:", html.length);

    const matches = extractMatches(html);

    console.log("\n--- DATE EXTRACTION ---");

    if (matches.length === 0) {
      console.log("NO DATES FOUND");
    } else {
      for (const match of matches) {
        console.log(match);
      }
    }

    console.log("\n--- SAMPLE HTML ---");

    const sampleIndex = html.indexOf("浦和");

    if (sampleIndex !== -1) {
      console.log(
        cleanText(
          html.substring(
            Math.max(0, sampleIndex - 500),
            sampleIndex + 1000
          )
        )
      );
    } else {
      console.log("TEAM SAMPLE NOT FOUND");
    }

  } catch (error) {
    console.error(`${target.name} PARSE ERROR:`, error);
  }
}
