import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'research'))
from development_diagnostics import development_only,entry_flags,diagnose
class Diagnostics(unittest.TestCase):
 def test_exposed_2025_and_future_never_enter_development(self):
  rows=[{'date':y+'-01-01'} for y in ['2022','2023','2024','2025','2026']]
  self.assertEqual([r['date'] for r in development_only(rows)],['2022-01-01','2023-01-01','2024-01-01'])
 def test_entry_proxy_only_uses_prior_season_membership(self):
  def m(i,y,h,a):return dict(id=i,date=y+'-01-01',league='J1',home_team_id=h,away_team_id=a)
  rows=[m('a','2023','one','two'),m('b','2024','one','three')]
  self.assertTrue(entry_flags(rows)['b']);self.assertTrue(entry_flags(rows+[m('c','2025','one','three')])['b'])
 def test_rare_outcomes_and_calibration_use_probability_not_argmax(self):
  s=diagnose([{'actual':'0','p':{'1':.8,'0':.1,'2':.1}}])
  self.assertEqual(s['low_probability_events']['0']['observed_count'],1)
  self.assertAlmostEqual(s['low_probability_events']['0']['expected_count'],.1)
  self.assertAlmostEqual(s['calibration']['0']['ece'],.9)
  self.assertEqual(diagnose([])['calibration']['0']['ece'],None)
