import sys, math
import numpy as np, pandas as pd

PED, TAB, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ICMS = 0.07  # SP/Sul-Sudeste -> ES (interestadual). Tabela informa ICMS NÃO incluso.

t = pd.read_excel(TAB, header=None)
tab = t.iloc[4:, 2:22].copy()
tab.columns = ['CEPI', 'CEPF', 'PRAZO', 'MINIMO', 10, 20, 40, 60, 70, 100, 150, 200,
               'EXCED', 'ADVALOR', 'SECCAT', 'GRIS', 'TAS', 'PEDAGIO', 'PED_FRAC', 'ENTREGA']
tab = tab.astype(float).sort_values('CEPI').reset_index(drop=True)
FAIXAS = [10, 20, 40, 60, 70, 100, 150, 200]

d = pd.read_excel(PED, dtype={'CEP ENTREGA': str})
d.columns = d.columns.str.strip()
es = d[d['UF / CIDADE'].str.contains(r'\(ES\)', na=False)].copy()
es['CIDADE'] = es['UF / CIDADE'].str.replace(r'\s*-\s*\(ES\)', '', regex=True).str.strip()
es['CEP'] = es['CEP ENTREGA'].str.replace(r'\D', '', regex=True).astype(int)
es['MES'] = es['DATA PAGAMENTO'].dt.month.map({7: 'Jul', 8: 'Ago', 9: 'Set'})


def cota(cep, peso, nf):
    r = tab[(tab.CEPI <= cep) & (tab.CEPF >= cep)]
    if r.empty:
        return pd.Series({'TRANSUA_SEM_ICMS': np.nan, 'TRANSUA': np.nan, 'PRAZO_TRANSUA': np.nan,
                          'SECCAT': np.nan, 'MINIMO_APLICADO': False})
    r = r.iloc[0]
    fp = next((r[f] for f in FAIXAS if peso <= f), None)
    if fp is None:
        fp = r[200] + (peso - 200) * r.EXCED
    pedagio = math.ceil(peso / r.PED_FRAC) * r.PEDAGIO
    soma = fp + nf * r.ADVALOR + nf * r.GRIS + r.SECCAT + r.TAS + pedagio + r.ENTREGA
    tot = max(soma, r.MINIMO)
    return pd.Series({'TRANSUA_SEM_ICMS': round(tot, 2), 'TRANSUA': round(tot / (1 - ICMS), 2),
                      'PRAZO_TRANSUA': r.PRAZO, 'SECCAT': r.SECCAT, 'MINIMO_APLICADO': soma < r.MINIMO})


es = pd.concat([es, es.apply(lambda x: cota(x.CEP, x['PESO ITENS'], x['VALOR PRODUTOS']), axis=1)], axis=1)
es['ATUAL'] = es['COTAÇÃO TRANSPORTADOR']
es['DIF_R$'] = es['TRANSUA'] - es['ATUAL']
es['DIF_%'] = es['DIF_R$'] / es['ATUAL']
es['TRANSUA_GANHA'] = es['TRANSUA'] < es['ATUAL']
es['%NF_ATUAL'] = es['ATUAL'] / es['VALOR PRODUTOS']
es['%NF_TRANSUA'] = es['TRANSUA'] / es['VALOR PRODUTOS']
ordem = ['0 - 20', '20 - 40', '40 - 60', '60 - 70', '70 - 90', '90 - 120', '120 - 160', '160 - 200', '200 - 1500']
es['FAIXA'] = pd.Categorical(es['RANGE FRETE (KG)'], ordem, ordered=True)


def agg(g):
    return pd.Series({
        'Pedidos': len(g), 'Peso médio (kg)': g['PESO ITENS'].mean(), 'NF total': g['VALOR PRODUTOS'].sum(),
        'Custo atual': g.ATUAL.sum(), 'Custo TRANSUA': g.TRANSUA.sum(),
        'Médio atual': g.ATUAL.mean(), 'Médio TRANSUA': g.TRANSUA.mean(),
        'Dif R$': g.TRANSUA.sum() - g.ATUAL.sum(), 'Dif %': g.TRANSUA.sum() / g.ATUAL.sum() - 1,
        '% NF atual': g.ATUAL.sum() / g['VALOR PRODUTOS'].sum(),
        '% NF TRANSUA': g.TRANSUA.sum() / g['VALOR PRODUTOS'].sum(),
        '% pedidos TRANSUA mais barata': g.TRANSUA_GANHA.mean(),
        'Economia potencial (só onde ganha)': -g.loc[g.TRANSUA_GANHA, 'DIF_R$'].sum(),
        'Prazo TRANSUA (d.u.)': g.PRAZO_TRANSUA.mode().iat[0] if g.PRAZO_TRANSUA.notna().any() else np.nan,
        'Pedidos c/ SECCAT 220': int((g.SECCAT > 0).sum()),
    })


sem_tab = es[es.TRANSUA.isna()]
geral = agg(es).to_frame('ES total').T
cid = es.groupby('CIDADE').apply(agg, include_groups=False).sort_values('Pedidos', ascending=False)
top = cid.head(20).index.tolist()
t20 = es[es.CIDADE.isin(top)]
cid20 = cid.loc[top]
faixa_geral = es.groupby('FAIXA', observed=True).apply(agg, include_groups=False)
faixa20 = t20.groupby('FAIXA', observed=True).apply(agg, include_groups=False)
cid_faixa = t20.groupby(['CIDADE', 'FAIXA'], observed=True).apply(agg, include_groups=False)
cid_faixa = cid_faixa.reindex(sorted(cid_faixa.index, key=lambda k: (top.index(k[0]), ordem.index(k[1]))))

# TRANSUA vs cada transportadora (mesmos pedidos), por faixa, top 20
def vs(g):
    return pd.Series({'Pedidos': len(g), 'Médio transp.': g.ATUAL.mean(), 'Médio TRANSUA': g.TRANSUA.mean(),
                      'Dif %': g.TRANSUA.sum() / g.ATUAL.sum() - 1, '% TRANSUA ganha': g.TRANSUA_GANHA.mean()})
transp = t20.groupby('TRANSPORTADOR COTAÇÃO').apply(vs, include_groups=False).sort_values('Pedidos', ascending=False)
transp_faixa = t20.groupby(['FAIXA', 'TRANSPORTADOR COTAÇÃO'], observed=True).apply(vs, include_groups=False)
# matriz: custo médio por faixa x transportadora (top 20)
mat = t20.pivot_table(index='FAIXA', columns='TRANSPORTADOR COTAÇÃO', values='ATUAL', aggfunc='mean', observed=True)
mat['TRANSUA (mesmos pedidos)'] = t20.groupby('FAIXA', observed=True).TRANSUA.mean()
mat['Melhor atual'] = mat.drop(columns='TRANSUA (mesmos pedidos)').idxmin(axis=1)
mes = es.groupby('MES').apply(agg, include_groups=False).reindex(['Jul', 'Ago', 'Set'])

cols = ['PEDIDO HUB', 'MES', 'DATA PAGAMENTO', 'CANAL', 'ORIGEM COTAÇÃO', 'CIDADE', 'CEP ENTREGA', 'PESO ITENS', 'FAIXA',
        'VALOR PRODUTOS', 'TRANSPORTADOR COTAÇÃO', 'ATUAL', 'TRANSUA_SEM_ICMS', 'TRANSUA', 'DIF_R$', 'DIF_%',
        'TRANSUA_GANHA', '%NF_ATUAL', '%NF_TRANSUA', 'PRAZO_TRANSUA', 'SECCAT', 'MINIMO_APLICADO']
base = es[cols].rename(columns={'ATUAL': 'CUSTO ATUAL (COTAÇÃO TRANSP.)', 'TRANSUA': 'TRANSUA C/ ICMS 7%'})

with pd.ExcelWriter(OUT, engine='openpyxl') as w:
    prem = pd.DataFrame({'Premissas da simulação': [
        'Base: pedidos com destino ES, pagos de 01/07 a 30/09 (todos os status).',
        'Custo atual = coluna "COTAÇÃO TRANSPORTADOR" (custo cotado da transportadora usada).',
        'TRANSUA = tabela Intelipost: frete-peso pela faixa (até 10/20/40/60/70/100/150/200 kg; acima de 200 kg = valor 200 kg + excedente/kg)',
        '  + Ad valorem 0,3% NF + GRIS 0,2% NF + TAS R$4 + Pedágio R$3,80 a cada 100 kg (fração) + Entrega R$9,50 + SECCAT (R$220 em algumas faixas de CEP).',
        'Frete mínimo da tabela (R$95 capital/Grande Vitória, R$160 interior) aplicado sobre o total.',
        'Tabela informa ICMS NÃO incluso: valor bruto com ICMS interestadual de 7% (origem Sul/Sudeste -> ES): total / (1 - 0,07).',
        'Peso usado = PESO ITENS (sem dimensões na base, cubagem 300 kg/m³ não pôde ser aplicada).',
        f'Pedidos ES: {len(es)} | sem faixa de CEP na tabela: {len(sem_tab)}',
    ]})
    prem.to_excel(w, sheet_name='Premissas', index=False)
    pd.concat([geral, mes]).to_excel(w, sheet_name='Resumo')
    cid20.to_excel(w, sheet_name='Top20 Cidades')
    faixa20.to_excel(w, sheet_name='Top20 por Faixa')
    cid_faixa.to_excel(w, sheet_name='Top20 Cidade x Faixa')
    mat.to_excel(w, sheet_name='Faixa x Transportadora')
    transp.to_excel(w, sheet_name='TRANSUA vs Transp')
    transp_faixa.to_excel(w, sheet_name='TRANSUA vs Transp x Faixa')
    faixa_geral.to_excel(w, sheet_name='ES por Faixa')
    cid.to_excel(w, sheet_name='Todas Cidades ES')
    base.to_excel(w, sheet_name='Base Simulada', index=False)

pd.set_option('display.width', 250); pd.set_option('display.max_columns', 30); pd.set_option('display.float_format', '{:,.3f}'.format)
print('sem tabela', len(sem_tab)); print(geral.T); print(mes.T)
k = ['Pedidos', 'Peso médio (kg)', 'Médio atual', 'Médio TRANSUA', 'Dif %', '% NF atual', '% NF TRANSUA', '% pedidos TRANSUA mais barata', 'Economia potencial (só onde ganha)', 'Prazo TRANSUA (d.u.)', 'Pedidos c/ SECCAT 220']
print(cid20[k]); print(faixa20[k]); print(mat); print(transp); print(transp_faixa)
print(cid_faixa[['Pedidos', 'Médio atual', 'Médio TRANSUA', 'Dif %', '% pedidos TRANSUA mais barata']].to_string())
print(es.MINIMO_APLICADO.mean())
print(t20.groupby(['CIDADE']).apply(lambda g: g['TRANSPORTADOR COTAÇÃO'].value_counts().head(2).to_dict(), include_groups=False).loc[top])
