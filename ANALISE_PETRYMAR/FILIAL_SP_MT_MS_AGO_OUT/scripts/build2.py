import sys, warnings; warnings.filterwarnings('ignore'); sys.path.insert(0,'scripts2'); sys.path.insert(0,'scripts')
import numpy as np, pandas as pd
from sim2 import G, A, BANDS
from lib import lookup
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
OUT=sys.argv[1]
d=pd.read_pickle('sim2.pkl'); f=d[d.ORIG=='FILIAL SP'].copy()
FAIXAS=['0 - 20','20 - 40','40 - 60','60 - 70','70 - 90','90 - 120','120 - 160','160 - 200','200 - 1500']
def cls(x):
    if pd.isna(x): return 'Sem cobertura'
    if x<=-0.10: return 'MUITO BEM (≥10% mais barata)'
    if x<0: return 'BEM (mais barata)'
    if x<=0.10: return 'ATENÇÃO (até 10% mais cara)'
    return 'PRECISA MELHORAR (>10% mais cara)'
def summ(g):
    c=g[g.PETRY_GRU.notna()]; ok=len(c)>0
    r={'Pedidos':len(g),'Pedidos c/ cobertura':len(c),'Peso médio (kg)':g['PESO ITENS'].mean(),'Ticket médio (R$)':g['VALOR PRODUTOS'].mean(),
     'Custo real total (R$)':c.CUSTO_REAL.sum(),'Petrymar GRU total (R$)':c.PETRY_GRU.sum(),
     'Custo real médio/pedido':c.CUSTO_REAL.mean(),'Petrymar GRU médio/pedido':c.PETRY_GRU.mean(),
     'Dif. R$/pedido':(c.PETRY_GRU-c.CUSTO_REAL).mean(),
     'Dif. %':c.PETRY_GRU.sum()/c.CUSTO_REAL.sum()-1 if ok else np.nan,
     '% Frete/Produto REAL':c.CUSTO_REAL.sum()/c['VALOR PRODUTOS'].sum() if ok else np.nan,
     '% Frete/Produto PETRYMAR GRU':c.PETRY_GRU.sum()/c['VALOR PRODUTOS'].sum() if ok else np.nan,
     '% pedidos Petrymar mais barata':(c.PETRY_GRU<c.CUSTO_REAL).mean() if ok else np.nan,
     'Economia (+) / Perda (-) R$ se só ganhar onde é mais barata':(c.CUSTO_REAL-c.PETRY_GRU).clip(lower=0).sum(),
     'Prazo Petrymar GRU (d.u.)':c.PRAZO_GRU.median(),
     'Transportadora atual':g.TRANSP.value_counts().index[0]}
    r['Redução necessária p/ empatar']=min(0,c.CUSTO_REAL.sum()/c.PETRY_GRU.sum()-1) if ok else np.nan
    r['Avaliação']=cls(r['Dif. %']); return pd.Series(r)
def bandt(df,keys,extra=True):
    rows=[]; c=df[df.PETRY_GRU.notna()]
    for k,g in c.groupby(keys+['FAIXA']):
        rows.append(dict(zip(keys+['Faixa (kg)'],k),**{'Pedidos':len(g),'Peso médio':g['PESO ITENS'].mean(),'Custo real médio':g.CUSTO_REAL.mean(),
          'Petrymar GRU médio':g.PETRY_GRU.mean(),'Dif. %':g.PETRY_GRU.sum()/g.CUSTO_REAL.sum()-1,
          '% Frete/Produto real':g.CUSTO_REAL.sum()/g['VALOR PRODUTOS'].sum(),'% Frete/Produto Petrymar GRU':g.PETRY_GRU.sum()/g['VALOR PRODUTOS'].sum(),
          '% pedidos Petrymar mais barata':(g.PETRY_GRU<g.CUSTO_REAL).mean()}))
    o=pd.DataFrame(rows); o['_f']=o['Faixa (kg)'].map({x:i for i,x in enumerate(FAIXAS)})
    o=o.sort_values(keys+['_f']).drop(columns='_f'); o['Avaliação']=o['Dif. %'].map(cls); return o
NIVEL={35.0:'1-Capital',41.0:'1-Capital',39.1:'2-Polo regional',61.0:'2-Polo regional',51.75:'3-Interior',116.0:'3-Interior',253.0:'4-Interior distante',278.0:'4-Interior distante'}
gi=lookup(G,f.cep.values); f['NIVEL']=[NIVEL.get(G.w10.iloc[i],'outro') for i in gi]
niv=[]
for (u,n),g in f.groupby(['UF','NIVEL']):
    s_=summ(g); s_['UF']=u; s_['Nível de preço da tabela GRU']=n; s_['Cidades']=', '.join(g.CIDADE.value_counts().index); niv.append(s_)
niv=pd.DataFrame(niv); niv=niv[['UF','Nível de preço da tabela GRU','Pedidos','Custo real total (R$)','Petrymar GRU total (R$)','Custo real médio/pedido','Petrymar GRU médio/pedido','Dif. %','% Frete/Produto REAL','% Frete/Produto PETRYMAR GRU','% pedidos Petrymar mais barata','Prazo Petrymar GRU (d.u.)','Avaliação','Cidades']]
# resumo
res=[]
for u in ['MT','MS']:
    s=summ(f[f.UF==u]); s['UF']=u; res.append(s)
s=summ(f); s['UF']='TOTAL'; res.append(s)
res=pd.DataFrame(res); res=res[['UF']+[c for c in res.columns if c!='UF']]
# top20
tops=[]
for u in ['MT','MS']:
    x=f[f.UF==u]
    for rk,cty in enumerate(x.CIDADE.value_counts().head(20).index,1):
        s=summ(x[x.CIDADE==cty]); s['UF']=u; s['Rank']=rk; s['Cidade']=cty; tops.append(s)
tops=pd.DataFrame(tops); tops=tops[['UF','Rank','Cidade']+[c for c in tops.columns if c not in('UF','Rank','Cidade')]]
ft=f[f.set_index(['UF','CIDADE']).index.isin(list(zip(tops.UF,tops.Cidade)))]
bt=bandt(ft,['UF']); bc=bandt(ft,['UF','TRANSP']).rename(columns={'TRANSP':'Transportadora real'})
cb=bandt(ft,['UF','CIDADE']).rename(columns={'CIDADE':'Cidade'})
# referência: todas as transportadoras/origens em MT/MS no período
ref=[]
for (u,o,t,fx),g in d[d.PETRY_GRU.notna()].groupby(['UF','ORIG','TRANSP','FAIXA']):
    ref.append({'UF':u,'Origem cotação':o,'Transportadora':t,'Faixa (kg)':fx,'Pedidos':len(g),'Peso médio':g['PESO ITENS'].mean(),
      'Custo real médio':g.CUSTO_REAL.mean(),'Custo real R$/kg':g.CUSTO_REAL.sum()/g['PESO ITENS'].sum(),
      '% Frete/Produto real':g.CUSTO_REAL.sum()/g['VALOR PRODUTOS'].sum(),
      'Petrymar GRU médio (mesmos pedidos)':g.PETRY_GRU.mean(),'Petrymar GRU R$/kg':g.PETRY_GRU.sum()/g['PESO ITENS'].sum(),
      '% Frete/Produto Petrymar GRU':g.PETRY_GRU.sum()/g['VALOR PRODUTOS'].sum(),'Dif. %':g.PETRY_GRU.sum()/g.CUSTO_REAL.sum()-1})
ref=pd.DataFrame(ref); ref['_f']=ref['Faixa (kg)'].map({x:i for i,x in enumerate(FAIXAS)}); ref=ref.sort_values(['UF','_f','Pedidos'],ascending=[True,True,False]).drop(columns='_f')
refc=[]
for (u,o,t),g in d[d.PETRY_GRU.notna()].groupby(['UF','ORIG','TRANSP']):
    refc.append({'UF':u,'Origem cotação':o,'Transportadora':t,'Pedidos':len(g),'Peso médio':g['PESO ITENS'].mean(),'Custo real médio':g.CUSTO_REAL.mean(),
     'Custo real R$/kg':g.CUSTO_REAL.sum()/g['PESO ITENS'].sum(),'% Frete/Produto real':g.CUSTO_REAL.sum()/g['VALOR PRODUTOS'].sum(),
     'Petrymar GRU médio (mesmos pedidos)':g.PETRY_GRU.mean(),'% Frete/Produto Petrymar GRU':g.PETRY_GRU.sum()/g['VALOR PRODUTOS'].sum(),'Dif. %':g.PETRY_GRU.sum()/g.CUSTO_REAL.sum()-1,
     '% pedidos Petrymar GRU mais barata':(g.PETRY_GRU<g.CUSTO_REAL).mean()})
refc=pd.DataFrame(refc).sort_values(['UF','Pedidos'],ascending=[True,False])
# tabela: níveis de preço e comparação com tabela vigente (origem matriz)
lv=G.groupby(['UF']+[f'w{b}' for b in BANDS]+['EXC']).agg(Faixas_CEP=('CIDADE','size'),Prazo_medio=('PRAZO','mean'),Exemplos=('CIDADE',lambda s:', '.join(sorted(set(s))[:8]))).reset_index().sort_values(['UF','w50'])
lv.columns=['UF']+[f'{b} kg' for b in BANDS]+['Excedente R$/kg','Faixas de CEP','Prazo médio (d.u.)','Exemplos de cidades']
m=G.merge(A,on=['CEPI','CEPF'],how='left',suffixes=('_GRU','_VIG'))
tc=pd.DataFrame({'UF':m.UF_GRU,'Cidade':m.CIDADE_GRU,'CEP ini':m.CEPI,'CEP fim':m.CEPF,'Prazo GRU':m.PRAZO_GRU,'Prazo vigente (Matriz)':m.PRAZO_VIG})
for b in [10,30,50,70,100,150,200]:
    tc[f'{b}kg GRU']=m[f'w{b}_GRU']; tc[f'{b}kg vigente']=m[f'w{b}_VIG']; tc[f'{b}kg Dif%']=m[f'w{b}_GRU']/m[f'w{b}_VIG']-1
tc['TDA GRU (R$)']=m.TDA_GRU
tc=tc.sort_values(['UF','Cidade'])
taxas=pd.DataFrame([
 ['Frete-peso','Faixas 10/20/30/50/70/100/150/200 kg + excedente/kg','Faixas 10/20/30/50/70/100/150/200 kg + excedente/kg'],
 ['Ad valorem','0,28% (MT/MS) sobre NF','0,28% sobre NF'],
 ['GRIS','0,18% sobre NF','0,15% sobre NF'],
 ['Pedágio','R$ 6,31 a cada 100 kg','R$ 1,90 a cada 100 kg'],
 ['Taxa de entrega / CT-e','R$ 3,80 (entrega)','R$ 1,20 (CT-e fixo)'],
 ['TRT','5% sobre frete-peso','não tem'],
 ['Outra taxa','não tem','R$ 0,45 a cada 1 kg (≈ R$ 22,50 num pedido de 50 kg) - CONFIRMAR com a Petrymar'],
 ['TDA','não tem','R$ 350 a R$ 950 em 7 cidades'],
 ['ICMS','Não incluso (7%)','Não informado na tabela - simulado como não incluso (7%)'],
],columns=['Componente','Tabela reajustada (origem Matriz, out/2026)','Tabela GUARULHOS (nova proposta Filial SP)'])
tda=G[G.TDA>0][['UF','CIDADE','CEPI','CEPF','TDA','w50']]; tda.columns=['UF','Cidade','CEP ini','CEP fim','TDA (R$)','50 kg (R$)']
# sensibilidade
sen=[]
for u in ['MT','MS','TOTAL']:
    g=f if u=='TOTAL' else f[f.UF==u]; g=g[g.PETRY_GRU.notna()]
    for nm,col in [('Cenário base (ICMS 7% por fora, outra taxa R$0,45/kg)','PETRY_GRU'),('Sem ICMS (se a tabela já incluir ICMS)','PETRY_GRU_SEM_ICMS'),('Outra taxa R$0,45 fixa por pedido','PETRY_GRU_OUTRA_FIXA')]:
        sen.append({'UF':u,'Cenário':nm,'Custo real (R$)':g.CUSTO_REAL.sum(),'Petrymar GRU (R$)':g[col].sum(),'Dif. %':g[col].sum()/g.CUSTO_REAL.sum()-1,'% pedidos Petrymar mais barata':(g[col]<g.CUSTO_REAL).mean()})
sen=pd.DataFrame(sen)
base=f[['PEDIDO HUB','NOTA','DATA PAGAMENTO','CANAL','UF','CIDADE','NIVEL','CEP ENTREGA','PESO ITENS','FAIXA','VALOR PRODUTOS','FRETE PEDIDO','TRANSP','CUSTO_REAL','PETRY_GRU','PRAZO_GRU','TDA_GRU','CIDADE_TAB','PETRY_GRU_SEM_ICMS','PETRY_GRU_OUTRA_FIXA']].copy()
base['Dif R$']=base.PETRY_GRU-base.CUSTO_REAL; base['Dif %']=base.PETRY_GRU/base.CUSTO_REAL-1
base['% Frete/Prod real']=base.CUSTO_REAL/base['VALOR PRODUTOS']; base['% Frete/Prod Petrymar GRU']=base.PETRY_GRU/base['VALOR PRODUTOS']
base['Petrymar mais barata?']=np.where(base.PETRY_GRU.isna(),'SEM COBERTURA',np.where(base.PETRY_GRU<base.CUSTO_REAL,'SIM','NÃO'))
base.columns=['Pedido HUB','Nota','Data pagamento','Canal','UF','Cidade','Nível tabela GRU','CEP','Peso (kg)','Faixa (kg)','Valor produtos','Frete cobrado cliente','Transportadora real','Custo real transportadora','Petrymar GRU (simulado)','Prazo Petrymar GRU','TDA (R$)','Cidade na tabela','Petrymar GRU sem ICMS','Petrymar GRU outra taxa fixa','Dif R$','Dif %','% Frete/Prod real','% Frete/Prod Petrymar GRU','Petrymar mais barata?']
pd.to_pickle(dict(res=res,tops=tops,bt=bt,bc=bc,cb=cb,ref=ref,refc=refc,sen=sen,tc=tc,lv=lv,tda=tda),'results2.pkl')
# ---------- writer
wb=Workbook(); wb.remove(wb.active)
HF=Font(bold=True,color='FFFFFF'); HFILL=PatternFill('solid',fgColor='1F4E78'); thin=Side(style='thin',color='BFBFBF')
FILLS={'MUITO BEM':'C6EFCE','BEM (':'E2EFDA','ATENÇÃO':'FFEB9C','PRECISA':'FFC7CE','Sem cob':'D9D9D9'}
def fmt_for(col):
    cl=col.lower()
    if '%' in cl or 'redução' in cl: return '0.0%'
    if cl.startswith('dif. r$'): return '#,##0.00'
    if 'prazo' in cl or 'pedidos' in cl or 'faixas de cep' in cl or 'cep' in cl or 'rank' in cl or cl in('nota','pedido hub'): return None
    if 'peso' in cl: return '0.0'
    if any(k in cl for k in ['r$','custo','petrymar','médio','ticket','valor','frete','excedente','kg','tda','economia']): return '#,##0.00'
    return None
def write(ws,df,r0,title=None,note=None):
    if title: ws.cell(r0,1,title).font=Font(bold=True,size=13,color='1F4E78'); r0+=1
    if note: ws.cell(r0,1,note).font=Font(italic=True,color='595959'); r0+=1
    for j,col in enumerate(df.columns,1):
        c=ws.cell(r0,j,col); c.font=HF; c.fill=HFILL; c.alignment=Alignment(wrap_text=True,vertical='center',horizontal='center')
    ws.row_dimensions[r0].height=45; fm=[fmt_for(str(cn)) for cn in df.columns]
    for i,row in enumerate(df.itertuples(index=False),r0+1):
        fill=None
        for v in row:
            if isinstance(v,str):
                for k,fc in FILLS.items():
                    if v.startswith(k): fill=PatternFill('solid',fgColor=fc)
        for j,v in enumerate(row,1):
            if isinstance(v,float) and np.isnan(v): v=None
            if isinstance(v,np.integer): v=int(v)
            if isinstance(v,np.floating): v=float(v)
            c=ws.cell(i,j,v); c.border=Border(bottom=thin)
            if fm[j-1] and isinstance(v,(int,float)): c.number_format=fm[j-1]
            if fill and (df.columns[j-1]=='Avaliação' or j<=3): c.fill=fill
    for j,col in enumerate(df.columns,1):
        L=get_column_letter(j); cur=ws.column_dimensions[L].width or 0
        w=max(12,min(40,max([len(str(x)) for x in df.iloc[:,j-1].head(200)]+[len(str(col))*0.6+4,8])+2))
        if w>cur: ws.column_dimensions[L].width=w
    return r0+len(df)+3
from leiame2 import TXT
ws=wb.create_sheet('1-LEIA-ME')
for i,(t,k) in enumerate(TXT,1):
    c=ws.cell(i,1,t); c.alignment=Alignment(wrap_text=True,vertical='top')
    if k=='T': c.font=Font(bold=True,size=14,color='1F4E78')
    elif k=='H': c.font=Font(bold=True,size=12,color='FFFFFF'); c.fill=PatternFill('solid',fgColor='1F4E78')
ws.column_dimensions['A'].width=180
NOTE='Avaliação: MUITO BEM ≤ -10% | BEM < 0% | ATENÇÃO até +10% | PRECISA MELHORAR > +10% (Petrymar GRU vs custo real). Custo real = COTAÇÃO TRANSPORTADOR. % Frete/Produto = custo do frete ÷ valor dos produtos.'
S={'2-Resumo MT e MS':[(res,'RESUMO - PEDIDOS ORIGEM FILIAL SP (ago-out/2026) SIMULADOS NA TABELA PETRYMAR GUARULHOS',NOTE),(niv,'RESULTADO POR NÍVEL DE PREÇO DA TABELA GUARULHOS','A tabela tem 4 níveis por UF (valor de 10 kg): MS 35 / 39,10 / 51,75 / 253 e MT 41 / 61 / 116 / 278. O nível 4 parece ser de redespacho.'),(sen,'SENSIBILIDADE DAS PREMISSAS',None)],
 '3-Top20 Cidades':[(tops,'TOP 20 CIDADES MAIS VENDIDAS - MT e MS - ORIGEM FILIAL SP',NOTE)],
 '4-Faixa de Peso':[(bt,'FAIXAS DE PESO - TOP 20 CIDADES - POR UF',None),(bc,'FAIXAS DE PESO x TRANSPORTADORA QUE ATENDEU (mesmos pedidos)',None)],
 '5-Cidade x Faixa':[(cb,'TOP 20 CIDADES x FAIXA DE PESO',None)],
 '6-Demais Transportadoras':[(refc,'TODAS AS TRANSPORTADORAS/ORIGENS QUE ATENDERAM MT e MS NO PERÍODO (resumo)','Referência: inclui os pedidos da MATRIZ. "Petrymar GRU (mesmos pedidos)" = quanto custaria se o pedido saísse da Filial SP pela tabela Guarulhos.'),
    (ref,'TODAS AS TRANSPORTADORAS/ORIGENS x FAIXA DE PESO',None)],
 '7-Tabela GRU x Vigente':[(taxas,'ESTRUTURA DE TAXAS - TABELA GUARULHOS x TABELA REAJUSTADA (MATRIZ)',None),(lv,'NÍVEIS DE PREÇO DA TABELA GUARULHOS (frete-peso, R$)',None),(tda,'CIDADES COM TDA NA TABELA GUARULHOS',None),
    (tc,'FRETE-PESO POR CIDADE - GUARULHOS x TABELA VIGENTE PETRYMAR (origem Matriz)','Tabela vigente = TABELA ATUAL PETRYMAR enviada anteriormente. Dif% < 0 = Guarulhos mais barata no frete-peso.')],
 '9-Matriz x Filial SP':__import__('cmp_blocks').blocks(pd.read_pickle('sim3.pkl')),
 '8-Base Simulada':[(base,'BASE PEDIDO A PEDIDO - MT e MS - ORIGEM FILIAL SP',None)]}
for name,bl in S.items():
    ws=wb.create_sheet(name); r=1
    for b in bl: r=write(ws,b[0],r,b[1],b[2])
ws=wb['8-Base Simulada']; ws.freeze_panes='A3'; ws.auto_filter.ref=f'A2:{get_column_letter(base.shape[1])}{base.shape[0]+2}'
wb.save(OUT); print('ok')
