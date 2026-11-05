import numpy as np, pandas as pd
FAIXAS=['0 - 20','20 - 40','40 - 60','60 - 70','70 - 90','90 - 120','120 - 160','160 - 200','200 - 1500']
def _s(g):
    return {'Pedidos':len(g),'Peso médio (kg)':g['PESO ITENS'].mean(),
     'Custo real pago (R$)':g.CUSTO_REAL.sum(),'Petrymar MATRIZ vigente (R$)':g.PETRY_MATRIZ_ATUAL.sum(),
     'Petrymar MATRIZ reajustada out/26 (R$)':g.PETRY_MATRIZ_REAJ.sum(),'Petrymar GUARULHOS (R$)':g.PETRY_GRU.sum(),
     'GRU vs MATRIZ vigente %':g.PETRY_GRU.sum()/g.PETRY_MATRIZ_ATUAL.sum()-1,
     'GRU vs MATRIZ reajustada %':g.PETRY_GRU.sum()/g.PETRY_MATRIZ_REAJ.sum()-1,
     'GRU sem "outra taxa" vs MATRIZ vigente %':g.GRU_SEM_OUTRA.sum()/g.PETRY_MATRIZ_ATUAL.sum()-1,
     'Dif. R$/pedido (GRU - MATRIZ vigente)':(g.PETRY_GRU-g.PETRY_MATRIZ_ATUAL).mean(),
     '% pedidos GRU mais barata que MATRIZ vigente':(g.PETRY_GRU<g.PETRY_MATRIZ_ATUAL).mean(),
     '% Frete/Produto MATRIZ vigente':g.PETRY_MATRIZ_ATUAL.sum()/g['VALOR PRODUTOS'].sum(),
     '% Frete/Produto GRU':g.PETRY_GRU.sum()/g['VALOR PRODUTOS'].sum(),
     'Prazo médio MATRIZ (d.u.)':g.PRAZO_MATRIZ_ATUAL.mean(),'Prazo médio GRU (d.u.)':g.PRAZO_GRU.mean()}
def grp(df,keys,order=None):
    rows=[dict(zip(keys,k if isinstance(k,tuple) else (k,)),**_s(g)) for k,g in df.groupby(keys)]
    o=pd.DataFrame(rows)
    if 'Faixa (kg)' in keys: o['_f']=o['Faixa (kg)'].map({x:i for i,x in enumerate(FAIXAS)}); o=o.sort_values([k for k in keys if k!='Faixa (kg)']+['_f']).drop(columns='_f')
    return o
def blocks(d):
    d=d.copy()
    d['OUTRA']=d.ped_GRU-d['PESO ITENS'].apply(lambda p:-(-p//100))*1.9
    d['GRU_SEM_OUTRA']=d.PETRY_GRU-d.OUTRA/0.93
    d=d.rename(columns={'FAIXA':'Faixa (kg)','NIVEL':'Nível tabela GRU','ORIG':'Origem cotação','CIDADE':'Cidade'})
    pm=d[(d['Origem cotação']=='MATRIZ')&(d.TRANSP=='Petrymar Transportes')]
    fs=d[d['Origem cotação']=='FILIAL SP']
    tot=pd.concat([grp(pm,['UF']).assign(Base='Pedidos MATRIZ feitos pela Petrymar'),grp(pm.assign(UF='MT+MS'),['UF']).assign(Base='Pedidos MATRIZ feitos pela Petrymar'),
                   grp(fs,['UF']).assign(Base='Pedidos FILIAL SP (Atual Cargas)'),grp(fs.assign(UF='MT+MS'),['UF']).assign(Base='Pedidos FILIAL SP (Atual Cargas)')])
    tot=tot[['Base']+[c for c in tot.columns if c!='Base']]
    top=[]
    for u in ['MT','MS']:
        x=pm[pm.UF==u]
        for rk,c in enumerate(x.Cidade.value_counts().head(20).index,1):
            top.append(dict(UF=u,Rank=rk,Cidade=c,**_s(x[x.Cidade==c])))
    top=pd.DataFrame(top)
    comp=[]
    for u,g in pm.groupby('UF'):
        for nm,a,b in [('Frete-peso','fp_MAT','fp_GRU'),('TRT (5-6% s/ frete-peso)','trt_MAT','trt_GRU'),('Pedágio','ped_MAT',None),('"Outra taxa" R$0,45/kg',None,'OUTRA'),('Ad valorem','adv_MAT','adv_GRU'),('GRIS','gris_MAT','gris_GRU'),('Taxa entrega / CT-e / TDA','taxas_MAT','taxas_GRU')]:
            va=g[a].mean() if a else 0.0
            if nm=='Pedágio': vb=(g.ped_GRU-g.OUTRA).mean()
            else: vb=g[b].mean() if b else 0.0
            comp.append({'UF':u,'Componente (média por pedido, sem ICMS)':nm,'MATRIZ vigente (R$)':va,'GUARULHOS (R$)':vb,'Dif. R$':vb-va})
    comp=pd.DataFrame(comp)
    return [(tot,'MESMA TRANSPORTADORA, DUAS OPERAÇÕES: TABELA PETRYMAR MATRIZ x TABELA PETRYMAR GUARULHOS (mesmos pedidos, ago-out/2026)',
             'Cada pedido foi recalculado nas 3 tabelas Petrymar. A tabela MATRIZ vigente reproduz o custo real pago (diferença < 1%). ICMS 7% nas três.'),
            (comp,'DE ONDE VEM A DIFERENÇA - componentes do frete (pedidos MATRIZ feitos pela Petrymar)',None),
            (grp(pm,['UF','Nível tabela GRU']),'POR NÍVEL DE PREÇO DA TABELA GUARULHOS - pedidos MATRIZ feitos pela Petrymar',None),
            (grp(pm,['UF','Faixa (kg)']),'POR FAIXA DE PESO - pedidos MATRIZ feitos pela Petrymar',None),
            (top,'TOP 20 CIDADES (pedidos MATRIZ feitos pela Petrymar)',None),
            (grp(fs,['UF','Faixa (kg)']),'POR FAIXA DE PESO - pedidos FILIAL SP',None)]
