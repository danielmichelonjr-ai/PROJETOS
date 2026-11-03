import pandas as pd, numpy as np, math, warnings; warnings.filterwarnings('ignore')
D='./'  # pasta com data/ (xlsx de entrada) e base.pkl
t=pd.read_excel(D+'data/tbl_FRETEX_BRASIL.xlsx',header=None).iloc[4:]
t=t[pd.to_numeric(t[2],errors='coerce').notna()].copy()
t.columns=['x','regiao','cepi','cepf','prazo','minimo','p10','p20','p30','p50','p70','p100','p150','p200','exc','advalorem','gris','ped_valor','ped_kg','cte','tda']
for c in t.columns[2:]: t[c]=pd.to_numeric(t[c],errors='coerce')
t['larg']=t.cepf-t.cepi
t=t.sort_values('larg')
T=t.to_dict('records')
LIM=[10,20,30,50,70,100,150,200]
def find(cep):
    for r in T:
        if r['cepi']<=cep<=r['cepf']: return r
    return None
def calc(cep,peso,nf):
    r=find(cep)
    if r is None: return (np.nan,)*4+(None,np.nan)
    if peso<=200:
        for l in LIM:
            if peso<=l: fp=r['p%d'%l]; break
    else: fp=r['p200']+(peso-200)*r['exc']
    adv=nf*r['advalorem']/100; gris=nf*r['gris']/100
    ped=r['ped_valor']*math.ceil(max(peso,0.001)/r['ped_kg'])
    tot=fp+adv+gris+ped+r['cte']+(r['tda'] or 0)
    if not np.isnan(r['minimo']): tot=max(tot,r['minimo'])
    return tot,fp,adv+gris,ped+r['cte']+(r['tda'] or 0),r['regiao'],r['prazo']

df=pd.read_excel(D+'data/AGO_-_SET_-_OUT_-_SC_e_PR.xlsx',dtype={'CEP ENTREGA':str})
df=df[df['UF / CIDADE'].notna()&df['UF / CIDADE'].str.contains(r'\((PR|SC)\)')].copy()
df['UF']=df['UF / CIDADE'].str[-3:-1]
df['CIDADE']=df['UF / CIDADE'].str.replace(r' - \((PR|SC)\)$','',regex=True)
df['CEP']=pd.to_numeric(df['CEP ENTREGA'].str.replace(r'\D','',regex=True),errors='coerce')
df['ORIGEM']=df['ORIGEM COTAÇÃO'].str.strip().str.upper()
res=[calc(c,p,v) if pd.notna(c) and pd.notna(p) else (np.nan,)*4+(None,np.nan) for c,p,v in zip(df.CEP,df['PESO ITENS'],df['VALOR PRODUTOS'].fillna(0))]
df[['FRETEX','FX_PESO','FX_ADV_GRIS','FX_TAXAS','FX_REGIAO','FX_PRAZO']]=pd.DataFrame(res,index=df.index)
df.to_pickle(D+'base.pkl')
print(df.shape, df.FRETEX.isna().sum())
print(df[df.FRETEX.isna()][['CEP ENTREGA','UF / CIDADE','PESO ITENS']].head(20))
print(df[['PESO ITENS','VALOR PRODUTOS','COTAÇÃO TRANSPORTADOR','FRETEX']].describe(percentiles=[.01,.5,.99]).T)
print(df.nlargest(8,'PESO ITENS')[['PESO ITENS','VALOR PRODUTOS','COTAÇÃO TRANSPORTADOR','FRETEX','STATUS HUB']])
print(df[df['COTAÇÃO TRANSPORTADOR']<=0].shape)
