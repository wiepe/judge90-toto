const urls = [
  {
    name: "J1",
    frameId: 1,
    competitionId: 725,
    checkTeams: ["浦和", "鹿島", "横浜FM", "広島"]
  },
  {
    name: "J2",
    frameId: 2,
    competitionId: 727,
    checkTeams: ["仙台", "山形", "札幌", "新潟"]
  },
  {
    name: "J3",
    frameId: 3,
    competitionId: 730,
    checkTeams: ["福島", "松本", "長野", "金沢"]
  }
];

for (const target of urls) {
  const url =
    `https://data.j-league.or.jp/SFMS01/search` +
    `?competition_frame_ids=${target.frameId}` +
    `&competition_ids=${target.competitionId}` +
    `&competition_years=2026`;

  console.log(`\n==============================`);
  console.log(`${target.name} TEST`);
  console.log(`==============================`);
  console.log("URL:", url);

  try {
    const response = await fetch(url);

    console.log("HTTP STATUS:", response.status);

    const html = await response.text();

    console.log("HTML LENGTH:", html.length);

    console.log("\n--- KEYWORD CHECK ---");

    for (const keyword of target.checkTeams) {
      console.log(
        keyword,
        html.includes(keyword) ? "FOUND" : "NOT FOUND"
      );
    }

    console.log("\n--- COMMON CHECK ---");

    const commonChecks = [
      "試合日",
      "K/O時刻",
      "ホーム",
      "アウェイ",
      "スタジアム"
    ];

    for (const keyword of commonChecks) {
      console.log(
        keyword,
        html.includes(keyword) ? "FOUND" : "NOT FOUND"
      );
    }

  } catch (error) {
    console.error(`${target.name} FETCH ERROR:`, error);
  }
}
