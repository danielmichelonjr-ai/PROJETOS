import pandas as pd, numpy as np, math
BANDS=[10,20,30,50,70,100,150,200]
def load_table(f):
    t=pd.read_excel(f,header=3)
    t=t.iloc[:,3:]
    t.columns=['UF','CIDADE','CEPI','CEPF','PRAZO','MIN']+[f'w{b}' for b in BANDS]+['EXC','ADV','GRIS','TDA','PED','PEDFRAC','ENT','TRT']
    t=t[t.UF.isin(['MG','GO','MT','MS','DF','RO','AC'])].copy()
    t['CEPI']=t.CEPI.astype(int); t['CEPF']=t.CEPF.astype(int)
    t=t.fillna({'TDA':0,'MIN':0})
    return t.sort_values('CEPI').reset_index(drop=True)
def lookup(t,cep):
    i=np.searchsorted(t.CEPI.values,cep,side='right')-1
    ok=(i>=0)&(cep<=t.CEPF.values[np.clip(i,0,None)])
    return np.where(ok,i,-1)
def price(r,peso,val,icms=None):
    for b in BANDS:
        if peso<=b: fp=r[f'w{b}']; break
    else: fp=r['w200']+(peso-200)*r['EXC']
    ped=math.ceil(peso/r['PEDFRAC'])*r['PED'] if r['PEDFRAC'] else r['PED']
    adv=val*r['ADV']/100; gris=val*r['GRIS']/100
    trt=fp*r['TRT']/100
    tot=fp+ped+adv+gris+r['TDA']+r['ENT']+trt
    tot=max(tot,r['MIN'] or 0)
    if icms: tot=tot/(1-icms)
    return tot
