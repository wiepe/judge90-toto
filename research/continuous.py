"""Registered shadow forecasts; historical development never evaluates 2025 again.
Weekly reports are descriptive. One fixed future-window test may create a review proposal.
"""
import argparse, hashlib, json, math
from pathlib import Path
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import numpy as np
from scipy.optimize import minimize
from evaluate import load_matches,run_period,summarize as base_summarize,macro_logloss,metrics
from models import GoalModel,Current,Elo,LeagueMean,OUTCOMES,argmax,outcome
ROOT=Path(__file__).resolve().parent
BASE={
 'current':{'family':'current','parameters':{}},
 'league_mean':{'family':'league_mean','parameters':{}},
 'elo':{'family':'elo','parameters':{'k':24,'home':60,'draw_prior':.30}},
 'poisson':{'family':'poisson','parameters':{'decay_days':365,'ridge':5}},
 'dixon_coles':{'family':'dixon_coles','parameters':{'decay_days':365,'ridge':5}}}

def summarize(rows):
    report=base_summarize(rows)
    for league,summary in [('ALL',report['overall']),*report['by_league'].items()]:
        group=rows if league=='ALL' else [r for r in rows if r['league']==league]
        summary['draw_brier']=float(np.mean([(r['p']['0']-int(r['actual']=='0'))**2 for r in group])) if group else None
        summary['draw_calibration']=[]
        for i in range(10):
            part=[r for r in group if min(9,int(r['p']['0']*10))==i]
            if part:summary['draw_calibration'].append({'lower':i/10,'upper':(i+1)/10,'n':len(part),'mean_probability':float(np.mean([r['p']['0'] for r in part])),'observed_draw_rate':float(np.mean([r['actual']=='0' for r in part]))})
    return report

def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha(x):return hashlib.sha256(canonical(x).encode()).hexdigest()
def write(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n');tmp.replace(path)
def sources():return {p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in ['models.py','continuous.py','continuous/protocol.json']}
def validate_p(p):
    if set(p)!=set(OUTCOMES) or any(not math.isfinite(p[k]) or not 0<=p[k]<=1 for k in OUTCOMES) or abs(sum(p.values())-1)>1e-6:raise ValueError('Invalid probability vector')
    return p

def calibrated(p,parameters):
    validate_p(p);z=np.array([math.log(max(1e-12,p[k]))/parameters['temperature']+(parameters['draw_bias'] if k=='0' else 0) for k in OUTCOMES]);z-=z.max();v=np.exp(z);v/=v.sum();return dict(zip(OUTCOMES,map(float,v)))
def fit_calibration(rows,allowed_years=None):
    allowed_years=allowed_years or [2023]
    if 2025 in allowed_years or not rows or any(int(r['date'][:4]) not in allowed_years for r in rows):raise ValueError('Calibration must use declared past out-of-time predictions; 2025 excluded')
    def objective(x):
        pars={'temperature':math.exp(x[0]),'draw_bias':x[1]}
        return np.mean([-math.log(max(1e-15,calibrated(r['p'],pars)[r['actual']])) for r in rows])+.001*float(x@x)
    result=minimize(objective,[0.,0.],method='L-BFGS-B',bounds=[(math.log(.4),math.log(3)),(-1.,1.)])
    if not result.success:raise ValueError('Calibration did not converge')
    return {'temperature':float(math.exp(result.x[0])),'draw_bias':float(result.x[1]),'fit_period':allowed_years,'n':len(rows)}
def blend(records):
    ids=[r['id'] for r in records['elo']]
    if any([r['id'] for r in records[n]]!=ids for n in ('poisson','dixon_coles')):raise ValueError('Unpaired ensemble')
    return [{**r,'p':{k:sum(records[n][i]['p'][k] for n in ('elo','poisson','dixon_coles'))/3 for k in OUTCOMES}} for i,r in enumerate(records['elo'])]
def extend(records,calibration=None):
    records={**records,'ensemble':blend(records)}
    if calibration:
        for name,base in [('calibrated_ensemble','ensemble'),('calibrated_dc','dixon_coles')]:records[name]=[{**r,'p':calibrated(r['p'],calibration[name])} for r in records[base]]
    return records

def register(output):
    protocol=json.loads((ROOT/'continuous/protocol.json').read_text());allmatches,manifest=load_matches()
    # A hard filter prevents even run_period from receiving previously exposed 2025 outcomes.
    development=[m for m in allmatches if int(m['date'][:4])<=2024]
    audit=[];train,_=run_period(development,BASE,[2023],audit);train=extend(train)
    calibration={name:fit_calibration(train[base]) for name,base in [('calibrated_ensemble','ensemble'),('calibrated_dc','dixon_coles')]}
    validation,_=run_period(development,BASE,[2024],audit);validation=extend(validation,calibration)
    candidates=[n for n in validation if n not in ('current','league_mean')]
    selected=min(candidates,key=lambda n:(macro_logloss(validation[n]),n))
    report={'schema_version':1,'cycle':0,'registered_at':datetime.now(timezone.utc).isoformat(),'protocol':protocol,'base_models':BASE,'ensemble_weights':{'elo':1/3,'poisson':1/3,'dixon_coles':1/3},'calibration':calibration,'selected':selected,'selection_period':'2024 development only; not unused performance','selection':{n:summarize(r) for n,r in validation.items()},'calibration_audit':{'period':2023,'prediction_rows':len(train['current'])},'development_matches':len(development),'dataset_sha256':manifest['dataset_sha256'],'sources':sources(),'production_model_changed':False,'decision':'collect_new_prospective_data','fit_audit':audit}
    report['experiment_id']=sha(report);write(output,report)
    for n,s in report['selection'].items():print(n,s['overall'])
    return report

def match_id(m):return '|'.join(str(m[k]) for k in ('league','date','home_team_id','away_team_id'))
def live_matches(fixtures):
    result=[]
    for league in fixtures['leagues']:
        for m in league['matches']:
            item={**m,'league':league['league'],'id':match_id({**m,'league':league['league']})}
            score=__import__('re').fullmatch(r'(\d+)\s*-\s*(\d+)',m.get('score') or '')
            if score:item.update(home_goals=int(score[1]),away_goals=int(score[2]))
            result.append(item)
    if len({m['id'] for m in result})!=len(result):raise ValueError('Duplicate official fixtures')
    return result

def forecast(history,targets,registration,cutoff):
    if any(m['date']>=cutoff for m in history) or any(m['date']<=cutoff for m in targets):raise ValueError('Temporal cutoff violated')
    states={'current':Current(),'league_mean':LeagueMean(),'elo':Elo(**BASE['elo']['parameters'])}
    for m in sorted(history,key=lambda m:(m['date'],m['id'])):
        for s in states.values():s.update(m)
    fitted={}
    for league in sorted({m['league'] for m in targets}):
        past=[m for m in history if m['league']==league]
        for n in ('poisson','dixon_coles'):fitted[(league,n)]=GoalModel(n,**BASE[n]['parameters']).fit(past,cutoff)
    rows=[]
    for m in targets:
        p={n:s.predict(m) for n,s in states.items()}
        for n in ('poisson','dixon_coles'):p[n]=fitted[(m['league'],n)].predict(m)
        p['ensemble']={k:sum(p[n][k] for n in ('elo','poisson','dixon_coles'))/3 for k in OUTCOMES}
        for n,b in [('calibrated_ensemble','ensemble'),('calibrated_dc','dixon_coles')]:p[n]=calibrated(p[b],registration['calibration'][n])
        for v in p.values():validate_p(v)
        rows.append({'id':m['id'],'date':m['date'],'league':m['league'],'home':m['home'],'away':m['away'],'home_team_id':m['home_team_id'],'away_team_id':m['away_team_id'],'models':p})
    return rows

def paired_block_ci(candidate,baseline,reps=4000,seed=902027,alpha=.025):
    if [r['id'] for r in candidate]!=[r['id'] for r in baseline] or not candidate:raise ValueError('Unpaired or empty evaluation')
    days={}
    for c,b in zip(candidate,baseline):days.setdefault(c['date'],[]).append(-math.log(max(1e-15,c['p'][c['actual']]))+math.log(max(1e-15,b['p'][b['actual']])))
    sums=np.array([sum(v) for v in days.values()]);counts=np.array([len(v) for v in days.values()]);rng=np.random.default_rng(seed);est=[]
    for _ in range(reps):ix=rng.integers(0,len(sums),len(sums));est.append(float(sums[ix].sum()/counts[ix].sum()))
    return {'difference':float(sums.sum()/counts.sum()),'ci':list(map(float,np.quantile(est,[alpha/2,1-alpha/2]))),'confidence_level':1-alpha,'date_blocks':len(days),'replicates':reps}

def promotion(rows,registration,now):
    protocol=registration['protocol'];names=list(rows);selected=registration['selected']
    reference=[(r['id'],r['date'],r['league'],r['actual']) for r in rows['current']]
    if any([(r['id'],r['date'],r['league'],r['actual']) for r in group]!=reference for group in rows.values()):raise ValueError('Models must use exactly paired fixtures and outcomes')
    if any(not protocol['prospective_start']<=r['date']<=protocol['prospective_end'] for group in rows.values() for r in group):raise ValueError('Previously exposed or out-of-window outcomes cannot confirm a candidate')
    eligible=now.date().isoformat()>=protocol['decision_not_before']
    report={'decision':'collect_new_prospective_data','proposal_eligible':False,'selected':selected,'experiment_id':registration['experiment_id'],'production_model_changed':False,'checks':{},'metrics':{n:summarize(r) for n,r in rows.items()},'limitations':[protocol['warning']]}
    if not eligible:return report
    c=report['metrics'][selected];b=report['metrics']['current'];mean=report['metrics']['league_mean'];g=protocol
    enough=all(c['by_league'][l].get('n',0)>=g['minimum_matches_per_league'] for l in ('J1','J2','J3'))
    if not enough:report['decision']='retain_current_insufficient_samples';return report
    cycle=registration.get('cycle',0);alpha=g['lifetime_alpha_budget']/((cycle+1)*(cycle+2))
    reps=min(g['maximum_bootstrap_replicates'],max(g['bootstrap_replicates'],math.ceil(40/alpha)))
    cis={n:paired_block_ci(rows[selected],rows[n],reps,g['bootstrap_seed'],alpha) for n in ('current','league_mean')}
    checks={'minimum_samples':enough,'bootstrap_tail_resolution':reps*alpha/2>=20,'draw_brier_not_worse':all(c['overall']['draw_brier']<=x['overall']['draw_brier'] for x in (b,mean)),'minimum_date_blocks':all(ci['date_blocks']>=30 for ci in cis.values()),'logloss_improves':all(c['overall']['logloss']<=x['overall']['logloss']*(1-g['minimum_relative_logloss_improvement']) for x in (b,mean)),'brier_improves':all(c['overall']['brier']<x['overall']['brier'] for x in (b,mean)),'accuracy_not_lower':all(c['overall']['accuracy']>=x['overall']['accuracy'] for x in (b,mean)),'draw_recall_improves':c['overall']['draw_recall'] is not None and b['overall']['draw_recall'] is not None and c['overall']['draw_recall']>b['overall']['draw_recall'],'no_league_regression':all(c['by_league'][l]['logloss']<=x['by_league'][l]['logloss']+g['maximum_league_logloss_regression'] for x in (b,mean) for l in ('J1','J2','J3')),'paired_ci_below_zero':all(ci['ci'][1]<0 for ci in cis.values())}
    report.update(checks=checks,alpha=alpha,bootstrap=cis,proposal_eligible=all(checks.values()),decision='propose_review_only' if all(checks.values()) else 'retain_current');return report

def next_registration(rows,registration,now):
    nextreg=json.loads(json.dumps(registration));nextreg['cycle']=registration.get('cycle',0)+1
    nextreg['root_experiment_id']=registration.get('root_experiment_id',registration['experiment_id']);nextreg['parent_experiment_id']=registration['experiment_id'];nextreg['registered_at']=now.isoformat()
    days=sorted({r['date'] for r in rows['current']})
    if len(days)>=30:
        split=days[max(1,int(len(days)*.6))]
        early={n:[r for r in group if r['date']<split] for n,group in rows.items()}
        late={n:[r for r in group if r['date']>=split] for n,group in rows.items()}
        years=sorted({int(r['date'][:4]) for r in early['current']})
        calibration={n:fit_calibration(early[base],years) for n,base in [('calibrated_ensemble','ensemble'),('calibrated_dc','dixon_coles')]}
        for n,base in [('calibrated_ensemble','ensemble'),('calibrated_dc','dixon_coles')]:late[n]=[{**r,'p':calibrated(r['p'],calibration[n])} for r in late[base]]
        # Every league must be present in the selection slice; otherwise keep frozen settings.
        if all(any(r['league']==league for r in late['current']) for league in ('J1','J2','J3')):
            nextreg['selected']=min((n for n in late if n not in ('current','league_mean')),key=lambda n:(macro_logloss(late[n]),n))
            nextreg['calibration']=calibration;nextreg['selection']={n:summarize(group) for n,group in late.items()}
            nextreg['selection_period']=f"Previously tested window becomes development only: {split}..{days[-1]}; never confirmation twice"
            nextreg['calibration_audit']={'first_date':days[0],'last_date':early['current'][-1]['date'],'split':split}
    start=now.astimezone(ZoneInfo('Asia/Tokyo')).date()+timedelta(days=registration['protocol']['next_window_lead_days'])
    end=start+timedelta(days=registration['protocol']['next_window_days'])
    nextreg['protocol'].update(prospective_start=start.isoformat(),prospective_end=end.isoformat(),decision_not_before=(end+timedelta(days=7)).isoformat())
    nextreg.pop('experiment_id',None);nextreg['experiment_id']=sha(nextreg);return nextreg

def weekly(root,fixtures_path,now=None):
    root=Path(root);now=now or datetime.now(timezone.utc);today=now.astimezone(ZoneInfo('Asia/Tokyo')).date().isoformat()
    registration=json.loads((ROOT/'continuous/registration.json').read_text())
    registry=root/'data/research/registrations'
    archived=[json.loads(f.read_text()) for f in sorted(registry.glob('*.json'))] if registry.exists() else []
    root_experiment_id=registration['experiment_id']
    for r in sorted((r for r in archived if r.get('root_experiment_id')==root_experiment_id),key=lambda r:r.get('cycle',0)):
        if datetime.fromisoformat(r['registered_at'])<=now:registration=r
    if registration['sources']!=sources():raise ValueError('Registered model code changed; freeze a NEW experiment and unused window before collecting forecasts')
    if datetime.fromisoformat(registration['registered_at']).astimezone(ZoneInfo('Asia/Tokyo')).date().isoformat()>=registration['protocol']['prospective_start']:raise ValueError('Registration must precede the unused evaluation window')
    directory=root/'data/research';directory.mkdir(parents=True,exist_ok=True)
    fixtures=json.loads(Path(fixtures_path).read_text());age=(now-datetime.fromisoformat(fixtures['fetched_at'].replace('Z','+00:00'))).total_seconds()
    if not -60<=age<=21600:raise ValueError('Research fixture source stale')
    source_id=sha(fixtures);source_path=directory/'sources'/f'{source_id}.json'
    if not source_path.exists():write(source_path,fixtures)
    live=live_matches(fixtures);historical,_=load_matches()
    history=historical+[m for m in live if m['date']<today and 'home_goals' in m]
    targets=[m for m in live if today<m['date']<=(now.astimezone(ZoneInfo('Asia/Tokyo')).date()+timedelta(days=8)).isoformat() and 'home_goals' not in m]
    predictions=forecast(history,targets,registration,today) if targets else []
    bundle={'experiment_id':registration['experiment_id'],'generated_at':now.isoformat(),'training_cutoff':today,'source_id':source_id,'matches':predictions}
    write(directory/'forecasts'/f'{sha(bundle)}.json',bundle)
    # First forecast per fixture is fixed; later forecasts remain available but cannot replace it for testing.
    first={}
    for file in sorted((directory/'forecasts').glob('*.json')):
        snapshot=json.loads(file.read_text())
        if snapshot['experiment_id']!=registration['experiment_id']:continue
        for m in snapshot['matches']:
            created=datetime.fromisoformat(snapshot['generated_at']).astimezone(ZoneInfo('Asia/Tokyo')).date().isoformat()
            if not(snapshot['training_cutoff']==created and created<m['date']):continue
            if m['id'] not in first or snapshot['generated_at']<first[m['id']]['generated_at']:first[m['id']]={**m,'generated_at':snapshot['generated_at']}
    outcomes_path=directory/'outcomes.json';outcomes=json.loads(outcomes_path.read_text()) if outcomes_path.exists() else {}
    for m in live:
        if m['date']<today and 'home_goals' in m:
            value={'actual':outcome(m),'score':[m['home_goals'],m['away_goals']],'source_id':source_id}
            if outcomes.get(m['id'],{}).get('score')!=value['score']:write(directory/'outcome-history'/f'{sha([m["id"],value])}.json',{'id':m['id'],**value,'observed_at':now.isoformat()})
            outcomes[m['id']]=value
    write(outcomes_path,outcomes)
    names=[*BASE,'ensemble','calibrated_ensemble','calibrated_dc'];rows={n:[] for n in names}
    for m in sorted(first.values(),key=lambda m:(m['date'],m['id'])):
        if not registration['protocol']['prospective_start']<=m['date']<=registration['protocol']['prospective_end'] or m['id'] not in outcomes:continue
        for n in names:rows[n].append({'id':m['id'],'date':m['date'],'league':m['league'],'actual':outcomes[m['id']]['actual'],'p':m['models'][n]})
    decision_path=directory/'decisions'/f'{registration["experiment_id"]}.json'
    if decision_path.exists():report=json.loads(decision_path.read_text())
    else:
        report=promotion(rows,registration,now)
        if today>=registration['protocol']['decision_not_before']:
            write(decision_path,report)
            nextreg=next_registration(rows,registration,now)
            write(directory/'registrations'/f'{nextreg["experiment_id"]}.json',nextreg)
    report={**report,'checked_at':now.isoformat(),'shadow_only':True,'pending_forecasts':len(first),'source_id':source_id,'training_cutoff':today,'upcoming':predictions,'status':'success'}
    write(directory/'status.json',{'state':'success','checked_at':now.isoformat()});write(directory/'report.json',report)
    write(directory/'reports'/f'{sha(report)}.json',report)
    proposal=root/'research/proposed-model.json'
    if report['proposal_eligible']:write(proposal,{'experiment_id':registration['experiment_id'],'selected':registration['selected'],'evidence':{k:report[k] for k in ('decision','checks','metrics','bootstrap','limitations')},'approval_required':True,'production_model_changed':False})
    print(report['decision'],len(predictions),'upcoming,',len(rows['current']),'paired settled');return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('register');p.add_argument('--output',default=str(ROOT/'continuous/registration.json'))
    p=sub.add_parser('weekly');p.add_argument('--root',default='.');p.add_argument('--fixtures',default='data/jleague_matches.json')
    args=parser.parse_args()
    if args.command=='register':register(args.output)
    else:
        try:weekly(args.root,args.fixtures)
        except Exception as e:write(Path(args.root)/'data/research/status.json',{'state':'error','checked_at':datetime.now(timezone.utc).isoformat(),'error':str(e)[:500]});raise
