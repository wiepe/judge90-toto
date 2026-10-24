"""Research-only models. Nothing imports this module from the production updater."""
from collections import defaultdict, deque
from datetime import date
import math
import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln

OUTCOMES = ('1', '0', '2')

def outcome(m):
    return '1' if m['home_goals'] > m['away_goals'] else '2' if m['home_goals'] < m['away_goals'] else '0'

def argmax(p):
    # Match JS numeric object-key tie ordering: 0,1,2.
    return max(('0','1','2'), key=lambda k:p[k])

def score_probabilities(lam, mu, rho=0., max_goals=18):
    """Independent Poisson with optional Dixon-Coles low-score correction.

    Tail mass is explicitly checked, then the finite grid is normalized.
    """
    if not (0 < lam < 12 and 0 < mu < 12):
        raise ValueError('Expected-goal rates outside validated numerical domain')
    # Raise truncation adaptively; avoid silently dropping high-goal tails.
    n=max(max_goals, int(max(lam,mu)+12*math.sqrt(max(lam,mu))+8))
    g=np.arange(n+1)
    ph=np.exp(g*np.log(lam)-lam-gammaln(g+1))
    pa=np.exp(g*np.log(mu)-mu-gammaln(g+1))
    grid=np.outer(ph,pa)
    if 1-grid.sum()>1e-9: raise ValueError('Poisson tail too large')
    if rho:
        # Constraint shared by fitting/prediction; invalid corrections are never clipped.
        tau=np.array([1-lam*mu*rho,1+lam*rho,1+mu*rho,1-rho])
        if np.min(tau)<=0: raise ValueError('Invalid Dixon-Coles correction')
        grid[0,0]*=tau[0];grid[0,1]*=tau[1];grid[1,0]*=tau[2];grid[1,1]*=tau[3]
    grid/=grid.sum()
    return {'1':float(np.tril(grid,-1).sum()),'0':float(np.trace(grid)),'2':float(np.triu(grid,1).sum())}

class GoalModel:
    def __init__(self, kind='poisson', decay_days=365, ridge=5):
        self.kind=kind;self.decay_days=decay_days;self.ridge=ridge
        self.index={};self.params=None;self.fit_info=None;self.fallbacks=0

    def fit(self, matches, cutoff):
        if not matches or any(m['date']>=cutoff for m in matches):
            raise ValueError('Training results must strictly precede cutoff')
        self.index={t:i for i,t in enumerate(sorted({m[k] for m in matches for k in ('home_team_id','away_team_id')}))}
        n=len(self.index)
        h=np.array([self.index[m['home_team_id']] for m in matches]);a=np.array([self.index[m['away_team_id']] for m in matches])
        hg=np.array([m['home_goals'] for m in matches]);ag=np.array([m['away_goals'] for m in matches])
        ages=np.array([(date.fromisoformat(cutoff)-date.fromisoformat(m['date'])).days for m in matches])
        w=np.exp(-np.log(2)*ages/self.decay_days)
        isdc=self.kind=='dixon_coles'
        masks=[(hg==0)&(ag==0),(hg==0)&(ag==1),(hg==1)&(ag==0),(hg==1)&(ag==1)]
        def objective(x):
            lam=np.exp(x[0]+x[1]+x[2+h]-x[2+n+a]);mu=np.exp(x[0]+x[2+a]-x[2+n+h])
            tau=np.ones(len(matches));dl=np.zeros(len(matches));dm=np.zeros(len(matches));dr=np.zeros(len(matches))
            if isdc:
                rho=x[-1];m00,m01,m10,m11=masks
                tau[m00]=1-lam[m00]*mu[m00]*rho;dl[m00]=dm[m00]=-lam[m00]*mu[m00]*rho;dr[m00]=-lam[m00]*mu[m00]
                tau[m01]=1+lam[m01]*rho;dl[m01]=lam[m01]*rho;dr[m01]=lam[m01]
                tau[m10]=1+mu[m10]*rho;dm[m10]=mu[m10]*rho;dr[m10]=mu[m10]
                tau[m11]=1-rho;dr[m11]=-1
                # Smooth penalty plus the correct derivative outside the valid domain.
                # A constant penalty with zero gradient can falsely "converge" at initialization.
                violation=np.minimum(tau-1e-6,0.)
            else:
                violation=np.zeros(len(matches))
            valid=tau>1e-6
            safe=np.maximum(tau,1e-6)
            derivative=np.where(valid,1/safe,0.)-2e6*violation
            value=np.sum(w*(lam-hg*np.log(lam)+mu-ag*np.log(mu)-np.log(safe)))+1e6*np.sum(w*violation**2)+.5*self.ridge*np.sum(x[2:2+2*n]**2)
            gl=w*(lam-hg-dl*derivative);gm=w*(mu-ag-dm*derivative)
            grad=np.zeros_like(x);grad[0]=np.sum(gl+gm);grad[1]=np.sum(gl)
            grad[2:2+n]=np.bincount(h,weights=gl,minlength=n)+np.bincount(a,weights=gm,minlength=n)+self.ridge*x[2:2+n]
            grad[2+n:2+2*n]=-np.bincount(a,weights=gl,minlength=n)-np.bincount(h,weights=gm,minlength=n)+self.ridge*x[2+n:2+2*n]
            if isdc:
                value+=5*x[-1]**2;grad[-1]=np.sum(-w*dr*derivative)+10*x[-1]
            return float(value),grad
        x=np.zeros(2+2*n+int(isdc));x[0]=math.log(max(.2,float(np.average(ag,weights=w))));x[1]=math.log(max(.2,float(np.average(hg,weights=w)))/max(.2,float(np.average(ag,weights=w))))
        if isdc:x[-1]=-.03
        bounds=[(-1,1.5),(-.6,.8)]+[(-1.5,1.5)]*(2*n)+([(-.15,.15)] if isdc else [])
        self._training_objective=objective
        result=minimize(objective,x,jac=True,method='L-BFGS-B',bounds=bounds,options={'maxiter':250,'ftol':1e-10,'gtol':1e-6})
        if not result.success or not np.all(np.isfinite(result.x)):
            raise ValueError('Goal model did not converge: '+str(result.message))
        self.params=result.x;self.fit_info={'cutoff':cutoff,'matches':len(matches),'last_training_date':max(m['date'] for m in matches),'converged':bool(result.success),'iterations':result.nit}
        return self

    def predict(self, match):
        n=len(self.index);x=self.params
        def skill(offset,t):return x[offset+self.index[t]] if t in self.index else 0.
        h,a=match['home_team_id'],match['away_team_id']
        lam=math.exp(x[0]+x[1]+skill(2,h)-skill(2+n,a));mu=math.exp(x[0]+skill(2,a)-skill(2+n,h))
        rho=x[-1] if self.kind=='dixon_coles' else 0.
        try:return score_probabilities(lam,mu,rho)
        except ValueError:
            # Predeclared numerical fallback: Poisson, never silently force invalid probabilities.
            self.fallbacks+=1
            return score_probabilities(lam,mu,0.)

class Elo:
    def __init__(self,k=16,home=60,draw_prior=.26):
        self.k=k;self.home=home;self.draw=draw_prior;self.ratings=defaultdict(lambda:1500.)
    def predict(self,m):
        h=(m['league'],m['home_team_id']);a=(m['league'],m['away_team_id'])
        z=math.log(10)*(self.ratings[h]-self.ratings[a]+self.home)/400
        eh,ea=math.exp(z/2),math.exp(-z/2);nu=2*self.draw/(1-self.draw);total=eh+ea+nu
        return {'1':eh/total,'0':nu/total,'2':ea/total}
    def update(self,m):
        p=self.predict(m);actual=1 if outcome(m)=='1' else .5 if outcome(m)=='0' else 0
        delta=self.k*(actual-p['1']-.5*p['0']);self.ratings[(m['league'],m['home_team_id'])]+=delta;self.ratings[(m['league'],m['away_team_id'])]-=delta

class Current:
    """Current v2.1 formula, with archived league-only H2H available from 2022."""
    def __init__(self):self.teams={};self.h2h=defaultdict(lambda:deque(maxlen=5))
    def team(self,m,side):
        key=(m['season'],m['league'],m[side+'_team_id'])
        if key not in self.teams:self.teams[key]={'n':0,'w':0,'d':0,'points':0,'gf':0,'ga':0,'home':[0,0,0],'away':[0,0,0],'form':deque(maxlen=5)}
        return self.teams[key]
    def strength(self,t,side):
        n=t['n'];v=t[side]
        return .25*(t['points']/n/3 if n else 1/3)+.20*(t['w']/n if n else .33)+.20*max(0,min(1,((t['gf']-t['ga'])/n+2)/4 if n else .5))+.15*(sum(t['form'])/len(t['form']) if t['form'] else .5)+.20*((v[1]+.5*v[2])/v[0] if v[0] else .5)
    def predict(self,m):
        h,a=m['home_team_id'],m['away_team_id'];recent=self.h2h[tuple(sorted((h,a)))];effect=sum(1 if winner==h else -1 if winner==a else 0 for winner in recent)/len(recent)*.025 if recent else 0
        diff=self.strength(self.team(m,'home'),'home')-self.strength(self.team(m,'away'),'away')+.055+effect
        draw=.23+(1-min(abs(diff)*2,1))*.08
        hp=max(.12,min(.70,.5+diff*.55));ap=max(.12,min(.70,.5-diff*.55))
        return {'1':hp/(hp+ap)*(1-draw),'0':draw,'2':ap/(hp+ap)*(1-draw)}
    def update(self,m):
        for side,other in [('home','away'),('away','home')]:
            t=self.team(m,side);gf,ga=m[side+'_goals'],m[other+'_goals'];w=int(gf>ga);d=int(gf==ga)
            t['n']+=1;t['w']+=w;t['d']+=d;t['points']+=3*w+d;t['gf']+=gf;t['ga']+=ga
            t[side][0]+=1;t[side][1]+=w;t[side][2]+=d;t['form'].append(w+.5*d)
        o=outcome(m);self.h2h[tuple(sorted((m['home_team_id'],m['away_team_id'])))].append(m['home_team_id'] if o=='1' else m['away_team_id'] if o=='2' else None)

class LeagueMean:
    def __init__(self):self.counts=defaultdict(lambda:np.array([4.,3.,3.]))
    def predict(self,m):
        p=self.counts[m['league']];return dict(zip(OUTCOMES,p/p.sum()))
    def update(self,m):self.counts[m['league']][OUTCOMES.index(outcome(m))]+=1
