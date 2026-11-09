# Simulação ago–out: PROLOG proposta 29/10 (P1), PROLOG proposta 06/11 (P2), TSL tabela vigente (TS), custo real cotado (REAL)
import sys, os; sys.path.insert(0,os.path.dirname(__file__))
import tsl2, prolog, pandas as pd
D=sys.argv[1]
A=prolog.load_table(f'{D}/prolog_29-10.xlsx'); B=prolog.load_table(f'{D}/prolog_06-11.xlsx'); Nw=tsl2.load(f'{D}/tsl_vigente.xlsx')
df=pd.read_pickle(f'{D}/pedidos.pkl'); df['UF']=df['UF / CIDADE'].str.extract(r'\((\w\w)\)')
s=df[(df.UF=='RJ')&(df['ORIGEM COTAÇÃO'].str.strip()=='FILIAL SP')].copy()
s['CIDADE']=s['UF / CIDADE'].str.replace(r' - \(RJ\)','',regex=True).str.strip()
# pedidos sem nome de cidade: usa a cidade da faixa de CEP da tabela PROLOG
s.loc[s.CIDADE=='','CIDADE']=[prolog.find(A,c)['cidade'] for c in s.loc[s.CIDADE=='','CEP ENTREGA']]
z=list(zip(s['CEP ENTREGA'],s['PESO ITENS'],s['VALOR PRODUTOS']))
s['P1']=[prolog.price(prolog.find(A,c),p,nf) for c,p,nf in z]; s['P2']=[prolog.price(prolog.find(B,c),p,nf) for c,p,nf in z]
s['TS']=[tsl2.price(tsl2.find(Nw,c),p,nf) for c,p,nf in z]; s['REAL']=s['COTAÇÃO TRANSPORTADOR']
s['REG']=[{33.42:'Capital',42.72:'Metropolitana'}.get(tsl2.find(Nw,c)['faixas'][0],'Interior') for c in s['CEP ENTREGA']]
edges=[0]+prolog.BANDS+[1e9]; labels=[f'{a}-{b}' if b<1e9 else '>250' for a,b in zip(edges[:-1],edges[1:])]
s['FAIXA']=pd.cut(s['PESO ITENS'],edges,labels=labels)
s.to_pickle(f'{D}/sim.pkl')
