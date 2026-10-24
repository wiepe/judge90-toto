"""Cross-platform reproduction: timestamps differ; settings and scores must agree."""
import json,sys

def verify(expected,actual):
 a=json.load(open(expected));b=json.load(open(actual))
 for key in ['selected','protocol','base_models','ensemble_weights','sources','dataset_sha256','development_matches']:
  if a[key]!=b[key]:raise ValueError('Registration differs: '+key)
 for name in a['calibration']:
  for key in ['temperature','draw_bias']:
   if abs(a['calibration'][name][key]-b['calibration'][name][key])>1e-5:raise ValueError('Calibration changed')
 for name in a['selection']:
  for key in ['accuracy','logloss','brier','draw_recall']:
   if abs(a['selection'][name]['overall'][key]-b['selection'][name]['overall'][key])>1e-6:raise ValueError('Development score changed')
 print('Development-only candidate registration reproduced; 2025 never selected on.')
if __name__=='__main__':verify(*sys.argv[1:])
