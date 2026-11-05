import pandas as pd, numpy as np, openpyxl, math
df=pd.read_pickle('pedidos.pkl')
df['UF']=df['UF / CIDADE'].str.extract(r'\((\w\w)\)\s*$')
df['CIDADE']=df['UF / CIDADE'].str.replace(r'\s*-\s*\(\w\w\)\s*$','',regex=True).str.strip()
s=df[(df['ORIGEM COTAÇÃO']=='FILIAL SP')&df.UF.isin(['PE','CE','RN','PB','PA'])].copy()
wb=openpyxl.load_workbook('data/9b86aa4a-INTELIPOST_CDJ_EXPRESS_SP_MULTIMOVEIS.xlsx',read_only=True)
rows=list(wb.active.iter_rows(values_only=True))[4:]
t=pd.DataFrame([dict(UFT=r[2],CID_T=r[3],CEPI=r[4],CEPF=r[5],PRAZO=r[6],F50=r[8],F100=r[9],EXC=r[10],ADV=r[11],GRIS=r[17],TAS=r[25] or 0,TDA=r[43] or 0,PED=r[51],PEDF=r[52],CTE=r[106],OUT=r[119],OUTF=r[120]) for r in rows if r[4]])
t=t.sort_values('CEPI').reset_index(drop=True)
# overlap check
ov=(t.CEPI.values[1:]<=t.CEPF.values[:-1]).sum(); print('overlaps',ov)
ICMS=0.07
def cdj(r):
    c=r['CEP ENTREGA']; m=t[(t.CEPI<=c)&(t.CEPF>=c)]
    if m.empty: return pd.Series(dict(CDJ=np.nan))
    x=m.iloc[0]; p=r['PESO ITENS']; nf=r['VALOR PRODUTOS']
    base = x.F50 if p<=50 else (x.F100 if p<=100 else x.F100+x.EXC*(p-100))
    adv=x.ADV/100*nf; gris=x.GRIS/100*nf
    ped=x.PED*math.ceil(p/x.PEDF); out=x.OUT*math.ceil(p/x.OUTF)
    sub=base+adv+gris+x.TAS+x.TDA+ped+x.CTE+out
    return pd.Series(dict(CDJ=sub/(1-ICMS),CDJ_BASE=base,CDJ_TAXAS=sub-base,CDJ_TDA=x.TDA,CDJ_PRAZO=x.PRAZO,CDJ_CIDADE=x.CID_T))
s=pd.concat([s,s.apply(cdj,axis=1)],axis=1)
print('sem cobertura',s.CDJ.isna().sum()); print(s[s.CDJ.isna()][['UF / CIDADE','CEP ENTREGA']].value_counts().head(20))
s['ATUAL']=s['COTAÇÃO TRANSPORTADOR']
s['DIF']=s.CDJ-s.ATUAL; s['DIF_PCT']=s.DIF/s.ATUAL
s.to_pickle('base_sim.pkl')
print(s[['PESO ITENS','VALOR PRODUTOS','ATUAL','CDJ','DIF_PCT','TRANSPORTADOR COTAÇÃO','UF / CIDADE']].head(20).to_string())
print(s.groupby('TRANSPORTADOR COTAÇÃO')[['ATUAL','CDJ']].mean())
