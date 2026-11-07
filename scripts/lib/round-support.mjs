import { load } from 'cheerio';
import { fetchText } from './http.mjs';
import { matchFixture, teamRegistry } from './teams.mjs';

export const gameInfoURL = id => {
  if (!/^\d+$/.test(String(id))) throw new Error('Invalid official game ID');
  return 'https://store.toto-dream.com/dcs/subos/screen/pi03/spin002/PGSPIN00201InitRivalTeamData.form?popup=disp&gameid='+id;
};

// Only an explicit, identity-checked official cup label establishes unsupported
// scope. Missing fixtures, unknown clubs, malformed pages and access failures
// remain errors; none can masquerade as a healthy waiting state.
export function verifyCupGame(html, match, resolve=teamRegistry()) {
  const $=load(html);
  const heading=$('#contents table.type1').first().children('thead').find('th');
  const title=heading.text().replace(/\s+/g,' ').trim();
  if(heading.length!==1 || !/^リーグカップ戦\s*-/.test(title)) throw new Error('Missing league fixture; official competition is not verified as league cup');
  const date=/(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(title);
  if(!date || `${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`!==match.match_date) throw new Error('Official cup date mismatch');
  const name=selector=>{
    const values=$(selector).map((_,e)=>$(e).text().trim()).get().filter(x=>/^.+勝ち$/.test(x));
    if(values.length!==1) throw new Error('Official cup team identity missing/ambiguous');
    return values[0].replace(/勝ち$/,'');
  };
  if(resolve(name('td.win1')).id!==resolve(match.home).id || resolve(name('td.win2')).id!==resolve(match.away).id) throw new Error('Official cup teams mismatch');
  return {number:match.number,home:match.home,away:match.away,match_date:match.match_date,official_game_id:match.official_game_id,competition:'league_cup',label:'リーグカップ戦',source_url:gameInfoURL(match.official_game_id)};
}

export async function inspectRoundSupport(round,fixtures,{fetcher=fetchText}={}) {
  if(round.matches?.length!==13) throw new Error('Support check requires 13 official matches');
  const unsupported=[];
  for(const match of round.matches){
    try{matchFixture(match,fixtures);}
    catch(e){
      // Ambiguous matches, completed games and registry errors need a fix.
      if(!/^Fixture must match exactly once:.*\(0\)$/.test(e.message)) throw e;
      unsupported.push(verifyCupGame(await fetcher(gameInfoURL(match.official_game_id)),match));
    }
  }
  return {supported:unsupported.length===0,unsupported};
}
