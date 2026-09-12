import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const TOTO_FILE = "data/toto_matches.json";
const JLEAGUE_FILE = "data/jleague_matches.json";
const OUTPUT_FILE = "data/weather.json";

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast";

/*
 * J.League公式のスタジアム名 → 緯度経度
 *
 * 今回の13試合で使用される会場を中心に登録。
 */
const stadiums = {
  "水戸信ス": {
    name: "水戸市立競技場",
    latitude: 36.3498,
    longitude: 140.4068
  },

  "アイスタ": {
    name: "IAIスタジアム日本平",
    latitude: 34.9868,
    longitude: 138.4817
  },

  "パナスタ": {
    name: "パナソニックスタジアム吹田",
    latitude: 34.8057,
    longitude: 135.5407
  },

  "Ｇスタ": {
    name: "町田GIONスタジアム",
    latitude: 35.5967,
    longitude: 139.4347
  },

  "ピースタ": {
    name: "PEACE STADIUM Connected by SoftBank",
    latitude: 32.7447,
    longitude: 129.8688
  },

  "Ｅピース": {
    name: "エディオンピースウイング広島",
    latitude: 34.3933,
    longitude: 132.4533
  },

  "味スタ": {
    name: "味の素スタジアム",
    latitude: 35.6644,
    longitude: 139.5272
  },

  "埼玉": {
    name: "埼玉スタジアム2002",
    latitude: 35.9030,
    longitude: 139.7167
  },

  "アシさと": {
    name: "アシックス里山スタジアム",
    latitude: 34.0686,
    longitude: 133.0008
  },

  "ハワスタ": {
    name: "ハワイアンズスタジアムいわき",
    latitude: 37.0419,
    longitude: 140.8854
  },

  "プラスタ": {
    name: "プライフーズスタジアム",
    latitude: 40.5094,
    longitude: 141.4880
  },

  "ＪＩＴス": {
    name: "JITリサイクルインクスタジアム",
    latitude: 35.6255,
    longitude: 138.5956
  },

  "ソユスタ": {
    name: "ソユースタジアム",
    latitude: 39.7194,
    longitude: 140.1225
  }
};

const weatherCodeNames = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail"
};

function normalizeTeam(name) {
  const aliases = {
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

  return aliases[name] || name;
}

function findMatch(totoMatch, jleagueMatches) {
  const home = normalizeTeam(totoMatch.home);
  const away = normalizeTeam(totoMatch.away);

  return jleagueMatches.find(match => {
    return (
      normalizeTeam(match.home) === home &&
      normalizeTeam(match.away) === away &&
      match.score === null
    );
  });
}

async function fetchWeather(
  stadium,
  date,
  kickoff
) {
  const location = stadiums[stadium];

  if (!location) {
    return {
      available: false,
      reason: "stadium_coordinates_not_found"
    };
  }

  const url =
    `${OPEN_METEO_URL}` +
    `?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    `&hourly=temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m` +
    `&timezone=Asia%2FTokyo` +
    `&start_date=${date}` +
    `&end_date=${date}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Open-Meteo HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const targetHour =
    `${date}T${kickoff}`;

  const index =
    data.hourly.time.findIndex(
      time => time === targetHour
    );

  if (index === -1) {
    return {
      available: false,
      reason: "kickoff_hour_not_found"
    };
  }

  const temperature =
    data.hourly.temperature_2m[index];

  const precipitation =
    data.hourly.precipitation[index];

  const precipitationProbability =
    data.hourly.precipitation_probability[index];

  const windSpeed =
    data.hourly.wind_speed_10m[index];

  const weatherCode =
    data.hourly.weather_code[index];

  return {
    available: true,

    stadium: location.name,

    latitude: location.latitude,
    longitude: location.longitude,

    date,
    kickoff,

    temperature,
    precipitation,
    precipitation_probability:
      precipitationProbability,

    wind_speed: windSpeed,

    weather_code: weatherCode,

    weather:
      weatherCodeNames[weatherCode] ||
      "Unknown"
  };
}

async function main() {
  console.log("");
  console.log("==============================");
  console.log("JUDGE90 WEATHER FETCH");
  console.log("==============================");

  const toto =
    JSON.parse(
      readFileSync(
        TOTO_FILE,
        "utf8"
      )
    );

  const jleague =
    JSON.parse(
      readFileSync(
        JLEAGUE_FILE,
        "utf8"
      )
    );

  const jleagueMatches =
    jleague.leagues.flatMap(
      league => league.matches
    );

  const results = [];

  for (const totoMatch of toto.matches) {
    const match =
      findMatch(
        totoMatch,
        jleagueMatches
      );

    if (!match) {
      console.log(
        `${totoMatch.number}. ` +
        `${totoMatch.home} vs ` +
        `${totoMatch.away} → 試合データなし`
      );

      results.push({
        number: totoMatch.number,
        home: totoMatch.home,
        away: totoMatch.away,
        available: false,
        reason: "match_not_found"
      });

      continue;
    }

    const weather =
      await fetchWeather(
        match.stadium,
        match.date,
        match.kickoff
      );

    const result = {
      number: totoMatch.number,
      home: totoMatch.home,
      away: totoMatch.away,
      date: match.date,
      kickoff: match.kickoff,
      stadium: match.stadium,
      weather
    };

    results.push(result);

    if (weather.available) {
      console.log(
        `${totoMatch.number}. ` +
        `${totoMatch.home} vs ${totoMatch.away}`
      );

      console.log(
        `   ${match.stadium} ` +
        `${match.date} ${match.kickoff}`
      );

      console.log(
        `   ${weather.weather} / ` +
        `${weather.temperature}℃ / ` +
        `降水${weather.precipitation}mm / ` +
        `降水確率${weather.precipitation_probability}% / ` +
        `風${weather.wind_speed}km/h`
      );
    }
  }

  const available =
    results.filter(
      result =>
        result.weather?.available
    ).length;

  const output = {
    generated_at:
      new Date().toISOString(),

    source:
      "Open-Meteo",

    source_url:
      "https://open-meteo.com/",

    timezone:
      "Asia/Tokyo",

    matches: results
  };

  mkdirSync(
    "data",
    { recursive: true }
  );

  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log("==============================");
  console.log(
    `Weather available: ${available}/${results.length}`
  );
  console.log(
    `Saved: ${OUTPUT_FILE}`
  );
  console.log("==============================");
}

main().catch(error => {
  console.error("");
  console.error("WEATHER FETCH ERROR");
  console.error(error);
  process.exit(1);
});
