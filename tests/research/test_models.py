import unittest,sys,math,json,gzip,tempfile
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'research'))
from models import GoalModel,Elo,Current,LeagueMean,score_probabilities,argmax
from evaluate import load_matches,metrics,run_period,paired_bootstrap

def fixture():
    rows=[]
    for i in range(36):
        rows.append({'id':str(i),'date':f"2023-{i//3+1:02d}-{i%3+1:02d}",'season':2023,'league':'J1','home_team_id':'a' if i%2 else 'b','away_team_id':'b' if i%2 else 'a','home':'A','away':'B','home_goals':i%3,'away_goals':(i//2)%2})
    return rows

class ModelTests(unittest.TestCase):
    def test_probability_mass_and_draw_pick(self):
        for lam,mu,rho in [(.4,.4,0),(1.2,1.5,-.08),(3,2,0)]:
            p=score_probabilities(lam,mu,rho);self.assertAlmostEqual(sum(p.values()),1);self.assertTrue(all(x>=0 for x in p.values()))
        self.assertEqual(argmax(score_probabilities(.4,.4,-.1)),'0')
    def test_poisson_symmetry(self):
        p=score_probabilities(1,2);q=score_probabilities(2,1);self.assertAlmostEqual(p['1'],q['2']);self.assertAlmostEqual(p['0'],q['0'])
    def test_dc_reallocates_low_score_mass(self):
        p=score_probabilities(1,1);q=score_probabilities(1,1,-.1);self.assertGreater(q['0'],p['0']);self.assertAlmostEqual(sum(q.values()),1)
        with self.assertRaises(ValueError):score_probabilities(5,5,.15)
    def test_elo_direction_and_conservation(self):
        e=Elo();m=fixture()[0];m['home_goals']=2;m['away_goals']=0;before=e.predict(m)['1'];e.update(m);self.assertGreater(e.predict(m)['1'],before);self.assertAlmostEqual(sum(e.ratings.values()),3000)
    def test_current_does_not_predict_draw(self):
        c=Current()
        for m in fixture():self.assertNotEqual(argmax(c.predict(m)),'0');c.update(m)
    def test_cutoff_rejects_same_or_future_day(self):
        for cutoff in ['2023-01-01','2023-04-01']:
            with self.assertRaises(ValueError):GoalModel().fit(fixture(),cutoff)
    def test_dc_optimizer_moves_and_gradient_matches_finite_difference(self):
        model=GoalModel('dixon_coles').fit(fixture(),'2024-01-01');self.assertGreater(model.fit_info['iterations'],1)
        x=model.params.copy();x[-1]=.02;f=model._training_objective;_,gradient=f(x)
        for i in range(len(x)):
            xp=x.copy();xm=x.copy();xp[i]+=1e-5;xm[i]-=1e-5;numerical=(f(xp)[0]-f(xm)[0])/2e-5;self.assertAlmostEqual(gradient[i],numerical,places=4)
    def test_same_day_results_never_change_that_days_predictions(self):
        rows=fixture();models={n:{'family':n,'parameters':{}} for n in ['current','league_mean']}
        rows+=[dict(rows[-1],id='x',date='2024-01-01',season=2024),dict(rows[-1],id='y',date='2024-01-01',season=2024)]
        a,_=run_period(rows,models,[2024],[]);changed=[dict(m) for m in rows];changed[-2]['home_goals']=9
        b,_=run_period(changed,models,[2024],[])
        for name in models:self.assertEqual([r['p'] for r in a[name]],[r['p'] for r in b[name]])
    def test_goal_models_do_not_use_same_day_results(self):
        rows=fixture();rows+=[dict(rows[-1],id='x',date='2024-01-01',season=2024),dict(rows[-1],id='y',date='2024-01-01',season=2024)]
        models={'poisson':{'family':'poisson','parameters':{'ridge':5,'decay_days':365}}}
        a,_=run_period(rows,models,[2024],[]);changed=[dict(m) for m in rows];changed[-2]['home_goals']=9
        b,_=run_period(changed,models,[2024],[]);self.assertEqual([r['p'] for r in a['poisson']],[r['p'] for r in b['poisson']])
    def test_final_future_data_does_not_change_earlier_fit(self):
        rows=fixture();m=GoalModel().fit(rows,'2024-01-01');base=m.predict(rows[0]);future=dict(rows[0],date='2025-01-01',home_goals=100)
        train=[r for r in rows+[future] if r['date']<'2024-01-01'];self.assertEqual(base,GoalModel().fit(train,'2024-01-01').predict(rows[0]))
    def test_metrics_draw_precision_and_recall(self):
        rows=[{'actual':'0','p':{'1':.2,'0':.6,'2':.2}},{'actual':'1','p':{'1':.2,'0':.6,'2':.2}}]
        s=metrics(rows);self.assertEqual(s['accuracy'],.5);self.assertEqual(s['draw_precision'],.5);self.assertEqual(s['draw_recall'],1)
    def test_dataset_integrity_and_coverage(self):
        m,manifest=load_matches();self.assertEqual(len(m),4502);self.assertEqual(len(manifest['sources']),12);self.assertEqual({r['season'] for r in m},{2022,2023,2024,2025})
    def test_bootstrap_requires_paired_matches(self):
        with self.assertRaises(ValueError):paired_bootstrap([{'id':'a'}],[{'id':'b'}])

if __name__=='__main__':unittest.main()
