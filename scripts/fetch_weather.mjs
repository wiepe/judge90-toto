import fs from "fs";

const TOTO_PATH = "data/toto_matches.json";
const JLEAGUE_PATH = "data/jleague_matches.json";
const OUT_PATH = "data/weather.json";

const STADIUMS = {
  "水戸信ス": { name: "水戸信用金庫スタジアム", latitude: 36.3498, longitude: 140.4068 },
  "アイスタ": { name: "IAIスタジアム日本平", latitude: 34.9868, longitude: 138.4817 },
  "パナスタ": { name: "パナソニックスタジアム吹田", latitude: 34.8057, longitude: 135.5407 },
  "Ｇスタ": { name: "町田GIONスタジアム", latitude: 35.5967, longitude: 139.4347 },
  "ピースタ": { name: "PEACE STADIUM Connected by SoftBank", latitude: 32.7447, longitude: 129.8688 },
  "Ｅピース": { name: "エディオンピースウイング広島", latitude: 34.3933, longitude: 132.4533 },
  "味スタ": { name: "味の素スタジアム", latitude: 35.6644, longitude: 139.5272 },
  "埼玉": { name: "埼玉スタジアム2002", latitude: 35.9030, longitude: 139.7167 },
  "アシさと": { name: "アシックス里山スタジアム", latitude: 34.0686, longitude: 133.0008 },
  "ハワスタ": { name: "ハワイアンズスタジアムいわき", latitude: 37.0419, longitude: 140.8854 },
  "プラスタ": { name: "プライフーズスタジアム", latitude: 40.5094, longitude: 141.4880 },
  "ＪＩＴス": { name: "JITリサイクルインクスタジアム", latitude: 35.6255, longitude: 138.5956 },
  "ソユスタ": { name: "ソユースタジアム", latitude: 39.7194, longitude: 140.1225 },
  "MUFG国立": { name: "国立競技場", latitude: 35.6786, longitude: 139.7147 }
};

const WEATHER_CODES = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail"
};

/*
 * ------------------------------------------------------------
 * チーム名照合
 * ------------------------------------------------------------
 *
 * J.League Data Site:
 *   町田 / 横浜FM / 東京Ｖ / いわきFC ...
 *
 * toto:
 *   ＦＣ町田ゼルビア / 横浜Ｆ・マリノス / 東京ヴェルディ ...
 *
 * 「特定6チームだけを直す」のではなく、
 * 表記を正規化して同一クラブとして照合する。
 */

const TEAM_ALIASES = {
  "水戸ホーリーホック": "水戸",
  "川崎フロンターレ": "川崎Ｆ",
  "清水エスパルス": "清水",
  "アビスパ福岡": "福岡",
  "ガンバ大阪": "Ｇ大阪",
  "ＦＣ東京": "FC東京",
  "FC東京": "FC東京",

  "ＦＣ町田ゼルビア": "町田",
  "FC町田ゼルビア": "町田",

  "横浜Ｆ・マリノス": "横浜FM",
  "横浜F・マリノス": "横浜FM",
  "横浜Ｆマリノス": "横浜FM",
  "横浜Fマリノス": "横浜FM",

  "Ｖ・ファーレン長崎": "長崎",
  "V・ファーレン長崎": "長崎",

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
  "いわきＦＣ": "いわきFC",
  "いわきFC": "いわきFC",
  "横浜ＦＣ": "横浜FC",
  "横浜FC": "横浜FC",
  "ヴァンラーレ八戸": "八戸",
  "湘南ベルマーレ": "湘南",
  "ヴァンフォーレ甲府": "甲府",
  "ジュビロ磐田": "磐田",
  "ブラウブリッツ秋田": "秋田",
  "徳島ヴォルティス": "徳島"
};

function basicNormalize(name) {
  return String(name || "")
    .normalize("NFKC")
    .replace(/[・･]/g, "")
    .replace(/[（）()]/g, "")
    .replace(/[「」『』]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeTeam(name) {
  const raw = basicNormalize(name);

  if (TEAM_ALIASES[raw]) {
    return TEAM_ALIASES[raw];
  }

  return raw;
}

/*
 * Jリーグ側の略称を基準に、
 * toto側の正式名称からクラブ名の核を取り出す。
 *
 * ここは「完全一致しないと失敗」ではなく、
 * 複数の表記パターンを段階的に比較する。
 */

function teamVariants(name) {
  const raw = basicNormalize(name);
  const normalized = normalizeTeam(raw);

  const variants = new Set([
    raw,
    normalized
  ]);

  const replacements = [
    ["ＦＣ", ""],
    ["FC", ""],
    ["Ｖ", ""],
    ["V", ""],
    ["・", ""],
    ["マリノス", "FM"],
    ["横浜Fマリノス", "横浜FM"],
    ["横浜FM", "横浜Fマリノス"]
  ];

  for (const [from, to] of replacements) {
    if (raw.includes(from)) {
      variants.add(raw.replaceAll(from, to));
    }
  }

  return [...variants].filter(Boolean);
}

function sameTeam(a, b) {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);

  if (na === nb) return true;

  const va = teamVariants(a);
  const vb = teamVariants(b);

  for (const x of va) {
    for (const y of vb) {
      if (x === y) return true;
    }
  }

  return false;
}

function findMatch(match, jleague, date) {
  const candidates = [];

  for (const league of jleague.leagues || []) {
    for (const game of league.matches || []) {
      if (game.date !== date) continue;

      if (
        sameTeam(match.home, game.home) &&
        sameTeam(match.away, game.away)
      ) {
        candidates.push(game);
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  /*
   * 同日・同カードが複数存在する場合は
   * kickoffまで確認する。
   */
  if (candidates.length > 1 && match.kickoff) {
    const exactKickoff = candidates.find(
      game => game.kickoff === match.kickoff
    );

    if (exactKickoff) {
      return exactKickoff;
    }
  }

  return candidates[0];
}

function nearestHourlyIndex(times, targetDate, kickoff) {
  const [hh, mm] = kickoff.split(":").map(Number);
  const targetMinutes = hh * 60 + mm;

  let bestIndex = -1;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const time = times[i];

    if (!time.startsWith(targetDate)) continue;

    const hour = Number(time.slice(11, 13));
    const minute = Number(time.slice(14, 16));

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      continue;
    }

    const minutes = hour * 60 + minute;
    const diff = Math.abs(minutes - targetMinutes);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  return bestIndex;
}

async function fetchWeather(stadium, date, kickoff) {
  const coords = STADIUMS[stadium];

  if (!coords) {
    return {
      available: false,
      reason: "stadium_coordinates_not_found"
    };
  }

  const params = new URLSearchParams({
    latitude: String(coords.latitude),
    longitude: String(coords.longitude),
    hourly: [
      "temperature_2m",
      "precipitation",
      "precipitation_probability",
      "weather_code",
      "wind_speed_10m"
    ].join(","),
    timezone: "Asia/Tokyo",
    forecast_days: "7"
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Open-Meteo HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.hourly || !Array.isArray(data.hourly.time)) {
    return {
      available: false,
      reason: "hourly_data_not_found"
    };
  }

  const index = nearestHourlyIndex(
    data.hourly.time,
    date,
    kickoff
  );

  if (index === -1) {
    return {
      available: false,
      reason: "target_hour_not_found"
    };
  }

  const weatherCode = data.hourly.weather_code?.[index];

  return {
    available: true,
    stadium: coords.name,
    forecast_time: data.hourly.time[index],
    temperature_c:
      data.hourly.temperature_2m?.[index] ?? null,
    precipitation_mm:
      data.hourly.precipitation?.[index] ?? null,
    precipitation_probability:
      data.hourly.precipitation_probability?.[index] ?? null,
    wind_speed_kmh:
      data.hourly.wind_speed_10m?.[index] ?? null,
    weather_code: weatherCode ?? null,
    weather_description:
      WEATHER_CODES[weatherCode] ?? "Unknown"
  };
}

async function main() {
  const toto = JSON.parse(
    fs.readFileSync(TOTO_PATH, "utf8")
  );

  const jleague = JSON.parse(
    fs.readFileSync(JLEAGUE_PATH, "utf8")
  );

  const results = [];

  for (const match of toto.matches || []) {

    const [month, day] =
      match.date.split("/").map(Number);

    const date =
      `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const game = findMatch(
      match,
      jleague,
      date
    );

    if (!game) {
      results.push({
        number: match.number,
        date: match.date,
        home: match.home,
        away: match.away,
        available: false,
        reason: "jleague_match_not_found"
      });

      console.log(
        `${match.number}. ${match.home} vs ${match.away} -> NO MATCH`
      );

      continue;
    }

    const stadium = game.stadium;
    const kickoff = game.kickoff;

    try {
      const weather = await fetchWeather(
        stadium,
        date,
        kickoff
      );

      results.push({
        number: match.number,
        date: match.date,
        home: match.home,
        away: match.away,
        kickoff,
        stadium,
        ...weather
      });

      console.log(
        `${match.number}. ${match.home} vs ${match.away} -> ` +
        `${weather.available ? "OK" : weather.reason}`
      );

    } catch (error) {
      results.push({
        number: match.number,
        date: match.date,
        home: match.home,
        away: match.away,
        kickoff,
        stadium,
        available: false,
        reason: "weather_fetch_failed",
        error: error.message
      });

      console.log(
        `${match.number}. ${match.home} vs ${match.away} -> ERROR`
      );
    }
  }

  const available =
    results.filter(x => x.available).length;

  const output = {
    source: "Open-Meteo",
    source_url: "https://open-meteo.com/en/docs",
    fetched_at: new Date().toISOString(),
    available_matches: available,
    total_matches: results.length,
    matches: results
  };

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(output, null, 2) + "\n"
  );

  console.log("");
  console.log(
    `Weather available: ${available}/${results.length}`
  );
  console.log(`Saved: ${OUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
