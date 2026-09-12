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

function normalizeTeam(name) {
  return String(name || "")
    .replace(/[ＦＣＶ・]/g, "")
    .replace(/　/g, "")
    .replace(/\s+/g, "")
    .replace(/ホーリーホック/g, "")
    .replace(/フロンターレ/g, "")
    .replace(/エスパルス/g, "")
    .replace(/アビスパ福岡/g, "福岡")
    .replace(/ガンバ大阪/g, "Ｇ大阪")
    .replace(/ゼルビア/g, "")
    .replace(/マリノス/g, "")
    .replace(/グランパス/g, "")
    .replace(/サンフレッチェ/g, "")
    .replace(/セレッソ大阪/g, "Ｃ大阪")
    .replace(/レッズ/g, "")
    .replace(/ファジアーノ岡山/g, "岡山")
    .replace(/ジェフユナイテッド千葉/g, "千葉")
    .replace(/ヴァンラーレ八戸/g, "八戸")
    .replace(/ベルマーレ/g, "")
    .replace(/ヴァンフォーレ甲府/g, "甲府")
    .replace(/ジュビロ磐田/g, "磐田")
    .replace(/徳島ヴォルティス/g, "徳島")
    .replace(/サガン鳥栖/g, "鳥栖")
    .replace(/横浜ＦＣ/g, "横浜FC")
    .trim();
}

function findMatch(match, jleague) {
  const home = normalizeTeam(match.home);
  const away = normalizeTeam(match.away);

  for (const league of jleague.leagues || []) {
    for (const game of league.matches || []) {
      if (
        normalizeTeam(game.home) === home &&
        normalizeTeam(game.away) === away
      ) {
        return game;
      }
    }
  }

  return null;
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

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;

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
    temperature_c: data.hourly.temperature_2m?.[index] ?? null,
    precipitation_mm: data.hourly.precipitation?.[index] ?? null,
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
  const toto = JSON.parse(fs.readFileSync(TOTO_PATH, "utf8"));
  const jleague = JSON.parse(fs.readFileSync(JLEAGUE_PATH, "utf8"));

  const results = [];

  for (const match of toto.matches || []) {

    // totoの日付 09/12 → 2026-09-12
    const [month, day] = match.date.split("/").map(Number);

    const date =
      `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // ホーム・アウェイからJリーグ側の試合を検索
    const game = findMatch(match, jleague);

    if (!game) {
      results.push({
        number: match.number,
        date: match.date,
        home: match.home,
        away: match.away,
        available: false,
        reason: "jleague_match_not_found"
      });
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
    }
  }

  const available = results.filter(x => x.available).length;

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

  console.log(`Weather available: ${available}/${results.length}`);
  console.log(`Saved: ${OUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
