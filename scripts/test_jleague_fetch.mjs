const urls = [
  {
    name: "J1",
    url: "https://data.j-league.or.jp/SFMS01/search?competition_frame_ids=1&competition_ids=725&competition_years=2026"
  },
  {
    name: "J2",
    url: "https://data.j-league.or.jp/SFMS01/search?competition_frame_ids=2&competition_years=2026"
  }
];

for (const target of urls) {
  console.log(`\n==============================`);
  console.log(`${target.name} TEST`);
  console.log(`==============================`);

  try {
    const response = await fetch(target.url);

    console.log("HTTP STATUS:", response.status);

    const html = await response.text();

    console.log("HTML LENGTH:", html.length);

    const checks = [
      "浦和",
      "鹿島",
      "横浜FM",
      "広島",
      "試合日",
      "スタジアム"
    ];

    console.log("\n--- KEYWORD CHECK ---");

    for (const keyword of checks) {
      console.log(
        keyword,
        html.includes(keyword) ? "FOUND" : "NOT FOUND"
      );
    }

  } catch (error) {
    console.error(`${target.name} FETCH ERROR:`, error);
  }
}
