
const url =
  "https://data.j-league.or.jp/SFMS01/search?competition_years=2026";

try {
  const response = await fetch(url);

  console.log("HTTP STATUS:", response.status);

  const html = await response.text();

  console.log("HTML LENGTH:", html.length);

  console.log("\n--- PAGE SAMPLE ---");
  console.log(html.slice(0, 1000));

  console.log("\n--- KEYWORD CHECK ---");

  const keywords = [
    "浦和レッズ",
    "鹿島アントラーズ",
    "試合日",
    "スタジアム"
  ];

  for (const keyword of keywords) {
    console.log(
      keyword,
      html.includes(keyword) ? "FOUND" : "NOT FOUND"
    );
  }

} catch (error) {
  console.error("FETCH ERROR:", error);
  process.exit(1);
}
