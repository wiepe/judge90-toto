import { load } from 'cheerio';
const text = ($, node) => $(node).text().replace(/\s+/g, ' ').trim();
export function parseToto(html, { expectedRound, now = new Date(), allowClosed = false } = {}) {
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
  if (!allowClosed && (now < new Date(sales_open_at) || now >= new Date(sales_close_at))) throw new Error(`Round ${round} is outside its sales period`);
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

// Follow only round identifiers advertised by the official page, never guess future IDs.
export function advertisedRounds(html) {
  const $=load(html), ids=new Set();
  $('[href],[onclick],option').each((_,el)=>{
    const raw=[$(el).attr('href'),$(el).attr('value'),$(el).attr('onclick')].filter(Boolean).join(' ');
    const match=/[?&]holdCntId=(\d+)/.exec(raw)||/['"]moveTotoSingleHoldCnt['"]\s*,\s*['"](\d+)['"]/.exec(raw);
    if(match)ids.add(match[1]);
  });
  return [...ids].sort((a,b)=>Number(b)-Number(a)).slice(0,8);
}

// Public read-only lot-information page; unlike the purchase form, it honors holdCntId via GET.
export function parseLotInfo(html,{expectedRound,now=new Date(),allowClosed=false}={}) {
  const $=load(html), round=$('#holdCntId').val();
  if(!/^\d+$/.test(round||'')||(expectedRound&&String(expectedRound)!==round))throw new Error('Lot info round mismatch');
  const blocks=$('.kuji-set').filter((_,el)=>$(el).find('a#toto').length===1);
  if(blocks.length===0)throw new Error('This round does not offer 13-match toto');
  if(blocks.length!==1)throw new Error('Ambiguous toto lot information');
  const block=blocks.first();
  if(!block.text().includes(`第${round}回 toto くじ情報`))throw new Error('Lot info product title mismatch');
  const field=label=>{const rows=block.find('tr').filter((_,tr)=>$(tr).children('th').first().text().trim()===label);if(rows.length!==1)throw new Error('Missing sales field '+label);return text($,rows.first().children('td').first()).normalize('NFKC');};
  const date=s=>{const m=/(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(s);if(!m)throw new Error('Invalid sales date');return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;};
  const start=field('販売開始日'),end=field('販売終了日');
  const startTime=/(\d{2}):(\d{2})/.exec(start),endTime=/当サイト\(ネット決済\)\s*(\d{2}):(\d{2})/.exec(end);
  if(!startTime||!endTime)throw new Error('Verified online sales time missing');
  const sales_open_at=date(start)+`T${startTime[1]}:${startTime[2]}:00+09:00`,sales_close_at=date(end)+`T${endTime[1]}:${endTime[2]}:00+09:00`;
  if(!(Date.parse(sales_open_at)<Date.parse(sales_close_at)))throw new Error('Invalid sales interval');
  if(!allowClosed&&!(now>=new Date(sales_open_at)&&now<new Date(sales_close_at)))throw new Error('Lot info outside sales period');
  const matches=[];
  block.find('table.kobetsu-format3 tr').each((_,tr)=>{
    const cells=$(tr).children('td');if(!cells.length)return;
    const number=Number(text($,cells[0]));if(!Number.isInteger(number)||number<1||number>13)throw new Error('Invalid official match number');
    const md=text($,cells[1]);if(!/^\d{2}\/\d{2}$/.test(md)||text($,cells[5]).toUpperCase()!=='VS')throw new Error('Invalid official fixture row');
    const ids=new Set(cells.find('a[onclick]').map((_,el)=>/[?&]gameId=(\d+)/i.exec($(el).attr('onclick'))?.[1]).get().filter(Boolean));if(ids.size!==1)throw new Error('Official game ID missing');
    const [month,day]=md.split('/'),year=+sales_open_at.slice(0,4);
    const dates=[year-1,year,year+1].map(y=>`${y}-${month}-${day}`).filter(d=>{const t=Date.parse(d+'T00:00:00+09:00');return Number.isFinite(t)&&new Date(t+9*3600000).toISOString().slice(0,10)===d&&t>=Date.parse(sales_open_at)-86400000&&t<=Date.parse(sales_close_at)+14*86400000;});
    if(dates.length!==1)throw new Error('Invalid match date');
    matches.push({number,date:md,match_date:dates[0],home:text($,cells[4]),away:text($,cells[6]),official_game_id:[...ids][0]});
  });
  matches.sort((a,b)=>a.number-b.number);
  if(matches.length!==13||matches.some((m,i)=>m.number!==i+1||!m.home||!m.away)||new Set(matches.map(m=>m.official_game_id)).size!==13||new Set(matches.flatMap(m=>[m.home,m.away])).size!==26)throw new Error('Expected unique official matches 1..13');
  return {round_id:round,product:'toto',product_id:'01',sales_open_at,sales_close_at,matches};
}
