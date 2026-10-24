import unittest,sys,math,json
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'research'))
from continuous import calibrated,fit_calibration,blend,promotion,forecast,BASE

class ContinuousTests(unittest.TestCase):
 def test_identity_calibration_and_draw_argmax(self):
  p={'1':.34,'0':.33,'2':.33};self.assertAlmostEqual(calibrated(p,{'temperature':1,'draw_bias':0})['0'],.33)
  q=calibrated(p,{'temperature':1,'draw_bias':.4});self.assertGreater(q['0'],q['1']);self.assertAlmostEqual(sum(q.values()),1)
 def test_calibration_rejects_exposed_2025(self):
  with self.assertRaises(ValueError):fit_calibration([{'date':'2025-01-01'}])
 def test_ensemble_requires_identical_fixture_order(self):
  with self.assertRaises(ValueError):blend({'elo':[{'id':'a'}],'poisson':[{'id':'b'}],'dixon_coles':[{'id':'a'}]})
 def test_forecast_rejects_same_day_result_and_targets(self):
  with self.assertRaises(ValueError):forecast([{'date':'2026-11-01'}],[],{},'2026-11-01')
  with self.assertRaises(ValueError):forecast([],[{'date':'2026-11-01'}],{},'2026-11-01')
 def test_no_weekly_repeated_significance_and_no_small_sample_proposal(self):
  protocol=json.loads((Path(__file__).resolve().parents[2]/'research/continuous/protocol.json').read_text());reg={'protocol':protocol,'selected':'elo','experiment_id':'x'}
  rows={k:[] for k in ['elo','current','league_mean']}
  self.assertEqual(promotion(rows,reg,datetime(2026,12,1,tzinfo=timezone.utc))['decision'],'collect_new_prospective_data')
  self.assertEqual(promotion(rows,reg,datetime(2027,6,7,tzinfo=timezone.utc))['decision'],'retain_current_insufficient_samples')
 def test_better_candidate_opens_review_only_after_all_gates(self):
  protocol=json.loads((Path(__file__).resolve().parents[2]/'research/continuous/protocol.json').read_text());reg={'protocol':protocol,'selected':'elo','experiment_id':'x'}
  rows={k:[] for k in ['elo','current','league_mean']}
  for league in ['J1','J2','J3']:
   for i in range(200):
    y=['1','0','2'][i%3];base={'id':league+str(i),'date':f'2027-03-{i%28+1:02d}','league':league,'actual':y}
    rows['elo'].append({**base,'p':{k:.8 if k==y else .1 for k in ('1','0','2')}})
    for name in ['current','league_mean']:rows[name].append({**base,'p':{'1':.4,'0':.3,'2':.3}})
  self.assertFalse(promotion(rows,reg,datetime(2027,6,7,tzinfo=timezone.utc))['proposal_eligible']) # fewer than 30 date blocks
  for name in rows:
   for i,r in enumerate(rows[name]):r['date']=f'2027-{i%3+1:02d}-{i%28+1:02d}'
  result=promotion(rows,reg,datetime(2027,6,7,tzinfo=timezone.utc));self.assertTrue(result['proposal_eligible']);self.assertFalse(result['production_model_changed'])
 def test_gate_rejects_2025_and_unpaired_results(self):
  protocol=json.loads((Path(__file__).resolve().parents[2]/'research/continuous/protocol.json').read_text());reg={'protocol':protocol,'selected':'elo','experiment_id':'x'}
  row={'id':'x','date':'2025-03-01','league':'J1','actual':'0','p':{'1':.2,'0':.6,'2':.2}}
  with self.assertRaises(ValueError):promotion({n:[row] for n in ['current','league_mean','elo']},reg,datetime(2027,6,7,tzinfo=timezone.utc))
  with self.assertRaises(ValueError):promotion({'current':[row],'league_mean':[],'elo':[row]},reg,datetime(2027,6,7,tzinfo=timezone.utc))
 def test_new_cycle_moves_forward_without_reusing_confirmation(self):
  from continuous import next_registration
  protocol=json.loads((Path(__file__).resolve().parents[2]/'research/continuous/protocol.json').read_text())
  reg={'protocol':protocol,'selected':'elo','experiment_id':'first','cycle':0,'calibration':{}}
  rows={n:[] for n in ['current','league_mean','elo']}
  later=next_registration(rows,reg,datetime(2027,6,7,tzinfo=timezone.utc))
  self.assertEqual(later['cycle'],1);self.assertEqual(later['root_experiment_id'],'first');self.assertGreater(later['protocol']['prospective_start'],protocol['prospective_end']);self.assertEqual(reg['protocol']['prospective_start'],'2026-11-01')
  budget=sum(.05/((i+1)*(i+2)) for i in range(1000));self.assertLess(budget,.05)
