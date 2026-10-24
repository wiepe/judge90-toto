"""Check a re-run against recorded metrics, with cross-platform float tolerance."""
import json,sys
from pathlib import Path

def verify(expected,actual):
    a=json.loads((Path(expected)/'comparison.json').read_text());b=json.loads((Path(actual)/'comparison.json').read_text())
    for key in ['dataset_sha256','protocol_sha256','selected_on_validation','decision','production_model_changed','promotion_checks']:
        if a[key]!=b[key]:raise ValueError('Evaluation changed: '+key)
    for model,summary in a['holdout'].items():
        for key in ['n','hits','accuracy','logloss','brier','draw_picks','draw_hits','draw_recall']:
            x,y=summary['overall'][key],b['holdout'][model]['overall'][key]
            if abs(x-y)>1e-6:raise ValueError(f'Metric differs: {model}/{key}: {x} vs {y}')
    print('Recorded comparison reproduced; production model unchanged.')
if __name__=='__main__':verify(*sys.argv[1:])
