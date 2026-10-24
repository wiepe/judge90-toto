"""Frozen, date-batched prequential comparison. Validation selects; holdout gates only."""
import argparse, gzip, hashlib, json, math
from collections import defaultdict
from datetime import date
from itertools import groupby
from pathlib import Path
import numpy as np
from models import GoalModel, Elo, Current, LeagueMean, OUTCOMES, argmax, outcome

ROOT=Path(__file__).resolve().parent

def load_matches(path=ROOT/'data/matches.jsonl.gz'):
    raw=gzip.decompress(Path(path).read_bytes())
    manifest=json.loads(Path(path).with_name('manifest.json').read_text())
    if hashlib.sha256(raw).hexdigest()!=manifest['dataset_sha256']:raise ValueError('Dataset checksum mismatch')
    matches=[json.loads(line) for line in raw.decode().splitlines()]
    if len(matches)!=manifest['matches'] or len({m['id'] for m in matches})!=len(matches):raise ValueError('Match count/identity mismatch')
    if matches!=sorted(matches,key=lambda m:(m['date'],m['league'],m['id'])):raise ValueError('Unsorted data')
    return matches,manifest

def metrics(rows):
    n=len(rows)
    if not n:return {'n':0}
    ys=[r['actual'] for r in rows];picks=[argmax(r['p']) for r in rows]
    ll=[-math.log(max(1e-15,r['p'][r['actual']])) for r in rows]
    brier=[sum((r['p'][k]-int(r['actual']==k))**2 for k in OUTCOMES) for r in rows]
    tp=sum(y=='0' and pick=='0' for y,pick in zip(ys,picks));draws=ys.count('0');drawp=picks.count('0')
    bins=[]
    for lo,hi in [(0,.4),(.4,.5),(.5,.6),(.6,.7),(.7,1.000001)]:
        sub=[r for r in rows if lo<=max(r['p'].values())<hi]
        if sub:bins.append({'lower':lo,'upper':min(1,hi),'n':len(sub),'mean_probability':float(np.mean([max(r['p'].values()) for r in sub])),'observed_accuracy':float(np.mean([argmax(r['p'])==r['actual'] for r in sub]))})
    return {'n':n,'hits':sum(y==pick for y,pick in zip(ys,picks)),'accuracy':sum(y==pick for y,pick in zip(ys,picks))/n,'logloss':float(np.mean(ll)),'brier':float(np.mean(brier)),'draw_actual':draws,'draw_picks':drawp,'draw_hits':tp,'draw_precision':tp/drawp if drawp else None,'draw_recall':tp/draws if draws else None,'calibration_bins':bins}

def summarize(rows):
    return {'overall':metrics(rows),'by_league':{l:metrics([r for r in rows if r['league']==l]) for l in ['J1','J2','J3']}}

def macro_logloss(rows):return float(np.mean([metrics([r for r in rows if r['league']==l])['logloss'] for l in ['J1','J2','J3']]))

def paired_bootstrap(candidate,baseline,replicates=2000):
    if [r['id'] for r in candidate]!=[r['id'] for r in baseline]:raise ValueError('Unpaired comparison')
    # Date blocks preserve dependence across all games played on the same date.
    bydate=defaultdict(list)
    for c,b in zip(candidate,baseline):bydate[c['date']].append(-math.log(c['p'][c['actual']])+math.log(b['p'][b['actual']]))
    sums=np.array([sum(v) for v in bydate.values()]);counts=np.array([len(v) for v in bydate.values()]);rng=np.random.default_rng(902026)
    values=[]
    for _ in range(replicates):
        ix=rng.integers(0,len(sums),len(sums));values.append(float(sums[ix].sum()/counts[ix].sum()))
    return {'mean_candidate_minus_baseline_logloss':float(sums.sum()/counts.sum()),'ci95':list(map(float,np.quantile(values,[.025,.975]))),'block':'match date','replicates':replicates,'seed':902026}

def run_period(matches,models,period,fit_audit):
    """One-day batch forecasts, then results; goal models refit on month boundaries."""
    state={name:(Current() if name=='current' else LeagueMean() if name=='league_mean' else Elo(**spec['parameters']) if spec['family']=='elo' else None) for name,spec in models.items() if name!='home_fixed'}
    fitted={};past=defaultdict(list);lastmonth={};records={name:[] for name in models};fallback_totals=defaultdict(int)
    for day,dayit in groupby(matches,key=lambda m:m['date']):
        batch=list(dayit);year=int(day[:4])
        if year>max(period):break
        if year in period:
            for league in sorted({m['league'] for m in batch}):
                month=day[:7]
                if lastmonth.get(league)!=month:
                    # Refit cutoff is the first day of this month, never any evaluation-day results.
                    cutoff=month+'-01'
                    history=[m for m in past[league] if m['date']<cutoff]
                    for name,spec in models.items():
                        if spec['family'] not in ('poisson','dixon_coles'):continue
                        model=GoalModel(spec['family'],**spec['parameters']).fit(history,cutoff)
                        if (league,name) in fitted:fallback_totals[f'{league}/{name}']+=fitted[(league,name)].fallbacks
                        fitted[(league,name)]=model;fit_audit.append({'model':name,'league':league,**model.fit_info})
                    lastmonth[league]=month
            for m in batch:
                for name,spec in models.items():
                    if name=='home_fixed':p={'1':1.,'0':0.,'2':0.}
                    elif spec['family'] in ('poisson','dixon_coles'):p=fitted[(m['league'],name)].predict(m)
                    else:p=state[name].predict(m)
                    if not all(math.isfinite(float(x)) and x>=0 for x in p.values()) or abs(sum(p.values())-1)>1e-9:raise ValueError('Invalid probabilities')
                    records[name].append({'id':m['id'],'date':day,'season':m['season'],'league':m['league'],'home':m['home'],'away':m['away'],'actual':outcome(m),'p':p})
        # All matches on a date are predicted before *any* result from that date is added.
        for m in batch:
            for model in state.values():
                if hasattr(model,'update'):model.update(m)
            past[m['league']].append(m)
    for (league,name),model in fitted.items():fallback_totals[f'{league}/{name}']+=model.fallbacks
    audit_fallbacks={k:v for k,v in fallback_totals.items() if v}
    return records,audit_fallbacks

def compare(output=ROOT/'results'):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    protocol_bytes=(ROOT/'protocol.json').read_bytes();protocol=json.loads(protocol_bytes)
    matches,manifest=load_matches()
    models={'home_fixed':{'family':'home_fixed','parameters':{}},'league_mean':{'family':'league_mean','parameters':{}},'current':{'family':'current','parameters':{}}}
    for family,grid in protocol['hyperparameters'].items():
        for i,params in enumerate(grid):models[f'{family}_{i}']={'family':family,'parameters':params}
    audit=[]
    validation,fallbacks=run_period(matches,models,protocol['validation_seasons'],audit)
    # Only validation decides which family/configuration is the candidate.
    best_by_family={family:min([n for n,s in models.items() if s['family']==family],key=lambda n:macro_logloss(validation[n])) for family in protocol['hyperparameters']}
    selected=min(best_by_family.values(),key=lambda n:macro_logloss(validation[n]))
    selection={'protocol_sha256':hashlib.sha256(protocol_bytes).hexdigest(),'dataset_sha256':manifest['dataset_sha256'],'period':'2024 validation only','models':models,'best_by_family':best_by_family,'selected_candidate':selected,'validation':{n:summarize(rows) for n,rows in validation.items()}}
    (output/'selection.json').write_text(json.dumps(selection,ensure_ascii=False,indent=2)+'\n')
    # The selected candidate is now frozen before holdout is evaluated.
    active={n:models[n] for n in ['home_fixed','league_mean','current',*best_by_family.values()]}
    holdout,holdout_fallbacks=run_period(matches,active,protocol['holdout_seasons'],audit)
    summary={n:summarize(rows) for n,rows in holdout.items()}
    c=summary[selected]['overall'];base=summary['current']['overall'];mean=summary['league_mean']['overall']
    bootstrap=paired_bootstrap(holdout[selected],holdout['current']);bootstrap_mean=paired_bootstrap(holdout[selected],holdout['league_mean'])
    checks={
      'minimum_league_samples':all(x['n']>=200 for x in summary[selected]['by_league'].values()),
      'current_logloss_relative_improvement_at_least_1pct':c['logloss']<=base['logloss']*.99,
      'league_mean_logloss_relative_improvement_at_least_1pct':c['logloss']<=mean['logloss']*.99,
      'no_league_logloss_regression_over_0_01':all(summary[selected]['by_league'][l]['logloss']<=summary['current']['by_league'][l]['logloss']+.01 and summary[selected]['by_league'][l]['logloss']<=summary['league_mean']['by_league'][l]['logloss']+.01 for l in protocol['leagues']),
      'paired_ci_current_below_zero':bootstrap['ci95'][1]<0,
      'paired_ci_league_mean_below_zero':bootstrap_mean['ci95'][1]<0,
      'brier_improves':c['brier']<base['brier'] and c['brier']<mean['brier'],
      'accuracy_not_lower':c['accuracy']>=base['accuracy'] and c['accuracy']>=mean['accuracy'],
      'draw_recall_improves':c['draw_recall']>base['draw_recall'],
    }
    report={'protocol':protocol,'protocol_sha256':selection['protocol_sha256'],'dataset_sha256':manifest['dataset_sha256'],'dataset_coverage':manifest['sources'],'selected_on_validation':selected,'holdout_period':'2025 (retrospective, not prospective)','holdout':summary,'bootstrap_vs_current':bootstrap,'bootstrap_vs_league_mean':bootstrap_mean,'promotion_checks':checks,'eligible_research_candidate':all(checks.values()),'production_model_changed':False,'logloss_floor':1e-15,'evaluation_source_sha256':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['models.py','evaluate.py']},'decision':'research_candidate_only' if all(checks.values()) else 'retain_current','numerical_fallbacks':{'validation':fallbacks,'holdout':holdout_fallbacks},'limitations':protocol['limitations']}
    (output/'comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (output/'fit_audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    raw='\n'.join(json.dumps({'model':name,**r},ensure_ascii=False) for name,rows in holdout.items() for r in rows)+'\n'
    (output/'holdout_predictions.jsonl.gz').write_bytes(gzip.compress(raw.encode(),mtime=0))
    print('Validation selection:',selected)
    for n,s in summary.items():
        m=s['overall'];print(n,m['n'],f"accuracy={m['accuracy']:.4f} logloss={m['logloss']:.6f} brier={m['brier']:.6f} draw_recall={m['draw_recall']:.4f}")
    print('Gate:',report['decision'],checks)
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(ROOT/'results'));args=parser.parse_args();compare(args.output)
