import sys, unicodedata; sys.path.insert(0,'scripts')
from lib import *
A=load_table('data/5efb1329-TABELA_ATUAL_PETRYMAR_-_INTELIPOST.xlsx')
N=load_table('data/f9d33a13-TABELA_MULTIMOVEIS_REAJUSTADA_OUT2026_-_PADR_O_INTELIPOST.xlsx')
df=pd.read_pickle('orders.pkl')
df['UF']=df['UF / CIDADE'].str.extract(r'\((\w\w)\)$')
df['CIDADE']=df['UF / CIDADE'].str.replace(r'\s*-\s*\(\w\w\)$','',regex=True).str.strip()
df['ORIG']=df['ORIGEM COTAÇÃO '].str.strip()
d=df[df.UF.isin(['MT','MS','GO','DF','MG'])&df.ORIG.isin(['MATRIZ','FILIAL SP','FILIAL MG'])].copy()
d['GRUPO']=np.where(d.ORIG=='MATRIZ','MATRIZ','FILIAL SP + FILIAL MG')
d['cep']=d['CEP ENTREGA'].str.replace(r'\D','',regex=True).astype(int)
def icms(o,u):
    if u=='MG': return 0.18 if o=='FILIAL MG' else 0.12
    return 0.07
d['ICMS']=[icms(o,u) for o,u in zip(d.ORIG,d.UF)]
d['VAL_NF']=d['VALOR PRODUTOS']+d['FRETE PEDIDO']
for tag,T in [('NOVA',N),('ATUAL',A)]:
    idx=lookup(T,d.cep.values)
    d[f'PETRY_{tag}']=[price(T.iloc[i],p,v,g) if i>=0 else np.nan for i,p,v,g in zip(idx,d['PESO ITENS'],d.VAL_NF,d.ICMS)]
    d[f'PRAZO_{tag}']=[T.PRAZO.iloc[i] if i>=0 else np.nan for i in idx]
    if tag=='NOVA': d['CIDADE_TAB']=[T.CIDADE.iloc[i] if i>=0 else None for i in idx]
d['CUSTO_REAL']=d['COTAÇÃO TRANSPORTADOR']
d['TRANSP']=d['TRANSPORTADOR COTAÇÃO']
d['FAIXA']=d['RANGE FRETE (KG)']
def norm(s): return unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().upper().strip()
d['CID_N']=d.CIDADE.map(norm)
TRI={'Uberlândia':['ARAGUARI','ARAPORA','CANAPOLIS','CASCALHO RICO','CENTRALINA','INDIANOPOLIS','MONTE ALEGRE DE MINAS','PRATA','TUPACIGUARA','UBERLANDIA'],
'Ituiutaba':['CACHOEIRA DOURADA','CAPINOPOLIS','GURINHATA','IPIACU','ITUIUTABA','SANTA VITORIA'],
'Uberaba':['AGUA COMPRIDA','CAMPO FLORIDO','CONCEICAO DAS ALAGOAS','CONQUISTA','DELTA','UBERABA','VERISSIMO'],
'Frutal':['CAMPINA VERDE','CARNEIRINHO','COMENDADOR GOMES','FRONTEIRA','FRUTAL','ITAPAGIPE','ITURAMA','LIMEIRA DO OESTE','PIRAJUBA','PLANURA','SAO FRANCISCO DE SALES','UNIAO DE MINAS'],
'Araxá':['ARAXA','CAMPOS ALTOS','IBIA','NOVA PONTE','PEDRINOPOLIS','PERDIZES','PRATINHA','SACRAMENTO','SANTA JULIANA','TAPIRA'],
'Patrocínio':['ABADIA DOS DOURADOS','COROMANDEL','CRUZEIRO DA FORTALEZA','DOURADOQUARA','ESTRELA DO SUL','GRUPIARA','IRAI DE MINAS','MONTE CARMELO','PATROCINIO','ROMARIA','SERRA DO SALITRE'],
'Patos de Minas':['ARAPUA','CARMO DO PARANAIBA','GUIMARANIA','LAGOA FORMOSA','MATUTINA','PATOS DE MINAS','RIO PARANAIBA','SANTA ROSA DA SERRA','SAO GOTARDO','TIROS']}
tri={c:m for m,l in TRI.items() for c in l}
d['MICRO_TRI']=np.where(d.UF=='MG',d.CID_N.map(tri),None)
d.to_pickle('sim.pkl')
print(len(d), d.PETRY_NOVA.isna().sum())
print(d[d.PETRY_NOVA.isna()].groupby(['UF','CIDADE']).size().sort_values().tail(15))
c=d[d.TRANSP=='Petrymar Transportes']
print('calib atual',(c.CUSTO_REAL/c.PETRY_ATUAL-1).describe())
print(d.MICRO_TRI.value_counts())
