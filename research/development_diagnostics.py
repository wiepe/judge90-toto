"""Descriptive diagnostics on exposed development data only; never selects/adopts.
The registered models and 2026-11..2027-05 experiment remain immutable.
"""
import argparse,json,hashlib,math
from pathlib import Path
from collections import defaultdict
from itertools import groupby
from evaluate import load_matches,run_period,metrics
from continuous import BASE,extend,validate_p
ROOT=Path(__file__).resolve().parent

def development_only(matches):
    return [m for m in matches if '2022-01-01'<=m['date']<'2025-01-01']

def entry_flags(matches):
    """A team absent from this league's previous data season; not a promotion fact."""
    members=defaultdict(set)
    for m in matches:
        members[(int(m['date'][:4]),m['league'])].update([m['home_team_id'],m['away_team_id']])
    return {m['id']:any(t not in members[(int(m['date'][:4])-1,m['league'])] for t in [m['home_team_id'],m['away_team_id']]) for m in matches}

def diagnose(rows):
    result={k:v for k,v in metrics(rows).items() if k!='calibration_bins'}
    result['calibration']={};result['low_probability_events']={}
    for label in ['1','0','2']:
        bins=[]
        for i in range(10):
            group=[r for r in rows if min(9,int(r['p'][label]*10))==i]
            if group:bins.append({'lower':i/10,'n':len(group),'mean_probability':sum(r['p'][label] for r in group)/len(group),'observed_rate':sum(r['actual']==label for r in group)/len(group)})
        result['calibration'][label]={'bins':bins,'ece':sum(b['n']*abs(b['mean_probability']-b['observed_rate']) for b in bins)/len(rows) if rows else None}
        rare=[r for r in rows if r['p'][label]<=.15]
        result['low_probability_events'][label]={'n':len(rare),'expected_count':sum(r['p'][label] for r in rare),'observed_count':sum(r['actual']==label for r in rare),'threshold':.15}
    return result

def generate(output):
    matches,manifest=load_matches();past=development_only(matches)
    # Filter BEFORE fitting, including calibration or feature construction.
    if any(int(m['date'][:4])>2024 for m in past):raise ValueError('Exposed final evaluation data entered development')
    registration=json.loads((ROOT/'continuous/registration.json').read_text())
    if registration['selection_period']!='2024 development only; not unused performance':raise ValueError('Unexpected development registration')
    audit=[];records,_=run_period(past,BASE,[2024],audit);records=extend(records,registration['calibration'])
    ids=[r['id'] for r in records['current']]
    flags=entry_flags(past)
    reports={}
    for name,rows in records.items():
        if [r['id'] for r in rows]!=ids:raise ValueError('Unpaired comparison')
        for r in rows:validate_p(r['p'])
        reports[name]={'overall':diagnose(rows),'by_league':{l:metrics([r for r in rows if r['league']==l]) for l in ['J1','J2','J3']},'quarters':{str(q):metrics([r for r in rows if (int(r['date'][5:7])-1)//3+1==q]) for q in range(1,5)},'previous_league_season_absent':metrics([r for r in rows if flags[r['id']]]),'previous_league_season_present':metrics([r for r in rows if not flags[r['id']]])}
    report={'schema_version':1,'purpose':'2024 development diagnostics only; not unused evaluation and not candidate selection','initial_training_years':[2022,2023],'within_year_updates':'2024 prior dates only; monthly goal-model refits','prediction_year':2024,'calibration_fit_year':2023,'max_input_date':max(m['date'] for m in past),'dataset_sha256':manifest['dataset_sha256'],'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'registration_experiment_id':registration['experiment_id'],'models':reports,'fit_audit':audit,'decision':'diagnostics_only_retain_current','production_model_changed':False,'limitations':['2025 is excluded before fitting. No new model is selected.','Quarter, league and low-probability slices are descriptive; no confirmatory significance is claimed.','Previous-league-season absence is a data proxy, not official promotion/relegation status.','Research current uses league H2H since 2022, not the exact long-history/cup production feature set.','No retuning of the registered prospective experiment. Future hypotheses require a new untouched window.']}
    path=Path(output);path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n');tmp.replace(path)
    for n,r in reports.items():
        s=r['overall'];print(n,s['n'],round(s['accuracy'],4),round(s['logloss'],6),round(s['brier'],6),s['draw_recall'])
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',default='data/research/diagnostics.json');generate(p.parse_args().output)
