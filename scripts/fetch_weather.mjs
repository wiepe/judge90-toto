import fs from "fs";

const TOTO_PATH = "data/toto_matches.json";
const JLEAGUE_PATH = "data/jleague_matches.json";
const OUT_PATH = "data/weather.json";

const WEATHER_CODES = {
  0: "快晴",
  1: "晴れ",
  2: "薄曇り",
  3: "曇り",
  45: "霧",
  48: "霧氷",
  51: "弱い霧雨",
  53: "霧雨",
  55: "強い霧雨",
  56: "弱い凍雨",
  57: "強い凍雨",
  61: "弱い雨",
  63: "雨",
  65: "強い雨",
  66: "弱い着氷性の雨",
  67: "強い着氷性の雨",
  71: "弱い雪",
  73: "雪",
  75: "強い雪",
  77: "雪粒",
  80: "弱いにわか雨",
  81: "にわか雨",
  82: "強いにわか雨",
  85: "弱いにわか雪",
  86: "強いにわか雪",
  95: "雷雨",
  96: "雷雨＋雹",
  99: "強い雷雨＋雹"
};

/*
 * J.League / toto のチーム名をできるだけ同じキーにする
 */
const TEAM_ALIASES = {
  "アビスパ福岡": "福岡",
  "福岡": "福岡",

  "サンフレッチェ広島": "広島",
  "広島": "広島",

  "浦和レッズ": "浦和",
  "浦和": "浦和",

  "東京ヴェルディ": "東京V",
  "東京Ｖ": "東京V",
  "東京V": "東京V",

  "清水エスパルス": "清水",
  "清水": "清水",

  "ジェフユナイテッド千葉": "千葉",
  "ジェフ千葉": "千葉",
  "千葉": "千葉",

  "ファジアーノ岡山": "岡山",
  "岡山": "岡山",

  "京都サンガF.C.": "京都",
  "京都サンガ": "京都",
  "京都": "京都",

  "FC東京": "FC東京",
  "ＦＣ東京": "FC東京",

  "名古屋グランパス": "名古屋",
  "名古屋": "名古屋",

  "Ｖ・ファーレン長崎": "長崎",
  "V・ファーレン長崎": "長崎",
  "長崎": "長崎",

  "セレッソ大阪": "C大阪",
  "Ｃ大阪": "C大阪",
  "C大阪": "C大阪",

  "横浜Ｆ・マリノス": "横浜FM",
  "横浜F・マリノス": "横浜FM",
  "横浜FM": "横浜FM",

  "水戸ホーリーホック": "水戸",
  "水戸": "水戸",

  "ＦＣ町田ゼルビア": "町田",
  "FC町田ゼルビア": "町田",
  "町田": "町田",

  "柏レイソル": "柏",
  "柏": "柏",

  "ガンバ大阪": "G大阪",
  "Ｇ大阪": "G大阪",
  "G大阪": "G大阪",

  "ヴィッセル神戸": "神戸",
  "神戸": "神戸",

  "モンテディオ山形": "山形",
  "山形": "山形",

  "カターレ富山": "富山",
  "富山": "富山",

  "藤枝ＭＹＦＣ": "藤枝",
  "藤枝MYFC": "藤枝",
  "藤枝": "藤枝",

  "大宮アルディージャ": "大宮",
  "大宮": "大宮",

  "アルビレックス新潟": "新潟",
  "新潟": "新潟",

  "ジュビロ磐田": "磐田",
  "磐田": "磐田",

  "ヴァンフォーレ甲府": "甲府",
  "甲府": "甲府",

  "徳島ヴォルティス": "徳島",
  "徳島": "徳島",

  "鹿島アントラーズ": "鹿島",
  "鹿島": "鹿島",

  "川崎フロンターレ": "川崎F",
  "川崎Ｆ": "川崎F",
  "川崎F": "川崎F",

  "横浜FC": "横浜FC",
  "横浜ＦＣ": "横浜FC",

  "湘南ベルマーレ": "湘南",
  "湘南": "湘南",

  "サガン鳥栖": "鳥栖",
  "鳥栖": "鳥栖",

  "ＦＣ今治": "今治",
  "FC今治": "今治",
  "今治": "今治",

  "いわきＦＣ": "いわき",
  "いわきFC": "いわき",
  "いわき": "いわき",

  "ブラウブリッツ秋田": "秋田",
  "秋田": "秋田",

  "ヴァンラーレ八戸": "八戸",
  "八戸": "八戸"
};

/*
 * スタジアム座標
 *
 * ここに無い場合でも、
 * ホームチームの都市座標をフォールバックとして使う。
 */
const VENUE_COORDS = {
  "ベススタ": {
    name: "ベスト電器スタジアム",
    latitude: 33.5859,
    longitude: 130.4606
  },

  "埼玉": {
    name: "埼玉スタジアム2002",
    latitude: 35.9030,
    longitude: 139.7167
  },

  "味スタ": {
    name: "味の素スタジアム",
    latitude: 35.6644,
    longitude: 139.5272
  },

  "アイスタ": {
    name: "IAIスタジアム日本平",
    latitude: 34.9868,
    longitude: 138.4817
  },

  "ＪＦＥス": {
    name: "JFE晴れの国スタジアム",
    latitude: 34.6583,
    longitude: 133.9195
  },

  "日産ス": {
    name: "日産スタジアム",
    latitude: 35.5101,
    longitude: 139.6064
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

  "水戸信ス": {
    name: "水戸信用金庫スタジアム",
    latitude: 36.3498,
    longitude: 140.4068
  },

  "MUFG国立": {
    name: "国立競技場",
    latitude: 35.6786,
    longitude: 139.7147
  },

  "パナスタ": {
    name: "パナソニックスタジアム吹田",
    latitude: 34.8057,
    longitude: 135.5407
  },

  "ＮＤスタ": {
    name: "ＮＤソフトスタジアム山形",
    latitude: 38.2558,
    longitude: 140.3695
  },

  "藤枝サ": {
    name: "藤枝総合運動公園サッカー場",
    latitude: 34.8500,
    longitude: 138.2490
  },

  "デンカＳ": {
    name: "デンカビッグスワンスタジアム",
    latitude: 37.8830,
    longitude: 139.0581
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

  "アシさと": {
    name: "アシックス里山スタジアム",
    latitude: 34.0686,
    longitude: 133.0008
  },

  "Ｇスタ": {
    name: "町田GIONスタジアム",
    latitude: 35.5967,
    longitude: 139.4347
  }
};

/*
 * スタジアムが新しくなった場合などのための
 * ホームタウン座標フォールバック
 */
const TEAM_COORDS = {
  "福岡": { latitude: 33.5902, longitude: 130.4017 },
  "浦和": { latitude: 35.8617, longitude: 139.6455 },
  "東京V": { latitude: 35.6895, longitude: 139.6917 },
  "清水": { latitude: 34.9756, longitude: 138.3828 },
  "千葉": { latitude: 35.6073, longitude: 140.1063 },
  "岡山": { latitude: 34.6551, longitude: 133.9195 },
  "京都": { latitude: 35.0116, longitude: 135.7681 },
  "FC東京": { latitude: 35.6644, longitude: 139.5272 },
  "名古屋": { latitude: 35.1815, longitude: 136.9066 },
  "長崎": { latitude: 32.7503, longitude: 129.8777 },
  "C大阪": { latitude: 34.6937, longitude: 135.5023 },
  "横浜FM": { latitude: 35.4437, longitude: 139.6380 },
  "水戸": { latitude: 36.3659, longitude: 140.4712 },
  "町田": { latitude: 35.5466, longitude: 139.4386 },
  "柏": { latitude: 35.8676, longitude: 139.9756 },
  "G大阪": { latitude: 34.7025, longitude: 135.4959 },
  "神戸": { latitude: 34.6901, longitude: 135.1955 },
  "山形": { latitude: 38.2554, longitude: 140.3396 },
  "富山": { latitude: 36.6953, longitude: 137.2113 },
  "藤枝": { latitude: 34.8677, longitude: 138.2577 },
  "大宮": { latitude: 35.9069, longitude: 139.6234 },
  "新潟": { latitude: 37.9161, longitude: 139.0364 },
  "磐田": { latitude: 34.7179, longitude: 137.8515 },
  "甲府": { latitude: 35.6639, longitude: 138.5684 },
  "徳島": { latitude: 34.0703, longitude: 134.5549 },
  "鹿島": { latitude: 35.9680, longitude: 140.6440 },
  "川崎F": { latitude: 35.5308, longitude: 139.7029 },
  "横浜FC": { latitude: 35.4437, longitude: 139.6380 },
  "湘南": { latitude: 35.3387, longitude: 139.3829 },
  "鳥栖": { latitude: 33.3770, longitude: 130.5060 },
  "今治": { latitude: 34.0661, longitude: 132.9978 },
  "いわき": { latitude: 37.0505, longitude: 140.8877 },
  "秋田": { latitude: 39.7200, longitude: 140.1026 },
  "八戸": { latitude: 40.5120, longitude: 141.4884 }
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

  // TEAM_ALIASES側も同じ正規化をして比較する
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    if (basicNormalize(alias) === raw) {
      return canonical;
    }
  }

  return raw;
}

function sameTeam(a, b) {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);

  if (na === nb) return true;

  /*
   * 最後の保険。
   * 例：
   * アビスパ福岡 ↔ 福岡
   * サンフレッチェ広島 ↔ 広島
   */
  if (na.length >= 2 && nb.includes(na)) return true;
  if (nb.length >= 2 && na.includes(nb)) return true;

  return false;
}

/*
 * 年はtoto側で決め打ちしない。
 * 月日＋ホーム＋アウェイでJ.League側を探す。
 */
function findMatch(match, jleague) {
  const totoDate = String(match.date || "");

  const parts = totoDate.split("/");
  if (parts.length !== 2) return null;

  const month = String(Number(parts[0])).padStart(2, "0");
  const day = String(Number(parts[1])).padStart(2, "0");

  for (const league of jleague.leagues || []) {
    for (const game of league.matches || []) {
      if (!game.date) continue;

      const gameMonthDay = String(game.date).slice(5);

      if (gameMonthDay !== `${month}-${day}`) {
        continue;
      }

      if (
        sameTeam(match.home, game.home) &&
        sameTeam(match.away, game.away)
      ) {
        return game;
      }
    }
  }

  return null;
}

function getCoordinates(stadium, homeTeam) {
  const stadiumKey = basicNormalize(stadium);

  /*
   * ① 正確なスタジアム座標
   */
  for (const [key, value] of Object.entries(VENUE_COORDS)) {
    if (basicNormalize(key) === stadiumKey) {
      return {
        ...value,
        source: "stadium"
      };
    }
  }

  /*
   * ② スタジアム名の部分一致
   */
  for (const [key, value] of Object.entries(VENUE_COORDS)) {
    const normalizedKey = basicNormalize(key);

    if (
      stadiumKey.includes(normalizedKey) ||
      normalizedKey.includes(stadiumKey)
    ) {
      return {
        ...value,
        source: "stadium"
      };
    }
  }

  /*
   * ③ ホームタウン座標へフォールバック
   */
  const team = normalizeTeam(homeTeam);

  if (TEAM_COORDS[team]) {
    return {
      name: `${team} ホームタウン`,
      latitude: TEAM_COORDS[team].latitude,
      longitude: TEAM_COORDS[team].longitude,
      source: "team_city_fallback"
    };
  }

  return null;
}

function nearestHourlyIndex(times, targetDate, kickoff) {
  if (!kickoff) return -1;

  const match = String(kickoff).match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return -1;

  const targetHour = Number(match[1]);
  const targetMinute = Number(match[2]);
  const targetMinutes = targetHour * 60 + targetMinute;

  let bestIndex = -1;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const time = String(times[i]);

    if (!time.startsWith(targetDate)) {
      continue;
    }

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

async function fetchWeather(coords, date, kickoff) {
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

    /*
     * Open-Meteoは最大16日先まで取得可能。
     */
    forecast_days: "16"
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

  /*
   * KICK OFFが未定なら、
   * その日の昼12時付近を代表値として保存。
   *
   * 予測モデルではまだ使わない。
   */
  if (!kickoff) {
    const index = data.hourly.time.findIndex(
      time => String(time).startsWith(date + "T12:")
    );

    if (index === -1) {
      return {
        available: false,
        reason: "date_not_in_forecast"
      };
    }

    const weatherCode = data.hourly.weather_code?.[index];

    return {
      available: true,
      kickoff_known: false,
      forecast_time: data.hourly.time[index],
      temperature_c: data.hourly.temperature_2m?.[index] ?? null,
      precipitation_mm: data.hourly.precipitation?.[index] ?? null,
      precipitation_probability:
        data.hourly.precipitation_probability?.[index] ?? null,
      wind_speed_kmh: data.hourly.wind_speed_10m?.[index] ?? null,
      weather_code: weatherCode ?? null,
      weather_description:
        WEATHER_CODES[weatherCode] ?? "Unknown"
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
    kickoff_known: true,
    forecast_time: data.hourly.time[index],

    temperature_c:
      data.hourly.temperature_2m?.[index] ?? null,

    precipitation_mm:
      data.hourly.precipitation?.[index] ?? null,

    precipitation_probability:
      data.hourly.precipitation_probability?.[index] ?? null,

    wind_speed_kmh:
      data.hourly.wind_speed_10m?.[index] ?? null,

    weather_code:
      weatherCode ?? null,

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

      console.log(
        `${match.number}. ${match.home} vs ${match.away} -> NO MATCH`
      );

      continue;
    }

    const stadium = game.stadium || "";
    const kickoff = game.kickoff || null;
    const date = game.date;

    const coords = getCoordinates(
      stadium,
      game.home
    );

    if (!coords) {
      results.push({
        number: match.number,
        date: match.date,
        home: match.home,
        away: match.away,
        kickoff,
        stadium,
        available: false,
        reason: "coordinates_not_found"
      });

      console.log(
        `${match.number}. ${match.home} vs ${match.away} -> COORDINATES NOT FOUND`
      );

      continue;
    }

    try {
      const weather = await fetchWeather(
        coords,
        date,
        kickoff
      );

      results.push({
        number: match.number,
        date: match.date,
        jleague_date: date,

        home: match.home,
        away: match.away,

        kickoff,
        stadium,

        location_source: coords.source,
        weather_location: coords.name,
        latitude: coords.latitude,
        longitude: coords.longitude,

        ...weather
      });

      console.log(
        `${match.number}. ${match.home} vs ${match.away} -> ${
          weather.available
            ? `OK (${weather.weather_description}, ${weather.temperature_c}℃)`
            : weather.reason
        }`
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
        reason: `fetch_error: ${error.message}`
      });

      console.log(
        `${match.number}. ${match.home} vs ${match.away} -> ERROR: ${error.message}`
      );
    }
  }

  const availableCount = results.filter(
    item => item.available
  ).length;

  const output = {
    fetched_at: new Date().toISOString(),

    source: "Open-Meteo",

    note:
      "Weather is currently recorded as an environment signal. It does not directly modify prediction probabilities yet.",

    available: `${availableCount}/${results.length}`,

    matches: results
  };

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log("");
  console.log(
    `Weather available: ${availableCount}/${results.length}`
  );

  console.log(
    `Saved: ${OUT_PATH}`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
