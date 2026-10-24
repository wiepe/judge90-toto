import { load } from 'cheerio';
const text = ($, node) => $(node).text().replace(/\s+/g, ' ').trim();
export function parseToto(html, { expectedRound, now = new Date() } = {}) {
  const $ = load(html);
  const form = $('#PGSPSL00001Form');
  if (form.length !== 1) throw new Error('Official toto form missing/ambiguous');
  const value = name => {
    const inputs = form.find(`input[name="${name}"]`);
    if (inputs.length !== 1) throw new Error(`Missing/ambiguous ${name}`);
    return inputs.val();
  };
  const round = value('thisDispHoldCntId');
  const product = value('commodityId');
  if (!/^\d+$/.test(round || '') || (expectedRound && String(expectedRound) !== round)) throw new Error('Round mismatch/missing');
  if (product !== '01' || value('commodityName') !== 'toto' || value('holdGameRsltCnt') !== '13') throw new Error('Only 13-match toto (commodity 01) is supported');
  const info = form.find('.selecttime tr').filter((_, tr) => $(tr).children('td').length === 5);
  if (info.length !== 1) throw new Error('Sales metadata missing/ambiguous');
  const fields = info.children('td').map((_, td) => text($, td)).get();
  if (fields[0] !== `第${round}回` || fields[1] !== 'toto') throw new Error('Displayed round/product mismatch');
  const dates = [...fields[2].matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/g)];
  if (dates.length !== 2) throw new Error('Sales dates missing');
  const iso = m => `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5]}:00+09:00`;
  const sales_open_at = iso(dates[0]), sales_close_at = iso(dates[1]);
  if (!(Date.parse(sales_open_at) < Date.parse(sales_close_at))) throw new Error('Invalid sales interval');
  if (now < new Date(sales_open_at) || now >= new Date(sales_close_at)) throw new Error(`Round ${round} is outside its sales period`);
  const rows = new Map();
  form.find('tr').each((_, row) => {
    const cells = $(row).children('td');
    if (!/^\d{1,2}\/\d{1,2}$/.test(text($, cells[0]))) return;
    if (text($, cells[2]).toLowerCase() !== 'vs') return;
    const checks = cells.find('input[type="checkbox"]').map((_, i) => $(i).attr('name')).get();
    const indexes = new Set(checks.map(n => /^chkbox_\d+_(\d+)_[012]$/.exec(n)?.[1]).filter(x => x !== undefined));
    if (indexes.size !== 1) throw new Error('Official match number missing/ambiguous');
    const number = Number([...indexes][0]) + 1;
    if (number < 1 || number > 13) throw new Error('Official match number outside 1..13');
    const date = text($, cells[0]);
    const [month, day] = date.split('/').map(Number);
    const year = Number(dates[0][1]);
    const candidates = [year-1, year, year+1].map(y => `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`).filter(d => {
      const time = Date.parse(d + 'T00:00:00+09:00');
      return new Date(time + 9*3600000).toISOString().slice(0,10) === d && time >= Date.parse(sales_open_at) - 86400000 && time <= Date.parse(sales_close_at) + 14*86400000;
    });
    if (candidates.length !== 1) throw new Error(`Invalid/ambiguous match date: ${date}`);
    const ids = new Set(cells.find('a[onclick]').map((_, a) => /[?&]gameid=(\d+)/i.exec($(a).attr('onclick'))?.[1]).get().filter(Boolean));
    if (ids.size !== 1) throw new Error(`Official game ID missing/ambiguous: ${number}`);
    const match = { number, date, match_date: candidates[0], home: text($, cells[1]), away: text($, cells[3]), official_game_id: [...ids][0] };
    if (!match.home || !match.away || match.home === match.away) throw new Error('Invalid teams');
    if (rows.has(number) && JSON.stringify(rows.get(number)) !== JSON.stringify(match)) throw new Error(`Conflicting duplicate match ${number}`);
    rows.set(number, match);
  });
  const matches = [...rows.values()].sort((a,b) => a.number-b.number);
  if (matches.length !== 13 || matches.some((m,i) => m.number !== i+1)) throw new Error(`Expected official match numbers 1..13; found ${matches.length}`);
  if (new Set(matches.map(m => m.official_game_id)).size !== 13 || new Set(matches.flatMap(m => [m.home,m.away])).size !== 26) throw new Error('Duplicate game/team in round');
  return { round_id: round, product: 'toto', product_id: product, sales_open_at, sales_close_at, matches };
}
