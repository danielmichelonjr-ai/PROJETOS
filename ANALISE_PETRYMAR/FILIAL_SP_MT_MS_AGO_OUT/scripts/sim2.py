import sys, math, numpy as np, pandas as pd
sys.path.insert(0,'scripts')
from lib import load_table, lookup, price as price_old
BANDS=[10,20,30,50,70,100,150,200]
def load_gru(f):
    t=pd.read_excel(f,nrows=400); t=t[t.UF.notna()].copy()
    t.columns=['UF','CIDADE','CEPI','CEPF','PRAZO']+[f'w{b}' for b in BANDS]+['EXC','ADV','GRIS','PED','PEDFRAC','CTE','TDE','TDA','OUT','OUTFRAC']
    t[['TDE','TDA']]=t[['TDE','TDA']].fillna(0)
    t['CEPI']=t.CEPI.astype(int); t['CEPF']=t.CEPF.astype(int)
    # erro de digitação na tabela da Petrymar: Três Lagoas 79600001-76953999 (CEP final invertido)
    t.loc[(t.CEPI==79600001)&(t.CEPF==76953999),'CEPF']=79653999
    return t.sort_values('CEPI').reset_index(drop=True)
def price_gru(r,peso,val,icms=0.07,outra_por_kg=True,comp=False):
    fp=next((r[f'w{b}'] for b in BANDS if peso<=b), r['w200']+(peso-200)*r['EXC'])
    ped=math.ceil(peso/r['PEDFRAC'])*r['PED']
    out=math.ceil(peso/r['OUTFRAC'])*r['OUT'] if outra_por_kg else r['OUT']
    adv=val*r['ADV']; gris=val*r['GRIS']
    parts=dict(fp=fp,ped=ped,out=out,adv=adv,gris=gris,cte=r['CTE'],tda=r['TDA'],tde=r['TDE'])
    tot=sum(parts.values())
    tot=tot/(1-icms) if icms else tot
    return (tot,parts) if comp else tot
G=load_gru('data2/9b3b651a-TABELA_MULTIMOVEIS_ORIGEM_GUARULHOS__FORMATO_INTELIPOST.xlsx')
A=load_table('data/5efb1329-TABELA_ATUAL_PETRYMAR_-_INTELIPOST.xlsx')
if __name__=='__main__':
    df=pd.read_pickle('orders2.pkl')
    df['UF']=df['UF / CIDADE'].str.extract(r'\((\w\w)\)$')
    df['CIDADE']=df['UF / CIDADE'].str.replace(r'\s*-\s*\(\w\w\)$','',regex=True).str.strip().replace('','(cidade não informada)')
    df['ORIG']=df['ORIGEM COTAÇÃO'].astype(str).str.strip()
    d=df[df.UF.isin(['MT','MS'])].copy()
    d['cep']=d['CEP ENTREGA'].str.replace(r'\D','',regex=True).astype(int)
    d['VAL_NF']=d['VALOR PRODUTOS']+d['FRETE PEDIDO']
    gi=lookup(G,d.cep.values)
    d['PETRY_GRU']=[price_gru(G.iloc[i],p,v) if i>=0 else np.nan for i,p,v in zip(gi,d['PESO ITENS'],d.VAL_NF)]
    d['PETRY_GRU_SEM_ICMS']=[price_gru(G.iloc[i],p,v,icms=0) if i>=0 else np.nan for i,p,v in zip(gi,d['PESO ITENS'],d.VAL_NF)]
    d['PETRY_GRU_OUTRA_FIXA']=[price_gru(G.iloc[i],p,v,outra_por_kg=False) if i>=0 else np.nan for i,p,v in zip(gi,d['PESO ITENS'],d.VAL_NF)]
    d['PRAZO_GRU']=[G.PRAZO.iloc[i] if i>=0 else np.nan for i in gi]
    d['CIDADE_TAB']=[G.CIDADE.iloc[i] if i>=0 else None for i in gi]
    d['TDA_GRU']=[G.TDA.iloc[i] if i>=0 else np.nan for i in gi]
    ai=lookup(A,d.cep.values)
    d['PETRY_MATRIZ_ATUAL']=[price_old(A.iloc[i],p,v,0.07) if i>=0 else np.nan for i,p,v in zip(ai,d['PESO ITENS'],d.VAL_NF)]
    d['PRAZO_MATRIZ_ATUAL']=[A.PRAZO.iloc[i] if i>=0 else np.nan for i in ai]
    d['CUSTO_REAL']=d['COTAÇÃO TRANSPORTADOR']; d['TRANSP']=d['TRANSPORTADOR COTAÇÃO']; d['FAIXA']=d['RANGE FRETE (KG)']
    d.to_pickle('sim2.pkl')
    f=d[d.ORIG=='FILIAL SP']
    print(len(d),len(f),'sem cob filial',f.PETRY_GRU.isna().sum(),'sem cob total',d.PETRY_GRU.isna().sum())
    c=d[(d.TRANSP=='Petrymar Transportes')]
    print('calib matriz atual', (c.CUSTO_REAL/c.PETRY_MATRIZ_ATUAL-1).describe()[['50%','min','max']].round(4).to_dict())
    for u,g in f.groupby('UF'):
        print(u,len(g),g.CUSTO_REAL.sum().round(0),g.PETRY_GRU.sum().round(0),(g.PETRY_GRU.sum()/g.CUSTO_REAL.sum()-1).round(3),'win',(g.PETRY_GRU<g.CUSTO_REAL).mean().round(2),
          'semICMS',(g.PETRY_GRU_SEM_ICMS.sum()/g.CUSTO_REAL.sum()-1).round(3),'outraFixa',(g.PETRY_GRU_OUTRA_FIXA.sum()/g.CUSTO_REAL.sum()-1).round(3))
        print(g.CIDADE.value_counts().head(22).to_dict())
    