import pandas as pd, numpy as np, warnings; warnings.filterwarnings('ignore')
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule
s=pd.read_pickle('base_sim.pkl')
s['CIDADE']=np.where(s.CIDADE.str.strip()=='', s.CDJ_CIDADE.fillna('').str.title(), s.CIDADE)
s['TRANSP']=s['TRANSPORTADOR COTAÇÃO']
ORD=['0 - 20','20 - 40','40 - 60','60 - 70','70 - 90','90 - 120','120 - 160','160 - 200','200 - 1500']
UFS=['PE','CE','PB','RN','PA']
CAP={'PE':'RECIFE','CE':'FORTALEZA','PB':'JOAO PESSOA','RN':'NATAL','PA':'BELEM'}
c=s[s.CDJ.notna()].copy()
c['MAIS_BARATA']=c.CDJ<c.ATUAL
c['TIER']=np.where(c.CDJ_CIDADE.eq(c.UF.map(CAP)),'Capital',np.where(c.CDJ_TDA>0,'Interior c/ TDA','Interior/RM'))
c['FAIXA_CDJ']=pd.cut(c['PESO ITENS'],[0,50,100,1e9],labels=['até 50 kg','50-100 kg','>100 kg'])
def agg(g):
    return pd.Series({'Pedidos':len(g),'Peso médio (kg)':g['PESO ITENS'].mean(),'NF média':g['VALOR PRODUTOS'].mean(),
      'Custo atual médio':g.ATUAL.mean(),'CDJ simulado médio':g.CDJ.mean(),'Dif. CDJ vs atual':g.CDJ.sum()/g.ATUAL.sum()-1,
      '% pedidos CDJ + barata':g.MAIS_BARATA.mean(),'Frete/NF atual':g.ATUAL.sum()/g['VALOR PRODUTOS'].sum(),
      'Frete/NF CDJ':g.CDJ.sum()/g['VALOR PRODUTOS'].sum(),'Saldo R$ (atual − CDJ)':(g.ATUAL-g.CDJ).sum()})
def classif(d):
    return np.select([d<=-0.10,d<=0,d<=0.10,d<=0.50],['Muito competitiva','Competitiva','Próxima (ajuste fino)','Precisa melhorar'],'Muito acima')
# --- tables
uf=c.groupby('UF').apply(agg).reindex(UFS); uf.loc['TOTAL']=agg(c)
fx=c.groupby('RANGE FRETE (KG)').apply(agg).reindex(ORD).dropna(how='all')
tr=c.groupby('TRANSP').apply(agg).sort_values('Pedidos',ascending=False)
cnt=s.groupby(['UF','CIDADE']).size().rename('n').reset_index().sort_values(['UF','n'],ascending=[True,False])
top=cnt.groupby('UF').head(20).copy(); top['Rank']=top.groupby('UF').cumcount()+1
tc=c.merge(top[['UF','CIDADE','Rank']],on=['UF','CIDADE'])
t20=tc.groupby(['UF','Rank','CIDADE']).apply(agg).reset_index()
main=tc.groupby(['UF','CIDADE']).TRANSP.agg(lambda x:x.value_counts().index[0]).rename('Transp. principal atual')
info=tc.groupby(['UF','CIDADE']).agg(**{'Prazo CDJ (dias)':('CDJ_PRAZO','first'),'TDA CDJ (R$)':('CDJ_TDA','first'),'Faixa tabela CDJ':('TIER','first')})
t20=t20.merge(main,on=['UF','CIDADE']).merge(info,on=['UF','CIDADE'])
t20['Avaliação']=classif(t20['Dif. CDJ vs atual'])
nt=top.merge(t20[['UF','CIDADE']],on=['UF','CIDADE'],how='left',indicator=True); nt=nt[nt._merge=='left_only']
t20=pd.concat([t20,pd.DataFrame({'UF':nt.UF,'Rank':nt.Rank,'CIDADE':nt.CIDADE,'Pedidos':nt.n,'Avaliação':'Sem tabela CDJ'})],ignore_index=True)
t20['UF']=pd.Categorical(t20.UF,UFS); t20=t20.sort_values(['UF','Rank'])
# sem cobertura nas top
miss=top.merge(s[s.CDJ.isna()].groupby(['UF','CIDADE']).size().rename('Pedidos sem tabela').reset_index(),on=['UF','CIDADE'])
# faixa x uf (top cities)
fu=tc.groupby(['UF','RANGE FRETE (KG)']).apply(agg).reset_index()
fu['UF']=pd.Categorical(fu.UF,UFS); fu['RANGE FRETE (KG)']=pd.Categorical(fu['RANGE FRETE (KG)'],ORD); fu=fu.sort_values(['UF','RANGE FRETE (KG)'])
fu['Avaliação']=classif(fu['Dif. CDJ vs atual'])
# carrier x uf x faixa (top cities)
rows=[]
for (u,f),g in tc.groupby(['UF','RANGE FRETE (KG)']):
    r={'UF':u,'Faixa':f,'Pedidos':len(g),'CDJ médio (todos)':g.CDJ.mean()}
    best=None
    for t_,h in g.groupby('TRANSP'):
        r[f'{t_} | ped']=len(h); r[f'{t_} | custo méd']=h.ATUAL.mean(); r[f'{t_} | CDJ mesmos ped']=h.CDJ.mean(); r[f'{t_} | dif CDJ']=h.CDJ.sum()/h.ATUAL.sum()-1
        if len(h)>=3 and (best is None or h.ATUAL.mean()<best[1]): best=(t_,h.ATUAL.mean())
    r['Melhor atual (≥3 ped)']=best[0] if best else ''; r['Custo méd. melhor atual']=best[1] if best else np.nan
    r['CDJ vs melhor atual']=(r['CDJ médio (todos)']/best[1]-1) if best else np.nan
    rows.append(r)
ct=pd.DataFrame(rows); ct['UF']=pd.Categorical(ct.UF,UFS); ct['Faixa']=pd.Categorical(ct.Faixa,ORD); ct=ct.sort_values(['UF','Faixa'])
carriers=list(tr.index)
cols=['UF','Faixa','Pedidos','CDJ médio (todos)','Melhor atual (≥3 ped)','Custo méd. melhor atual','CDJ vs melhor atual']+[f'{t_} | {k}' for t_ in carriers for k in ['ped','custo méd','CDJ mesmos ped','dif CDJ']]
ct=ct.reindex(columns=cols)
# carrier x UF
cu=c.groupby(['UF','TRANSP']).apply(agg).reset_index(); cu['UF']=pd.Categorical(cu.UF,UFS); cu=cu.sort_values(['UF','Pedidos'],ascending=[True,False])
cu['Avaliação']=classif(cu['Dif. CDJ vs atual'])
# preço-alvo
pa=[]
tab=c.groupby(['UF','TIER','FAIXA_CDJ'])
for (u,ti,fb),g in tab:
    if len(g)==0: continue
    if fb=='>100 kg': continue
    taxas=g.CDJ*0.93-g.CDJ_BASE-g.CDJ_TDA
    alvo=(g.ATUAL*0.93-taxas).mean()
    atual_base=g.CDJ_BASE.mode().iloc[0] if g.CDJ_BASE.nunique()==1 else g.CDJ_BASE.mean()
    pa.append({'UF':u,'Faixa tabela':ti,'Faixa peso CDJ':str(fb),'Pedidos':len(g),'Custo atual médio':g.ATUAL.mean(),'CDJ médio':g.CDJ.mean(),
      'Valor de tabela CDJ (frete-peso)':g.CDJ_BASE.mean(),'TDA (R$)':g.CDJ_TDA.mean(),'CDJ sem TDA':(g.CDJ-g.CDJ_TDA/0.93).mean(),'Frete-peso alvo p/ empatar (sem TDA)':alvo,'Folga (+) / Redução necessária (−)':alvo/g.CDJ_BASE.mean()-1})
pa=pd.DataFrame(pa); pa['UF']=pd.Categorical(pa.UF,UFS); pa=pa.sort_values(['UF','Faixa tabela','Faixa peso CDJ'])
det=c[['PEDIDO HUB','DATA PAGAMENTO','CANAL','UF','CIDADE','CEP ENTREGA','PESO ITENS','RANGE FRETE (KG)','VALOR PRODUTOS','TRANSP','ATUAL','CDJ_CIDADE','TIER','CDJ_PRAZO','CDJ_BASE','CDJ_TAXAS','CDJ_TDA','CDJ','DIF','DIF_PCT','FRETE PEDIDO','FRETE COMERCIAL']].rename(columns={'TRANSP':'TRANSP. COTAÇÃO','ATUAL':'CUSTO ATUAL (COTAÇÃO TRANSP.)','CDJ_CIDADE':'CIDADE TABELA CDJ','TIER':'FAIXA TABELA CDJ','CDJ_PRAZO':'PRAZO CDJ','CDJ_BASE':'CDJ FRETE-PESO','CDJ_TAXAS':'CDJ TAXAS (s/ ICMS)','CDJ_TDA':'CDJ TDA','CDJ':'CDJ TOTAL c/ ICMS','DIF':'DIF R$ (CDJ − ATUAL)','DIF_PCT':'DIF %'})
nocov=s[s.CDJ.isna()][['PEDIDO HUB','UF','CIDADE','CEP ENTREGA','PESO ITENS','VALOR PRODUTOS','TRANSP','ATUAL']]
pd.to_pickle(dict(uf=uf,fx=fx,tr=tr,t20=t20,fu=fu,ct=ct,cu=cu,pa=pa,miss=miss,tc=tc,c=c),'res.pkl')
# ---------- Excel
wb=Workbook(); H=PatternFill('solid',fgColor='1F3864'); HF=Font(color='FFFFFF',bold=True); thin=Side(style='thin',color='BFBFBF')
FILL={'Sem tabela CDJ':'D9D9D9','Muito competitiva':'63BE7B','Competitiva':'C6EFCE','Próxima (ajuste fino)':'FFEB9C','Precisa melhorar':'F8CBAD','Muito acima':'E06666'}
PCT=['Dif','%','Frete/NF','Redução','vs melhor','dif CDJ','DIF %']
MONEY=['Custo','CDJ','NF','Saldo','R$','Frete-peso','FRETE','TDA','TAXAS','custo']
def fmt_for(col):
    col=str(col)
    if any(k in col for k in PCT) and 'R$' not in col: return '0.0%'
    if 'Peso' in col or 'PESO' in col: return '0.0'
    if any(k in col for k in MONEY) and 'ped' not in col.split('|')[-1].strip()[:3]: return '#,##0.00'
    return None
def write(ws,df,r0,title=None,index=False):
    if title: ws.cell(r0,1,title).font=Font(bold=True,size=12,color='1F3864'); r0+=1
    d=df.reset_index() if index else df
    for j,col in enumerate(d.columns,1):
        x=ws.cell(r0,j,str(col)); x.fill=H; x.font=HF; x.alignment=Alignment(wrap_text=True,vertical='center',horizontal='center'); x.border=Border(bottom=thin)
    ws.row_dimensions[r0].height=45
    for i,row in enumerate(d.itertuples(index=False),r0+1):
        for j,v in enumerate(row,1):
            if isinstance(v,float) and np.isnan(v): v=None
            if hasattr(v,'item'): v=v.item()
            x=ws.cell(i,j,v); f=fmt_for(d.columns[j-1]); x.border=Border(bottom=thin)
            if f and isinstance(v,(int,float)) and not isinstance(v,bool): x.number_format=f
            if d.columns[j-1]=='Avaliação' and v in FILL: x.fill=PatternFill('solid',fgColor=FILL[v])
        # color diff columns
    for j,col in enumerate(d.columns,1):
        if str(col) in ('Dif. CDJ vs atual','CDJ vs melhor atual','Folga (+) / Redução necessária (−)','DIF %') or str(col).endswith('dif CDJ'):
            L=get_column_letter(j); rng=f'{L}{r0+1}:{L}{r0+len(d)}'
            ws.conditional_formatting.add(rng,CellIsRule(operator='lessThanOrEqual',formula=['-0.1'],fill=PatternFill('solid',fgColor='63BE7B')))
            ws.conditional_formatting.add(rng,CellIsRule(operator='between',formula=['-0.1','0'],fill=PatternFill('solid',fgColor='C6EFCE')))
            ws.conditional_formatting.add(rng,CellIsRule(operator='between',formula=['0','0.1'],fill=PatternFill('solid',fgColor='FFEB9C')))
            ws.conditional_formatting.add(rng,CellIsRule(operator='greaterThan',formula=['0.1'],fill=PatternFill('solid',fgColor='F8CBAD')))
    return r0+len(d)+2
def widths(ws,w=14,first=26):
    for j in range(1,ws.max_column+1): ws.column_dimensions[get_column_letter(j)].width=w
    ws.column_dimensions['A'].width=first
ws=wb.active; ws.title='Resumo'
notes=['SIMULAÇÃO TABELA CDJ EXPRESS × CUSTO ATUAL — PE, CE, RN, PB, PA — ORIGEM COTAÇÃO = FILIAL SP — Ago a Out/2026',
'Base: 1.451 pedidos (FILIAL SP nos 5 estados); 1.424 simulados (27 com CEP fora da tabela CDJ — aba "Sem cobertura").',
'Custo atual = coluna "COTAÇÃO TRANSPORTADOR" (custo da transportadora que cotou o pedido).',
'CDJ = frete-peso (faixa ≤50 kg / ≤100 kg / excedente por kg acima de 100) + ad valorem (0,5% ou 1% NF) + GRIS 0,3% NF + TAS R$2 + CT-e R$8 + pedágio R$5/100 kg + taxa R$0,45/kg + TDA (quando houver), tudo ÷ (1 − 7% ICMS), pois a tabela informa "ICMS já calculado = N".',
'Peso usado = PESO ITENS (peso real). A tabela tem cubagem 250 kg/m³, mas a base não traz dimensões — se houver peso cubado maior, o CDJ real será maior que o simulado.',
'Dif. CDJ vs atual: negativo (verde) = CDJ mais barata; positivo (vermelho) = CDJ mais cara. Frete/NF = custo do frete ÷ valor dos produtos.']
for i,n in enumerate(notes,1):
    ws.cell(i,1,n).font=Font(bold=(i==1),size=13 if i==1 else 10,color='1F3864' if i==1 else '404040')
r=write(ws,uf,len(notes)+2,'1. Visão por estado',index=True)
r=write(ws,fx,r,'2. Visão por faixa de peso (todos os pedidos)',index=True)
r=write(ws,tr,r,'3. Transportadoras atuais × CDJ nos mesmos pedidos',index=True)
widths(ws); ws.column_dimensions['A'].width=30
ws2=wb.create_sheet('Top 20 cidades'); cols=['UF','Rank','CIDADE','Pedidos','Peso médio (kg)','NF média','Transp. principal atual','Custo atual médio','CDJ simulado médio','Dif. CDJ vs atual','% pedidos CDJ + barata','Frete/NF atual','Frete/NF CDJ','Saldo R$ (atual − CDJ)','Faixa tabela CDJ','TDA CDJ (R$)','Prazo CDJ (dias)','Avaliação']
r=1
for u in UFS: r=write(ws2,t20[t20.UF==u][cols].assign(UF=u),r,f'Top 20 cidades — {u}')
widths(ws2,13,6); ws2.column_dimensions['C'].width=26; ws2.column_dimensions['G'].width=26; ws2.column_dimensions['R'].width=20; ws2.freeze_panes='D2'
ws3=wb.create_sheet('Faixa de peso (top20)'); r=1
for u in UFS: r=write(ws3,fu[fu.UF==u].assign(UF=u,**{'RANGE FRETE (KG)':lambda x:x['RANGE FRETE (KG)'].astype(str)}),r,f'Faixa de peso — top 20 cidades — {u}')
widths(ws3,13,6); ws3.column_dimensions['B'].width=14; ws3.column_dimensions['M'].width=20
ws4=wb.create_sheet('CDJ x Transp por faixa'); ws4.cell(1,1,'Top 20 cidades por UF: custo médio de cada transportadora na faixa × CDJ simulado nos MESMOS pedidos. "Melhor atual" = transportadora de menor custo médio com ≥3 pedidos na faixa.').font=Font(italic=True)
r=3
for u in UFS: r=write(ws4,ct[ct.UF==u].assign(UF=u,Faixa=lambda x:x.Faixa.astype(str)).dropna(axis=1,how='all'),r,f'{u}')
widths(ws4,12,6); ws4.freeze_panes='C3'
ws5=wb.create_sheet('Transp x UF'); write(ws5,cu.assign(UF=cu.UF.astype(str)),1,'Transportadoras atuais por estado × CDJ nos mesmos pedidos'); widths(ws5,13,6); ws5.column_dimensions['B'].width=28
ws6=wb.create_sheet('Preço-alvo negociação'); ws6.cell(1,1,'Frete-peso que a CDJ precisaria ter (mantendo as demais taxas) para empatar com o custo médio atual em cada grupo da tabela. Negativo = quanto o frete-peso precisa cair; positivo = folga. Nos grupos com TDA o alvo já considera a retirada da TDA (com TDA não há frete-peso que empate).').font=Font(italic=True)
write(ws6,pa.assign(UF=pa.UF.astype(str)),3); widths(ws6,15,6); ws6.column_dimensions['B'].width=18
ws7=wb.create_sheet('Sem cobertura'); write(ws7,nocov,1,'Pedidos cujo CEP não está em nenhuma faixa da tabela CDJ'); widths(ws7,14,14)
ws8=wb.create_sheet('Base simulada'); write(ws8,det,1); widths(ws8,14,14); ws8.freeze_panes='A2'; ws8.auto_filter.ref=f'A1:{get_column_letter(det.shape[1])}{len(det)+1}'
import os; out='/home/user/PROJETOS/analise_cdj_express/Simulacao_CDJ_Express_NE_PA_FilialSP.xlsx'; os.makedirs(os.path.dirname(out),exist_ok=True); wb.save(out); print('ok',out)
pd.set_option('display.width',250)
print(pa.round(3).to_string()); print(miss); print(cu.round(3)[['UF','TRANSP','Pedidos','Custo atual médio','CDJ simulado médio','Dif. CDJ vs atual']].to_string())
print(ct[['UF','Faixa','Pedidos','CDJ médio (todos)','Melhor atual (≥3 ped)','Custo méd. melhor atual','CDJ vs melhor atual']].round(3).to_string())
print(t20['Avaliação'].value_counts())
print(t20[t20.Rank<=5][['UF','CIDADE','Faixa tabela CDJ','Pedidos']].to_string())
