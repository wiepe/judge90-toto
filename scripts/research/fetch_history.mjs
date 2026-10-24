import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { fetchText } from '../lib/http.mjs';
import { teamRegistry } from '../lib/teams.mjs';
const sha = s=>createHash('sha256').update(s).digest('hex');
const registry=teamRegistry();
export function identity(name) {
  try { return registry(name).id; } catch { return 'j90hist-'+sha(name.normalize('NFKC').replace(/\s/g,'')).slice(0,12); }
}
export function parseHistory(html,season,league) {
  const $=load(html), result=[];
  $('tr').each((_,tr)=>{
    const cells=$(tr).children('td').map((_,td)=>$(td).text().replace(/\s+/g,' ').trim()).get();
    if(cells.length<9)return;
    const [year,competition,section,dateText,kickoff,home,score,away,stadium]=cells;
    if(year!==String(season))return;
    if(!competition.normalize('NFKC').includes(league))return;
    if(/カップ|プレーオフ|チャンピオン|入替|昇格/.test(competition))return;
    const date=/^(\d{2})\/(\d{2})\/(\d{2})/.exec(dateText),goals=/^(\d+)\s*-\s*(\d+)$/.exec(score);
    if(!date||!goals)return;
    const match_date=`20${date[1]}-${date[2]}-${date[3]}`;
    if(!match_date.startsWith(String(season)))throw new Error('Season/date mismatch');
    const home_team_id=identity(home),away_team_id=identity(away);
    result.push({id:sha(`${season}|${league}|${match_date}|${home_team_id}|${away_team_id}`).slice(0,20),season,league,date:match_date,kickoff,home,away,home_team_id,away_team_id,home_goals:Number(goals[1]),away_goals:Number(goals[2]),competition,section,stadium});
  });
  return result;
}
export async function fetchHistory(output='research/data',cache='work/history-cache') {
  mkdirSync(output,{recursive:true});mkdirSync(cache,{recursive:true});
  const sources=[],matches=[];
  for(const season of [2022,2023,2024,2025])for(const [frame,league] of [[1,'J1'],[2,'J2'],[3,'J3']]){
    const url=`https://data.j-league.or.jp/SFMS01/search?competition_frame_ids=${frame}&competition_years=${season}`;
    const path=join(cache,`${season}-${league}.html`);
    let html;
    if(existsSync(path))html=readFileSync(path,'utf8');
    else {html=await fetchText(url);writeFileSync(path,html);}
    const rows=parseHistory(html,season,league);
    // Full regular-season round robin. Reject truncation, playoff pollution and parse failures.
    const n=new Set(rows.flatMap(m=>[m.home_team_id,m.away_team_id])).size;
    if(n<18||n>22||rows.length!==n*(n-1))throw new Error(`Incomplete ${season} ${league}: ${rows.length} matches / ${n} teams`);
    if(new Set(rows.map(m=>m.id)).size!==rows.length)throw new Error('Duplicate historical match');
    matches.push(...rows);sources.push({season,league,url,fetched_at:new Date().toISOString(),response_sha256:sha(html),matches:rows.length,teams:n});
    console.log(`${season} ${league}: ${rows.length} matches, ${n} teams`);
  }
  matches.sort((a,b)=>a.date.localeCompare(b.date)||a.league.localeCompare(b.league)||a.id.localeCompare(b.id));
  const raw=matches.map(m=>JSON.stringify(m)).join('\n')+'\n';
  writeFileSync(join(output,'matches.jsonl.gz'),gzipSync(raw,{mtime:0}));
  writeFileSync(join(output,'manifest.json'),JSON.stringify({schema_version:1,source:'J.League Data Site',retrieved_at:new Date().toISOString(),dataset_sha256:sha(raw),matches:matches.length,sources,license_note:'Factual match records only. No page HTML, images, credentials or team statistics distributed. Source rights and access conditions remain applicable.',as_of_limitation:'Retrospective final results; original result publication/correction timestamps unavailable.'},null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){await fetchHistory(process.argv[2],process.argv[3]);}
