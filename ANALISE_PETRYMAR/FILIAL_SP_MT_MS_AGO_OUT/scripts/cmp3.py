import sys, warnings; warnings.filterwarnings('ignore'); sys.path.insert(0,'scripts2'); sys.path.insert(0,'scripts')
import numpy as np, pandas as pd
from sim2 import G, A, price_gru
from lib import load_table, lookup, price
N=load_table('data/f9d33a13-TABELA_MULTIMOVEIS_REAJUSTADA_OUT2026_-_PADR_O_INTELIPOST.xlsx')
d=pd.read_pickle('sim2.pkl')
ni=lookup(N,d.cep.values)
d['PETRY_MATRIZ_REAJ']=[price(N.iloc[i],p,v,0.07) if i>=0 else np.nan for i,p,v in zip(ni,d['PESO ITENS'],d.VAL_NF)]
d['PRAZO_MATRIZ_REAJ']=[N.PRAZO.iloc[i] if i>=0 else np.nan for i in ni]
NIVEL={35.0:'1-Capital',41.0:'1-Capital',39.1:'2-Polo regional',61.0:'2-Polo regional',51.75:'3-Interior',116.0:'3-Interior',253.0:'4-Interior distante',278.0:'4-Interior distante'}
gi=lookup(G,d.cep.values); d['NIVEL']=[NIVEL.get(G.w10.iloc[i]) for i in gi]
# componentes (sem ICMS) para explicar a diferença
def comp_old(r,p,v):
    from lib import BANDS
    fp=next((r[f'w{b}'] for b in BANDS if p<=b), r['w200']+(p-200)*r['EXC'])
    import math
    return dict(fp=fp,trt=fp*r['TRT']/100,ped=math.ceil(p/100)*r['PED'],adv=v*r['ADV']/100,gris=v*r['GRIS']/100,taxas=r['ENT']+r['TDA'])
def comp_new(r,p,v):
    t,c=price_gru(r,p,v,icms=0,comp=True)
    return dict(fp=c['fp'],trt=0,ped=c['ped']+c['out'],adv=c['adv'],gris=c['gris'],taxas=c['cte']+c['tda']+c['tde'])
ai=lookup(A,d.cep.values)
CA=pd.DataFrame([comp_old(A.iloc[i],p,v) for i,p,v in zip(ai,d['PESO ITENS'],d.VAL_NF)],index=d.index).add_suffix('_MAT')
CG=pd.DataFrame([comp_new(G.iloc[i],p,v) for i,p,v in zip(gi,d['PESO ITENS'],d.VAL_NF)],index=d.index).add_suffix('_GRU')
d=pd.concat([d,CA,CG],axis=1)
d.to_pickle('sim3.pkl')
m=d[(d.ORIG=='MATRIZ')]
print(m.TRANSP.value_counts())
def S(g,lbl):
    return pd.Series({'n':len(g),'real':g.CUSTO_REAL.sum(),'mat_vig':g.PETRY_MATRIZ_ATUAL.sum(),'mat_reaj':g.PETRY_MATRIZ_REAJ.sum(),'gru':g.PETRY_GRU.sum(),
      'gru_vs_real':g.PETRY_GRU.sum()/g.CUSTO_REAL.sum()-1,'gru_vs_vig':g.PETRY_GRU.sum()/g.PETRY_MATRIZ_ATUAL.sum()-1,'gru_vs_reaj':g.PETRY_GRU.sum()/g.PETRY_MATRIZ_REAJ.sum()-1,
      'gru_win_vig':(g.PETRY_GRU<g.PETRY_MATRIZ_ATUAL).mean(),'prazo_gru':g.PRAZO_GRU.mean(),'prazo_mat':g.PRAZO_MATRIZ_ATUAL.mean(),'peso':g['PESO ITENS'].mean()})
pd.set_option('display.width',250); pd.set_option('display.max_columns',30)
print('MATRIZ por UF'); print(m.groupby('UF').apply(S,'').round(3))
pm=m[m.TRANSP=='Petrymar Transportes']
print('MATRIZ só Petrymar'); print(pm.groupby('UF').apply(S,'').round(3))
print('nivel'); print(pm.groupby(['UF','NIVEL']).apply(S,'').round(3))
print('faixa'); x=pm.groupby(['UF','FAIXA']).apply(S,'').round(3); print(x)
cc=[c for c in d.columns if c.endswith('_MAT') or c.endswith('_GRU') and c[:-4] in('fp','trt','ped','adv','gris','taxas')]
print(pm.groupby('UF')[['fp_MAT','fp_GRU','trt_MAT','trt_GRU','ped_MAT','ped_GRU','adv_MAT','adv_GRU','gris_MAT','gris_GRU','taxas_MAT','taxas_GRU']].mean().round(2).T)
