import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE_URL = "https://data.j-league.or.jp/SFMS01/search";
const OUTPUT_FILE = "data/weather_analysis.json";

const CITY_COORDS = {
  "札幌": [43.0618, 141.3545],
  "青森": [40.8246, 140.7400],
  "八戸": [40.5123, 141.4883],
  "盛岡": [39.7021, 141.1545],
  "秋田": [39.7200, 140.1025],
  "仙台": [38.2682, 140.8694],
  "山形": [38.2554, 140.3396],
  "福島": [37.7608, 140.4747],
  "鹿島": [35.9658, 140.6448],
  "水戸": [36.3659, 140.4712],
  "栃木": [36.5658, 139.8836],
  "群馬": [36.3911, 139.0608],
  "草津": [36.6209, 138.5960],
  "浦和": [35.8617, 139.6455],
  "大宮": [35.9069, 139.6238],
  "千葉": [35.6074, 140.1065],
  "柏": [35.8676, 139.9757],
  "東京": [35.6812, 139.7671],
  "川崎": [35.5309, 139.7030],
  "横浜": [35.4437, 139.6380],
  "湘南": [35.3387, 139.4900],
  "甲府": [35.6635, 138.5684],
  "松本": [36.2380, 137.9720],
  "新潟": [37.9161, 139.0364],
  "富山": [36.6953, 137.2113],
  "金沢": [36.5613, 136.6562],
  "清水": [35.0159, 138.4897],
  "磐田": [34.7179, 137.8515],
  "藤枝": [34.8678, 138.2578],
  "名古屋": [35.1815, 136.9066],
  "岐阜": [35.4233, 136.7607],
  "京都": [35.0116, 135.7681],
  "大阪": [34.6937, 135.5023],
  "神戸": [34.6901, 135.1956],
  "岡山": [34.6551, 133.9195],
  "広島": [34.3853, 132.4553],
  "山口": [34.1785, 131.4737],
  "徳島": [34.0703, 134.5548],
  "愛媛": [33.8416, 132.7657],
  "今治": [34.0660, 132.9970],
  "福岡": [33.5902, 130.4017],
  "北九州": [33.8834, 130.8751],
  "鳥栖": [33.3778, 130.5060],
  "長崎": [32.7503, 129.8777],
  "熊本": [32.8031, 130.7079],
  "大分": [33.2382, 131.6126],
  "宮崎": [31.9077, 131.4202],
  "鹿児島": [31.5966, 130.5571]
};

const CITY_HINTS = [
  ["ヴェルディ川崎", "川崎"], ["川崎Ｆ", "川崎"], ["川崎", "川崎"],
  ["横浜フリューゲルス", "横浜"], ["横浜FM", "横浜"], ["横浜ＦＣ", "横浜"],
  ["鹿島", "鹿島"], ["水戸", "水戸"], ["栃木", "栃木"],
  ["ザスパ", "群馬"], ["草津", "草津"], ["群馬", "群馬"],
  ["浦和", "浦和"], ["大宮", "大宮"], ["千葉", "千葉"], ["柏", "柏"],
  ["ＦＣ東京", "東京"], ["FC東京", "東京"], ["東京Ｖ", "東京"], ["東京ヴェルディ", "東京"],
  ["湘南", "湘南"], ["平塚", "湘南"], ["甲府", "甲府"], ["松本", "松本"],
  ["新潟", "新潟"], ["富山", "富山"], ["金沢", "金沢"],
  ["清水", "清水"], ["磐田", "磐田"], ["藤枝", "藤枝"],
  ["名古屋", "名古屋"], ["岐阜", "岐阜"], ["京都", "京都"],
  ["Ｇ大阪", "大阪"], ["ガンバ大阪", "大阪"], ["Ｃ大阪", "大阪"], ["セレッソ大阪", "大阪"],
  ["大阪", "大阪"], ["神戸", "神戸"], ["岡山", "岡山"], ["広島", "広島"],
  ["山口", "山口"], ["徳島", "徳島"], ["愛媛", "愛媛"], ["今治", "今治"],
  ["福岡", "福岡"], ["北九州", "北九州"], ["鳥栖", "鳥栖"], ["長崎", "長崎"],
  ["熊本", "熊本"], ["大分", "大分"], ["宮崎", "宮崎"], ["鹿児島", "鹿児島"],
  ["札幌", "札幌"], ["八戸", "八戸"], ["青森", "青森"], ["盛岡", "盛岡"],
  ["秋田", "秋田"], ["仙台", "仙台"], ["山形", "山形"], ["福島", "福島"]
];

function clean(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeam(name) {
  return clean(name)
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[・･]/g, "");
}

function parseDate(text) {
  const m = String(text).match(/(\d{2,4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const year = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${year}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

function parseScore(text) {
  const m = String(text).match(/^(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return { homeGoals: Number(m[1]), awayGoals: Number(m[2]) };
}

function parseRows(html) {
  const rows = [];

  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => clean(m[1]));

    if (cells.length < 8) continue;

    const date = parseDate(cells[3]);
    const score = parseScore(cells[6]);
    const home = normalizeTeam(cells[5]);
    const away = normalizeTeam(cells[7]);
    const competition = cells[1] || "";

    if (!date || !score || !home || !away) continue;

    // J1/J2/J3のリーグ戦だけを対象。カップ戦は除外。
    if (!/Ｊ１|Ｊ２|Ｊ３|J1|J2|J3|Ｊリーグ/.test(competition)) continue;
    if (/ルヴァン|リーグカップ|ヤマザキ|カップ/.test(competition)) continue;

    rows.push({
      date,
      home,
      away,
      homeGoals: score.homeGoals,
      awayGoals: score.awayGoals
    });
  }

  return rows;
}

async function fetchYear(frame, year) {
  const url =
    `${BASE_URL}?competition_frame_ids=${frame}` +
    `&competition_years=${year}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return parseRows(await response.text());
}

function locationForTeam(team) {
  const normalized = normalizeTeam(team);

  for (const [hint, city] of CITY_HINTS) {
    if (normalized.includes(normalizeTeam(hint))) {
      const coords = CITY_COORDS[city];
      if (coords) return { city, latitude: coords[0], longitude: coords[1] };
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDailyWeather(locations, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: locations.map(x => x.latitude).join(','),
    longitude: locations.map(x => x.longitude).join(','),
    start_date: startDate,
    end_date: endDate,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,wind_speed_10m_max',
    timezone: 'Asia/Tokyo',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    models: 'era5'
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
  for (let attempt=1; attempt<=6; attempt++) {
    const r=await fetch(url);
    if(r.ok) return r.json();
    if(r.status===429 || r.status>=500){
      const ra=Number(r.headers.get('retry-after'));
      const wait=Number.isFinite(ra)&&ra>0 ? Math.min(90000,ra*1000) : Math.min(90000,5000*2**(attempt-1));
      console.log(`  Open-Meteo HTTP ${r.status}; retry ${attempt}/6 after ${Math.round(wait/1000)}s`);
      await sleep(wait); continue;
    }
    throw new Error(`Open-Meteo HTTP ${r.status}`);
  }
  throw new Error('Open-Meteo retry limit exceeded');
}

function oneWeatherMap(payload){
  const d=payload?.daily;
  const map=new Map();
  if(!d?.time) return map;
  for(let i=0;i<d.time.length;i++) map.set(d.time[i],{
    weather_code:d.weather_code?.[i]??null,
    temperature_max_c:d.temperature_2m_max?.[i]??null,
    temperature_min_c:d.temperature_2m_min?.[i]??null,
    precipitation_mm:d.precipitation_sum?.[i]??null,
    precipitation_hours:d.precipitation_hours?.[i]??null,
    wind_speed_max_kmh:d.wind_speed_10m_max?.[i]??null
  });
  return map;
}

function buildWeatherMaps(data, locations){
  const payloads=Array.isArray(data)?data:(Array.isArray(data?.results)?data.results:[data]);
  const maps=new Map();
  locations.forEach((loc,i)=>maps.set(loc.city,oneWeatherMap(payloads[i])));
  return maps;
}

function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (
    0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429)))
  );
  return x >= 0 ? 1 - p : p;
}

function proportionTest(n1, x1, n0, x0) {
  if (n1 === 0 || n0 === 0) return { difference_pp: null, p_value: null };

  const r1 = x1 / n1;
  const r0 = x0 / n0;
  const pooled = (x1 + x0) / (n1 + n0);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n0));

  if (!se) return { difference_pp: (r1 - r0) * 100, p_value: 1 };

  const z = (r1 - r0) / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));

  return {
    difference_pp: Number(((r1 - r0) * 100).toFixed(2)),
    p_value: Number(p.toFixed(5))
  };
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function analyzeCondition(matches, predicate) {
  const yes = matches.filter(predicate);
  const no = matches.filter(m => !predicate(m));

  // API failure or sparse data must never crash the validation run.
  if (yes.length === 0 || no.length === 0) {
    return {
      sample: { condition: yes.length, control: no.length },
      insufficient_data: true,
      candidate_for_model: false
    };
  }

  const countOutcome = (arr, key) => arr.filter(m => m.outcome === key).length;

  const homeTest = proportionTest(
    yes.length, countOutcome(yes, "1"),
    no.length, countOutcome(no, "1")
  );
  const drawTest = proportionTest(
    yes.length, countOutcome(yes, "0"),
    no.length, countOutcome(no, "0")
  );
  const awayTest = proportionTest(
    yes.length, countOutcome(yes, "2"),
    no.length, countOutcome(no, "2")
  );

  const yesGoals = yes.map(m => m.homeGoals + m.awayGoals);
  const noGoals = no.map(m => m.homeGoals + m.awayGoals);

  const candidates = [
    Math.abs(homeTest.difference_pp ?? 0),
    Math.abs(drawTest.difference_pp ?? 0),
    Math.abs(awayTest.difference_pp ?? 0)
  ];

  const maxEffect = Math.max(...candidates);

  // 「使えそう」とする基準はかなり厳しめ。
  // 小標本や偶然の差で予測モデルを動かさない。
  const candidate =
    yes.length >= 100 &&
    maxEffect >= 5 &&
    Math.min(
      homeTest.p_value ?? 1,
      drawTest.p_value ?? 1,
      awayTest.p_value ?? 1
    ) < 0.01;

  return {
    sample: {
      condition: yes.length,
      control: no.length
    },
    outcome_rate_condition: {
      "1": Number((countOutcome(yes, "1") / yes.length * 100).toFixed(2)),
      "0": Number((countOutcome(yes, "0") / yes.length * 100).toFixed(2)),
      "2": Number((countOutcome(yes, "2") / yes.length * 100).toFixed(2))
    },
    outcome_rate_control: {
      "1": Number((countOutcome(no, "1") / no.length * 100).toFixed(2)),
      "0": Number((countOutcome(no, "0") / no.length * 100).toFixed(2)),
      "2": Number((countOutcome(no, "2") / no.length * 100).toFixed(2))
    },
    difference_condition_minus_control_pp: {
      "1": homeTest.difference_pp,
      "0": drawTest.difference_pp,
      "2": awayTest.difference_pp
    },
    p_values: {
      "1": homeTest.p_value,
      "0": drawTest.p_value,
      "2": awayTest.p_value
    },
    average_total_goals: {
      condition: mean(yesGoals) == null ? null : Number(mean(yesGoals).toFixed(3)),
      control: mean(noGoals) == null ? null : Number(mean(noGoals).toFixed(3)),
      difference: mean(yesGoals) == null || mean(noGoals) == null
        ? null
        : Number((mean(yesGoals) - mean(noGoals)).toFixed(3))
    },
    candidate_for_model: candidate
  };
}

function describeCondition(m) {
  return {
    rain: m.precipitation_mm != null && m.precipitation_mm >= 0.1,
    heavy_rain: m.precipitation_mm != null && m.precipitation_mm >= 5,
    hot: m.temperature_max_c != null && m.temperature_max_c >= 30,
    warm: m.temperature_max_c != null && m.temperature_max_c >= 28,
    cold: m.temperature_min_c != null && m.temperature_min_c <= 10,
    strong_wind: m.wind_speed_max_kmh != null && m.wind_speed_max_kmh >= 25,
    storm: m.weather_code != null && m.weather_code >= 95
  };
}

async function main() {
  console.log("");
  console.log("==============================");
  console.log("JUDGE90 HISTORICAL WEATHER VALIDATION");
  console.log("==============================");

  const rawMatches = [];

  for (const frame of [1, 2, 3]) {
    for (let year = 2004; year <= 2026; year++) {
      try {
        const rows = await fetchYear(frame, year);
        rawMatches.push(...rows);
        console.log(`frame ${frame} / ${year}: ${rows.length}`);
      } catch (error) {
        console.log(`SKIP ${frame}/${year}: ${error.message}`);
      }
    }
  }

  const unique = new Map();
  for (const match of rawMatches) {
    const key =
      `${match.date}|${match.home}|${match.away}|` +
      `${match.homeGoals}-${match.awayGoals}`;
    unique.set(key, match);
  }

  const historical = [...unique.values()];
  console.log(`\nHistorical league matches: ${historical.length}`);

  const groups = new Map();

  for (const match of historical) {
    const location = locationForTeam(match.home);
    if (!location) continue;

    if (!groups.has(location.city)) {
      groups.set(location.city, {
        ...location,
        dates: []
      });
    }

    groups.get(location.city).dates.push(match.date);
  }

  console.log(`Weather locations: ${groups.size}`);

  const locations=[...groups.values()];
  const weatherByCity=new Map();
  let weatherFailures=0;
  const BATCH_SIZE=5;
  const globalStart=locations.reduce((m,g)=>g.dates.reduce((a,b)=>a<b?a:b,m),'9999-12-31');
  const globalEnd=locations.reduce((m,g)=>g.dates.reduce((a,b)=>a>b?a:b,m),'0000-01-01');

  for(let i=0;i<locations.length;i+=BATCH_SIZE){
    const batch=locations.slice(i,i+BATCH_SIZE);
    console.log(`Weather batch ${i+1}-${i+batch.length}/${locations.length}: ${batch.map(x=>x.city).join(', ')}`);
    try{
      const data=await fetchDailyWeather(batch,globalStart,globalEnd);
      const maps=buildWeatherMaps(data,batch);
      let got=0;
      for(const [city,map] of maps){
        if(map.size){weatherByCity.set(city,map);got++;}
      }
      console.log(`  received ${got}/${batch.length} locations`);
    }catch(e){
      weatherFailures+=batch.length;
      console.log(`  WEATHER BATCH ERROR: ${e.message}`);
    }
    if(i+BATCH_SIZE<locations.length) await sleep(2000);
  }

  const joined = [];
  let noLocation = 0;
  let noWeather = 0;

  for (const match of historical) {
    const location = locationForTeam(match.home);
    if (!location) {
      noLocation++;
      continue;
    }

    const weather = weatherByCity.get(location.city)?.get(match.date);
    if (!weather) {
      noWeather++;
      continue;
    }

    joined.push({
      ...match,
      location: location.city,
      ...weather,
      outcome:
        match.homeGoals > match.awayGoals ? "1" :
        match.homeGoals < match.awayGoals ? "2" : "0"
    });
  }

  console.log(`Weather matched: ${joined.length}/${historical.length}`);

  const conditions = {
    rain: analyzeCondition(joined, m => m.precipitation_mm >= 0.1),
    heavy_rain: analyzeCondition(joined, m => m.precipitation_mm >= 5),
    hot: analyzeCondition(joined, m => m.temperature_max_c >= 30),
    warm: analyzeCondition(joined, m => m.temperature_max_c >= 28),
    cold: analyzeCondition(joined, m => m.temperature_min_c <= 10),
    strong_wind: analyzeCondition(joined, m => m.wind_speed_max_kmh >= 25),
    storm: analyzeCondition(joined, m => m.weather_code >= 95)
  };

  const candidates = Object.entries(conditions)
    .filter(([, value]) => value.candidate_for_model)
    .map(([key]) => key);

  const output = {
    generated_at: new Date().toISOString(),
    source: {
      matches: "J.League Data Site",
      weather: "Open-Meteo Historical Weather API / ERA5"
    },
    scope: {
      years: "2004-2026",
      competitions: "J1/J2/J3 league matches",
      weather_unit: "daily home-area weather",
      note: "This is a validation stage. It does not modify prediction probabilities."
    },
    coverage: {
      historical_matches: historical.length,
      weather_locations: groups.size,
      weather_matched_matches: joined.length,
      coverage_percent: Number((joined.length / historical.length * 100).toFixed(2)),
      skipped_no_location: noLocation,
      skipped_no_weather: noWeather,
      weather_api_failures: weatherFailures
    },
    conditions,
    model_change_recommendation: {
      candidate_signals: candidates,
      action: candidates.length
        ? "Do not change probabilities yet. Candidate signals should be confirmed by out-of-sample backtesting before entering predict.mjs."
        : "No weather signal passed the conservative screening threshold. Keep weather as an environment signal only."
    }
  };

  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

  console.log("\n==============================");
  console.log("RESULT");
  console.log("==============================");
  console.log(`Coverage: ${output.coverage.coverage_percent}%`);
  console.log(`Candidate signals: ${candidates.join(", ") || "NONE"}`);
  console.log(`Saved: ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
