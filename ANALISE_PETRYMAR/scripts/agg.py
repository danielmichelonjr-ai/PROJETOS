import sys; sys.path.insert(0,'scripts')
from lib import *
d=pd.read_pickle('sim.pkl')
FAIXAS=['0 - 20','20 - 40','40 - 60','60 - 70','70 - 90','90 - 120','120 - 160','160 - 200','200 - 1500']
def cls(x):
    if pd.isna(x): return 'Sem cobertura'
    if x<=-0.10: return 'MUITO BEM (≥10% mais barata)'
    if x<0: return 'BEM (mais barata)'
    if x<=0.10: return 'ATENÇÃO (até 10% mais cara)'
    return 'PRECISA MELHORAR (>10% mais cara)'
def summ(g):
    c=g[g.PETRY_NOVA.notna()]
    r={'Pedidos':len(g),'Pedidos c/ cobertura Petrymar':len(c),
       'Peso médio (kg)':g['PESO ITENS'].mean(),'Ticket médio (R$)':g['VALOR PRODUTOS'].mean(),
       'Custo real total (R$)':c.CUSTO_REAL.sum(),'Petrymar NOVA total (R$)':c.PETRY_NOVA.sum(),
       'Custo real médio/pedido':c.CUSTO_REAL.mean(),'Petrymar NOVA médio/pedido':c.PETRY_NOVA.mean(),
       'Dif. R$/pedido':(c.PETRY_NOVA-c.CUSTO_REAL).mean(),
       'Dif. %':c.PETRY_NOVA.sum()/c.CUSTO_REAL.sum()-1 if len(c) else np.nan,
       '% Frete/Produto REAL':c.CUSTO_REAL.sum()/c['VALOR PRODUTOS'].sum() if len(c) else np.nan,
       '% Frete/Produto PETRYMAR NOVA':c.PETRY_NOVA.sum()/c['VALOR PRODUTOS'].sum() if len(c) else np.nan,
       '% pedidos em que Petrymar NOVA seria mais barata':(c.PETRY_NOVA<c.CUSTO_REAL).mean() if len(c) else np.nan,
       'Petrymar ATUAL médio/pedido':c.PETRY_ATUAL.mean(),
       'Reajuste NOVA vs ATUAL':c.PETRY_NOVA.sum()/c.PETRY_ATUAL.sum()-1 if c.PETRY_ATUAL.sum() else np.nan,
       'Prazo Petrymar NOVA (dias úteis)':c.PRAZO_NOVA.median(),
       'Transportadora principal hoje':g.TRANSP.value_counts().index[0],
       '% Petrymar hoje':(g.TRANSP=='Petrymar Transportes').mean(),
       }
    if len(c):
        # redução necessária para empatar com o custo real
        r['Redução necessária p/ empatar']=min(0,c.CUSTO_REAL.sum()/c.PETRY_NOVA.sum()-1)
    r['Avaliação']=cls(r['Dif. %'])
    return pd.Series(r)
def top(df,n=20):
    out=[]
    for uf in ['MT','MS','GO','DF','MG']:
        x=df[df.UF==uf]
        cities=x.CIDADE.value_counts().head(n).index
        for rk,cty in enumerate(cities,1):
            s=summ(x[x.CIDADE==cty]); s['UF']=uf; s['Rank']=rk; s['Cidade']=cty; out.append(s)
    o=pd.DataFrame(out)
    return o[['UF','Rank','Cidade']+[c for c in o.columns if c not in('UF','Rank','Cidade')]]
def band(df,keys):
    rows=[]
    c=df[df.PETRY_NOVA.notna()]
    for k,g in c.groupby(keys+['FAIXA','TRANSP']):
        rows.append(dict(zip(keys+['Faixa (kg)','Transportadora real'],k),**{'Pedidos':len(g),
          'Custo real médio':g.CUSTO_REAL.mean(),'Petrymar NOVA médio (mesmos pedidos)':g.PETRY_NOVA.mean(),
          'Petrymar ATUAL médio':g.PETRY_ATUAL.mean(),
          'Dif. % NOVA vs real':g.PETRY_NOVA.sum()/g.CUSTO_REAL.sum()-1,
          '% Frete/Produto real':g.CUSTO_REAL.sum()/g['VALOR PRODUTOS'].sum(),
          '% Frete/Produto Petrymar NOVA':g.PETRY_NOVA.sum()/g['VALOR PRODUTOS'].sum(),
          '% pedidos Petrymar mais barata':(g.PETRY_NOVA<g.CUSTO_REAL).mean()}))
    o=pd.DataFrame(rows)
    o['_f']=o['Faixa (kg)'].map({f:i for i,f in enumerate(FAIXAS)})
    o=o.sort_values(keys+['_f','Pedidos'],ascending=[True]*len(keys)+[True,False]).drop(columns='_f')
    o['Avaliação']=o['Dif. % NOVA vs real'].map(cls)
    return o
def band_total(df,keys):
    rows=[]
    c=df[df.PETRY_NOVA.notna()]
    for k,g in c.groupby(keys+['FAIXA']):
        k=k if isinstance(k,tuple) else (k,)
        best=g.groupby('TRANSP').CUSTO_REAL.mean().sort_values()
        rows.append(dict(zip(keys+['Faixa (kg)'],k),**{'Pedidos':len(g),'Custo real médio':g.CUSTO_REAL.mean(),
         'Petrymar NOVA médio':g.PETRY_NOVA.mean(),'Petrymar ATUAL médio':g.PETRY_ATUAL.mean(),
         'Dif. % NOVA vs real':g.PETRY_NOVA.sum()/g.CUSTO_REAL.sum()-1,
         '% Frete/Produto real':g.CUSTO_REAL.sum()/g['VALOR PRODUTOS'].sum(),
         '% Frete/Produto Petrymar NOVA':g.PETRY_NOVA.sum()/g['VALOR PRODUTOS'].sum(),
         '% pedidos Petrymar mais barata':(g.PETRY_NOVA<g.CUSTO_REAL).mean(),
         'Transportadora + usada':g.TRANSP.value_counts().index[0]}))
    o=pd.DataFrame(rows)
    o['_f']=o['Faixa (kg)'].map({f:i for i,f in enumerate(FAIXAS)})
    o=o.sort_values(keys+['_f']).drop(columns='_f')
    o['Avaliação']=o['Dif. % NOVA vs real'].map(cls)
    return o
