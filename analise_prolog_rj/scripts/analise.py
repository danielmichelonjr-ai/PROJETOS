import sys; sys.path.insert(0,'scripts')
from prolog import *
import pandas as pd, numpy as np
tab=load_table('data/prolog.xlsx')
df=pd.read_pickle('data/pedidos.pkl'); df['UF']=df['UF / CIDADE'].str.extract(r'\((\w\w)\)')
s=df[(df.UF=='RJ')&(df['ORIGEM COTAÇÃO '].str.strip()=='FILIAL SP')].copy()
s['CIDADE']=s['UF / CIDADE'].str.replace(r' - \(RJ\)','',regex=True)
s['ATUAL']=s['COTAÇÃO TRANSPORTADOR']
det=[price(find(tab,c),p,nf,detail=True) for c,p,nf in zip(s['CEP ENTREGA'],s['PESO ITENS'],s['VALOR PRODUTOS'])]
s['PROLOG']=[d['total'] for d in det]
s['PRAZO_PROLOG']=[find(tab,c)['prazo'] for c in s['CEP ENTREGA']]
s['TABELA_PROLOG']=[find(tab,c)['cidade'] for c in s['CEP ENTREGA']]
edges=[0]+BANDS+[1e9]; labels=[f'{a}-{b}' if b<1e9 else '>250' for a,b in zip(edges[:-1],edges[1:])]
s['FAIXA']=pd.cut(s['PESO ITENS'],edges,labels=labels,right=True)
s['DIF']=s['PROLOG']-s['ATUAL']; s['GANHA']=s['PROLOG']<s['ATUAL']
s.to_pickle('data/sim.pkl')
