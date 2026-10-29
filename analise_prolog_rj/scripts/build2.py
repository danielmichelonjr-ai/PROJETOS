# Comparativo PROLOG FILIAL SP x TSL FILIAL SP — pedidos RJ origem FILIAL SP (jul–set)
import sys, os; sys.path.insert(0,os.path.dirname(__file__))
import prolog, tsl
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import ColorScaleRule, CellIsRule
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter as L
DATA=sys.argv[1]; OUT=sys.argv[2]
P=prolog.load_table(f'{DATA}/prolog.xlsx'); T=tsl.load_tsl(f'{DATA}/tsl.xlsx')
def tfind(c): return tsl.find(T,c) or tsl.find(T,int(c)+1)
def reg(t): return {39.83:'Capital',48.69:'Metropolitana'}.get(t['faixas'][0],'Interior')
s=pd.read_pickle(f'{DATA}/sim.pkl').sort_values('DATA PAGAMENTO')
BANDS=prolog.BANDS; labels=list(s.FAIXA.cat.categories)[:-1]  # sem '>250' (nenhum pedido)
top=s.CIDADE.value_counts().head(20).index.tolist()
F='Arial'; H=Font(name=F,bold=True,color='FFFFFF'); HF=PatternFill('solid',fgColor='1F4E78'); HF2=PatternFill('solid',fgColor='C55A11'); HF3=PatternFill('solid',fgColor='548235')
BB=Font(name=F,bold=True); BLUE=Font(name=F,color='0000FF'); T14=Font(name=F,bold=True,size=14); NOTE=Font(name=F,italic=True,color='595959')
thin=Side(style='thin',color='BFBFBF'); BOR=Border(top=thin,bottom=thin,left=thin,right=thin)
MON='R$ #,##0.00;-R$ #,##0.00;-'; PCT='0.0%;-0.0%;-'; SPCT='+0.0%;-0.0%;0.0%'
YEL=PatternFill('solid',fgColor='FFFF00')
GRN_RED=lambda lo,hi: ColorScaleRule(start_type='num',start_value=lo,start_color='63BE7B',mid_type='num',mid_value=0,mid_color='FFFFFF',end_type='num',end_value=hi,end_color='F8696B')
wb=Workbook()
def hdr(ws,row,cols,start=1,fill=HF,h=None):
    for j,c in enumerate(cols):
        x=ws.cell(row,start+j,c); x.font=H; x.fill=fill; x.alignment=Alignment(wrap_text=True,horizontal='center',vertical='center'); x.border=BOR
    if h: ws.row_dimensions[row].height=h
def put(ws,r,c,v,nf=None,font=None,border=True):
    x=ws.cell(r,c,v)
    if nf: x.number_format=nf
    if font: x.font=font
    if border: x.border=BOR
    return x
# ================= Resumo (premissas primeiro: outras abas referenciam)
ws=wb.active; ws.title='Resumo'
ws['A1']='PROLOG FILIAL SP x TSL FILIAL SP — pedidos RJ com origem de cotação FILIAL SP (jul–set/2026)'; ws['A1'].font=T14
ws['A3']='PREMISSAS (células em azul podem ser alteradas)'; ws['A3'].font=BB
hdr(ws,4,['Parâmetro','PROLOG','TSL','Fonte / observação'])
prem=[('ICMS por fora (gross-up: total = subtotal / (1 − alíquota))',0.12,0.12,'Confirmado pelo usuário: 12% por fora. Ambas as tabelas marcadas "ICMS incluso = N".','0.0%'),
 ('Ad valorem / frete valor (% NF)',0.001,0,'Tabelas Intelipost','0.00%'),
 ('GRIS (% NF)',0.002,0.002,'Tabelas Intelipost','0.00%'),
 ('Seguro (% NF)',0,0.002,'Tabela TSL','0.00%'),
 ('TAS / entrega fixo (R$ por pedido)',1,11.9,'PROLOG: TAS R$ 1,00 | TSL: entrega fixo R$ 11,90',MON),
 ('Pedágio (R$ por fração de 100 kg)',4.5,1,'Tabelas Intelipost',MON),
 ('TRT (% sobre o subtotal)',0,0.055,'TSL 5,5%. Base validada: subtotal (frete peso + taxas) — reproduz 100% das cotações reais TSL Filial SP ao centavo','0.0%'),
 ('CTe (R$ por kg)',0.06,0,'Tabela PROLOG (faixa de 1 kg)',MON),
 ('Taxa interna (R$ por kg) — levar produto até a filial SP',0.45,0,'Confirmado pelo usuário: taxa interna obrigatória, lançada na tabela PROLOG como "outra taxa". NÃO consta na tabela TSL.',MON),
 ('Cubagem (kg/m³)',0,300,'Sem dimensões na base: simulado por peso real (as cotações TSL reais batem com peso real)','0')]
for k,(a,p,t,o,nf) in enumerate(prem,5):
    put(ws,k,1,a); put(ws,k,2,p,nf,BLUE); put(ws,k,3,t,nf,BLUE); put(ws,k,4,o)
ws['B5'].fill=YEL; ws['C5'].fill=YEL
PR={'icms':'Resumo!$B$5','trt':'Resumo!$C$11','gris_t':'Resumo!$C$7','seg_t':'Resumo!$C$8','ent':'Resumo!$C$9','ped_t':'Resumo!$C$10',
    'adv_p':'Resumo!$B$6','gris_p':'Resumo!$B$7','tas':'Resumo!$B$9','ped_p':'Resumo!$B$10','cte':'Resumo!$B$12','tx':'Resumo!$B$13','icms_t':'Resumo!$C$5'}
# ================= Pedidos
wp=wb.create_sheet('Pedidos')
cols=['Pedido HUB','Data pagamento','Canal','CEP','CEP (nº)','Cidade','Região TSL','Faixa (kg)','Peso (kg)','Valor NF (R$)','Transportadora cotada','Custo real cotado (R$)',
 'TSL frete peso','TSL GRIS','TSL seguro','TSL pedágio','TSL entrega','TSL TRT','TSL subtotal','TSL total c/ ICMS',
 'PROLOG frete peso','PROLOG ad valorem','PROLOG GRIS','PROLOG TAS','PROLOG pedágio','PROLOG CTe','PROLOG taxa interna','PROLOG subtotal','PROLOG total c/ ICMS','PROLOG s/ taxa interna c/ ICMS',
 'Dif. PROLOG − TSL (R$)','Dif. %','PROLOG mais barata?','Prazo TSL (du)','Prazo PROLOG (du)','Top 20?']
hdr(wp,1,cols,h=48)
for j in range(13,21): wp.cell(1,j).fill=HF2
for j in range(21,31): wp.cell(1,j).fill=HF3
import math
for i,(ix,r) in enumerate(s.iterrows(),start=2):
    tt=tfind(r['CEP ENTREGA']); pp=prolog.find(P,r['CEP ENTREGA']); w=r['PESO ITENS']
    fpt=tt['faixas'][next(k for k,b in enumerate(BANDS) if w<=b)] if w<=250 else None
    fpp=pp['faixas'][next(k for k,b in enumerate(BANDS) if w<=b)] if w<=250 else None
    v=[r['PEDIDO HUB'],r['DATA PAGAMENTO'],r['CANAL'],r['CEP ENTREGA'],int(r['CEP ENTREGA']),r['CIDADE'],reg(tt),str(r['FAIXA']),w,r['VALOR PRODUTOS'],r['TRANSPORTADOR COTAÇÃO'],r['ATUAL'],fpt]
    for j,x in enumerate(v,1): wp.cell(i,j,x)
    f={14:f'=J{i}*{PR["gris_t"]}',15:f'=J{i}*{PR["seg_t"]}',16:f'={PR["ped_t"]}*CEILING(I{i}/100,1)',17:f'={PR["ent"]}',18:f'=SUM(M{i}:Q{i})*{PR["trt"]}',
       19:f'=SUM(M{i}:R{i})',20:f'=S{i}/(1-{PR["icms_t"]})',21:fpp,22:f'=J{i}*{PR["adv_p"]}',23:f'=J{i}*{PR["gris_p"]}',24:f'={PR["tas"]}',
       25:f'={PR["ped_p"]}*CEILING(I{i}/100,1)',26:f'={PR["cte"]}*CEILING(I{i},1)',27:f'={PR["tx"]}*CEILING(I{i},1)',28:f'=SUM(U{i}:AA{i})',
       29:f'=AB{i}/(1-{PR["icms"]})',30:f'=(AB{i}-AA{i})/(1-{PR["icms"]})',31:f'=AC{i}-T{i}',32:f'=AC{i}/T{i}-1',33:f'=IF(AC{i}<T{i},"SIM","NÃO")',
       34:tt['prazo'],35:pp['prazo'],36:'SIM' if r['CIDADE'] in top else 'NÃO'}
    for j,x in f.items(): wp.cell(i,j,x)
    wp.cell(i,2).number_format='dd/mm/yyyy'
    for j in [10,12]+list(range(13,32)): wp.cell(i,j).number_format=MON
    wp.cell(i,32).number_format=SPCT
N=len(s); wp.freeze_panes='G2'; wp.auto_filter.ref=f'A1:AJ{N+1}'
for j in range(1,37): wp.column_dimensions[L(j)].width=12
wp.column_dimensions['F'].width=22; wp.column_dimensions['K'].width=20; wp.column_dimensions['E'].hidden=True
R=lambda c:f'Pedidos!${c}$2:${c}${N+1}'
# ---- Resumo: visão geral
r0=17; ws.cell(r0,1,'VISÃO GERAL — mesmos 2.223 pedidos cotados pelas duas tabelas').font=BB
hdr(ws,r0+1,['Indicador','TSL FILIAL SP','PROLOG FILIAL SP','Diferença'])
vg=[('Pedidos',f'=COUNTA({R("A")})',f'=COUNTA({R("A")})',None,'0'),
    ('Custo total de frete',f'=SUM({R("T")})',f'=SUM({R("AC")})','p',MON),
    ('Custo médio por pedido',f'=AVERAGE({R("T")})',f'=AVERAGE({R("AC")})','p',MON),
    ('Frete / NF',f'=SUM({R("T")})/SUM({R("J")})',f'=SUM({R("AC")})/SUM({R("J")})','pp',PCT),
    ('% pedidos em que a PROLOG ganharia a cotação',None,f'=COUNTIF({R("AG")},"SIM")/B{r0+2}',None,PCT),
    ('PROLOG sem a taxa interna — custo médio',f'=B{r0+4}',f'=AVERAGE({R("AD")})','p',MON),
    ('Prazo médio (dias úteis)',f'=AVERAGE({R("AH")})',f'=AVERAGE({R("AI")})','d','0.0'),
    ('Conferência: custo real cotado (todas transportadoras)',f'=SUM({R("L")})',None,None,MON)]
for k,(a,x,y,d,nf) in enumerate(vg,r0+2):
    put(ws,k,1,a); put(ws,k,2,x,nf); put(ws,k,3,y,nf)
    put(ws,k,4,{'p':f'=C{k}/B{k}-1','pp':f'=C{k}-B{k}','d':f'=C{k}-B{k}'}.get(d),{'p':SPCT,'pp':'+0.0%;-0.0%','d':'+0.0;-0.0'}.get(d,None))
ws.cell(r0+10,1,'A tabela TSL simulada reproduz as cotações reais da TSL Filial SP (1.592 pedidos) com diferença máxima de R$ 0,01 — o motor de cálculo está validado.').font=NOTE
# ---- Resumo: decomposição
r1=r0+12; ws.cell(r1,1,'DE ONDE VEM A DIFERENÇA — média por pedido (R$)').font=BB
hdr(ws,r1+1,['Componente','TSL','PROLOG','PROLOG − TSL','% da diferença'])
comp=[('Frete peso','M','U'),('Ad valorem',None,'V'),('GRIS','N','W'),('Seguro','O',None),('TAS / Entrega fixo','Q','X'),('Pedágio','P','Y'),('TRT 5,5%','R',None),('CTe por kg',None,'Z'),('Taxa interna R$ 0,45/kg',None,'AA')]
for k,(a,ct,cp) in enumerate(comp,r1+2):
    put(ws,k,1,a); put(ws,k,2,f'=AVERAGE({R(ct)})' if ct else 0,MON); put(ws,k,3,f'=AVERAGE({R(cp)})' if cp else 0,MON)
    put(ws,k,4,f'=C{k}-B{k}',MON); put(ws,k,5,f'=D{k}/$D${r1+13}',SPCT)
k=r1+11; put(ws,k,1,'ICMS 12% por fora'); put(ws,k,2,f'=AVERAGE({R("T")})-AVERAGE({R("S")})',MON); put(ws,k,3,f'=AVERAGE({R("AC")})-AVERAGE({R("AB")})',MON); put(ws,k,4,f'=C{k}-B{k}',MON); put(ws,k,5,f'=D{k}/$D${r1+13}',SPCT)
k=r1+13; put(ws,k,1,'TOTAL',font=BB); put(ws,k,2,f'=SUM(B{r1+2}:B{r1+11})',MON,BB); put(ws,k,3,f'=SUM(C{r1+2}:C{r1+11})',MON,BB); put(ws,k,4,f'=C{k}-B{k}',MON,BB); put(ws,k,5,f'=D{k}/$D${k}',SPCT,BB)
ws.conditional_formatting.add(f'D{r1+2}:D{r1+11}',GRN_RED(-12,35))
for c,w in zip('ABCDE',[60,20,20,18,16]): ws.column_dimensions[c].width=w
ws.column_dimensions['D'].width=70
# ================= Comparativo das tabelas (estrutura)
wc=wb.create_sheet('Comparativo Tabelas',1)
wc['A1']='Estrutura das tabelas — principais diferenças'; wc['A1'].font=T14
hdr(wc,3,['Item','PROLOG FILIAL SP','TSL FILIAL SP','Quem leva vantagem','Comentário / oportunidade'],h=30)
itens=[('Regionalização do RJ','93 faixas de CEP, 9 níveis de preço','93 faixas de CEP, só 3 níveis: Capital, Metropolitana (10 faixas), Interior (82)','—','A TSL tem preço único por região; a PROLOG pode ser agressiva onde tem operação própria'),
 ('Frete peso — Capital (20 a 35 kg)','R$ 82,21','R$ 54,10','TSL','A PROLOG está 52% acima na base; é o maior gap de valor (46% dos pedidos)'),
 ('Frete peso — Capital (40 a 50 kg)','R$ 93,97','R$ 71,00','TSL','+32%'),
 ('Frete peso — Capital (50 a 60 kg)','R$ 112,30','R$ 79,81','TSL','+41%'),
 ('Taxa fixa por pedido','TAS R$ 1,00','Entrega R$ 11,90','PROLOG','R$ 10,90 a menos por pedido — vantagem forte em pedidos leves'),
 ('TRT','não cobra','5,5% sobre o subtotal','PROLOG','≈ R$ 5,57 por pedido a favor da PROLOG'),
 ('Ad valorem / Seguro','0,1% NF','0,2% NF','PROLOG','Pequeno (≈ R$ 0,64 a favor)'),
 ('GRIS','0,2% NF','0,2% NF','Empate',''),
 ('Pedágio','R$ 4,50 / 100 kg','R$ 1,00 / 100 kg','TSL','R$ 3,50 a mais por pedido — fácil de negociar para R$ 1,00'),
 ('CTe','R$ 0,06 por kg','não cobra','TSL','≈ R$ 3,00 por pedido; pedir para transformar em fixo ou zerar'),
 ('Taxa interna (filial SP)','R$ 0,45 por kg (na tabela)','não consta','TSL','≈ R$ 22,60 + ICMS = R$ 25,70 por pedido de penalidade. Se é um custo da operação da filial SP, deveria estar em TODAS as tabelas que saem da filial (inclusive TSL), senão a PROLOG concorre em desvantagem na Intelipost'),
 ('Cubagem','não aplica (0)','300 kg/m³','PROLOG','Vantagem para produtos volumosos (não medida: base sem dimensões)'),
 ('Excedente acima de 250 kg','R$ 7,71 a 12,05 / kg','R$ 0,91 a 1,28 / kg','TSL','Sem pedidos acima de 250 kg no período; mesmo assim, o excedente da PROLOG está fora de mercado'),
 ('Prazo — Capital','5 dias úteis','8 dias úteis','PROLOG','3 dias mais rápido'),
 ('Prazo — Metropolitana','5 a 7 dias úteis','10 dias úteis','PROLOG','3 a 5 dias mais rápido'),
 ('Prazo — Interior','6 a 11 dias úteis','13 dias úteis','PROLOG','2 a 7 dias mais rápido'),
 ('Inconsistência na tabela TSL','—','Interior, faixa 170 a 200 kg = R$ 143,51 (menor que a faixa 150 a 170 kg = R$ 215,70)','—','Provável erro de digitação na TSL (deveria ser ~R$ 243). Hoje favorece a TSL nessa faixa')]
for k,row in enumerate(itens,4):
    for j,v in enumerate(row,1):
        x=put(wc,k,j,v); x.alignment=Alignment(wrap_text=True,vertical='top')
    c=wc.cell(k,4); c.font=Font(name=F,bold=True,color={'PROLOG':'548235','TSL':'C00000'}.get(row[3],'000000'))
for c,w in zip('ABCDE',[30,28,34,16,70]): wc.column_dimensions[c].width=w
# ================= Frete peso por faixa — top 20 (tabela x tabela)
wf=wb.create_sheet('Frete Peso Top 20',2)
wf['A1']='Frete peso por faixa (valor de tabela, antes de taxas e ICMS) — PROLOG x TSL nas top 20 cidades'; wf['A1'].font=T14
wf['A2']='Bloco 3 = quanto a PROLOG está acima (+) ou abaixo (−) da TSL apenas no frete peso.'; wf['A2'].font=NOTE
def cityrow(c):
    cep=int(s.loc[s.CIDADE==c,'CEP ENTREGA'].iloc[0]); return prolog.find(P,cep),tfind(cep)
blocks=[('1) PROLOG — frete peso (R$)',HF3),('2) TSL — frete peso (R$)',HF2),('3) PROLOG vs TSL (%)',HF)]
r=4; starts=[]
for bi,(title,fill) in enumerate(blocks):
    wf.cell(r,1,title).font=BB; hdr(wf,r+1,['Cidade','Região TSL']+labels,fill=fill,h=30); starts.append(r+2)
    for i,c in enumerate(top,r+2):
        pp,tt=cityrow(c); put(wf,i,1,c); put(wf,i,2,reg(tt))
        for j in range(len(labels)):
            col=3+j
            if bi==0: put(wf,i,col,pp['faixas'][j],MON,BLUE)
            elif bi==1: put(wf,i,col,tt['faixas'][j],MON,BLUE)
            else: put(wf,i,col,f'={L(col)}{starts[0]+i-starts[2]}/{L(col)}{starts[1]+i-starts[2]}-1',SPCT)
    if bi==2: wf.conditional_formatting.add(f'C{r+2}:{L(2+len(labels))}{r+1+len(top)}',GRN_RED(-0.3,0.6))
    r+=len(top)+3
wf.column_dimensions['A'].width=24; wf.column_dimensions['B'].width=14
for j in range(3,3+len(labels)): wf.column_dimensions[L(j)].width=10
wf.freeze_panes='C4'
# ================= Top 20 cidades (preço final)
wt=wb.create_sheet('Top 20 Cidades',2)
wt['A1']='Top 20 cidades RJ — preço final (com taxas e ICMS) PROLOG x TSL nos mesmos pedidos'; wt['A1'].font=T14
cols=['#','Cidade','Região TSL','Pedidos','% pedidos RJ','Peso médio (kg)','NF média','TSL médio','PROLOG médio','PROLOG vs TSL','PROLOG s/ taxa interna vs TSL','Frete/NF TSL','Frete/NF PROLOG','% pedidos PROLOG ganharia','Frete peso PROLOG vs TSL','Prazo TSL','Prazo PROLOG','Redução necessária no preço PROLOG p/ empatar','Avaliação']
hdr(wt,3,cols,h=60)
for k,c in enumerate(top,4):
    cr=f'{R("F")},$B{k}'
    f={1:k-3,2:c,3:f'=INDEX({R("G")},MATCH($B{k},{R("F")},0))',4:f'=COUNTIFS({cr})',5:f'=D{k}/Resumo!$B$19',6:f'=AVERAGEIFS({R("I")},{cr})',7:f'=AVERAGEIFS({R("J")},{cr})',
       8:f'=AVERAGEIFS({R("T")},{cr})',9:f'=AVERAGEIFS({R("AC")},{cr})',10:f'=I{k}/H{k}-1',11:f'=AVERAGEIFS({R("AD")},{cr})/H{k}-1',
       12:f'=SUMIFS({R("T")},{cr})/SUMIFS({R("J")},{cr})',13:f'=SUMIFS({R("AC")},{cr})/SUMIFS({R("J")},{cr})',14:f'=COUNTIFS({cr},{R("AG")},"SIM")/D{k}',
       15:f'=SUMIFS({R("U")},{cr})/SUMIFS({R("M")},{cr})-1',16:f'=AVERAGEIFS({R("AH")},{cr})',17:f'=AVERAGEIFS({R("AI")},{cr})',18:f'=MAX(0,1-H{k}/I{k})',
       19:f'=IF(J{k}<=0,"Muito bem",IF(J{k}<=0.32,"Melhor posição",IF(J{k}<=0.45,"Intermediária","Precisa melhorar")))'}
    for j,v in f.items(): put(wt,k,j,v,{4:'0',5:PCT,6:'0.0',7:MON,8:MON,9:MON,10:SPCT,11:SPCT,12:PCT,13:PCT,14:PCT,15:SPCT,16:'0',17:'0',18:PCT}.get(j))
e=len(top)+3; t=e+1; cr=f'{R("AJ")},"SIM"'
tf={2:'TOTAL TOP 20',4:f'=SUM(D4:D{e})',5:f'=D{t}/Resumo!$B$19',6:f'=AVERAGEIFS({R("I")},{cr})',7:f'=AVERAGEIFS({R("J")},{cr})',8:f'=AVERAGEIFS({R("T")},{cr})',9:f'=AVERAGEIFS({R("AC")},{cr})',
    10:f'=I{t}/H{t}-1',11:f'=AVERAGEIFS({R("AD")},{cr})/H{t}-1',12:f'=SUMIFS({R("T")},{cr})/SUMIFS({R("J")},{cr})',13:f'=SUMIFS({R("AC")},{cr})/SUMIFS({R("J")},{cr})',
    14:f'=COUNTIFS({cr},{R("AG")},"SIM")/D{t}',15:f'=SUMIFS({R("U")},{cr})/SUMIFS({R("M")},{cr})-1',16:f'=AVERAGEIFS({R("AH")},{cr})',17:f'=AVERAGEIFS({R("AI")},{cr})',18:f'=MAX(0,1-H{t}/I{t})'}
for j,v in tf.items(): put(wt,t,j,v,{4:'0',5:PCT,6:'0.0',7:MON,8:MON,9:MON,10:SPCT,11:SPCT,12:PCT,13:PCT,14:PCT,15:SPCT,16:'0.0',17:'0.0',18:PCT}.get(j),BB)
wt.conditional_formatting.add(f'J4:J{e}',ColorScaleRule(start_type='min',start_color='63BE7B',mid_type='percentile',mid_value=50,mid_color='FFEB84',end_type='max',end_color='F8696B'))
wt.conditional_formatting.add(f'O4:O{e}',GRN_RED(-0.3,0.6))
wt.cell(t+2,1,'Avaliação: "Muito bem" = PROLOG mais barata; "Melhor posição" = até +32%; "Intermediária" = +32% a +45%; "Precisa melhorar" = acima de +45%.').font=NOTE
for j,w in enumerate([4,24,14,9,9,9,11,11,11,10,12,10,10,11,11,8,8,14,18],1): wt.column_dimensions[L(j)].width=w
wt.freeze_panes='D4'
# ================= Faixa x Região
wr=wb.create_sheet('Faixa x Região',3)
wr['A1']='Por faixa de peso e região TSL — preço final PROLOG x TSL (mesmos pedidos, top 20 cidades)'; wr['A1'].font=T14
row=3
for rg in ['TODAS','Capital','Metropolitana','Interior']:
    wr.cell(row,1,f'Região: {rg}').font=BB; row+=1
    hdr(wr,row,['Faixa (kg)','Pedidos','TSL médio','PROLOG médio','PROLOG vs TSL','PROLOG s/ taxa interna vs TSL','TSL frete peso','PROLOG frete peso','Frete peso PROLOG vs TSL','% pedidos PROLOG ganharia','Redução necessária'],h=45)
    st=row+1
    for lab in labels+['TOTAL']:
        row+=1; cr=f'{R("AJ")},"SIM"'+(f',{R("G")},"{rg}"' if rg!='TODAS' else '')+(f',{R("H")},$A{row}' if lab!='TOTAL' else '')
        fm={1:lab,2:f'=COUNTIFS({cr})',3:f'=IFERROR(AVERAGEIFS({R("T")},{cr}),"")',4:f'=IFERROR(AVERAGEIFS({R("AC")},{cr}),"")',5:f'=IFERROR(D{row}/C{row}-1,"")',
            6:f'=IFERROR(AVERAGEIFS({R("AD")},{cr})/C{row}-1,"")',7:f'=IFERROR(AVERAGEIFS({R("M")},{cr}),"")',8:f'=IFERROR(AVERAGEIFS({R("U")},{cr}),"")',9:f'=IFERROR(H{row}/G{row}-1,"")',
            10:f'=IFERROR(COUNTIFS({cr},{R("AG")},"SIM")/B{row},"")',11:f'=IFERROR(MAX(0,1-C{row}/D{row}),"")'}
        for j,v in fm.items(): put(wr,row,j,v,{2:'0',3:MON,4:MON,5:SPCT,6:SPCT,7:MON,8:MON,9:SPCT,10:PCT,11:PCT}.get(j),BB if lab=='TOTAL' else None)
    wr.conditional_formatting.add(f'E{st}:E{row-1}',GRN_RED(-0.3,0.7)); wr.conditional_formatting.add(f'I{st}:I{row-1}',GRN_RED(-0.3,0.7))
    row+=2
for j,w in enumerate([12,9,12,12,11,13,12,12,12,12,12],1): wr.column_dimensions[L(j)].width=w
# ================= Proposta de tabela PROLOG
wq=wb.create_sheet('Proposta Tabela PROLOG',4)
wq['A1']='Frete peso ALVO para a PROLOG empatar com a TSL (mantendo taxa interna, CTe, pedágio e TAS atuais da PROLOG)'; wq['A1'].font=T14
wq['A2']='Alvo = subtotal TSL (frete peso + GRIS + seguro + pedágio + entrega, × (1 + TRT)) − taxas PROLOG (ad valorem + GRIS + TAS + pedágio + CTe/kg + taxa interna/kg), para um pedido de referência por faixa. ICMS é igual nas duas e se anula.'; wq['A2'].font=NOTE
nb=len(labels); c0=8  # inicio blocos
blk=[('PROLOG atual — frete peso',HF3),('TSL — frete peso',HF2),('PROLOG ALVO (empate)',HF),('Redução necessária no frete peso PROLOG',HF)]
for b,(tit,fill) in enumerate(blk):
    cs=c0+b*nb; wq.merge_cells(start_row=5,start_column=cs,end_row=5,end_column=cs+nb-1)
    x=wq.cell(5,cs,tit); x.font=H; x.fill=fill; x.alignment=Alignment(horizontal='center')
# linhas de referência
wq.cell(3,c0+2*nb-1,'Peso de referência (kg) →').font=BB; wq.cell(4,c0+2*nb-1,'NF de referência (R$) →').font=BB
for j,lab in enumerate(labels):
    col=c0+2*nb+j; mid=(([0]+BANDS)[j]+BANDS[j])/2
    put(wq,3,col,f'=IFERROR(AVERAGEIFS({R("I")},{R("H")},"{lab}"),{mid})','0.0')
    put(wq,4,col,f'=IFERROR(AVERAGEIFS({R("J")},{R("H")},"{lab}"),{L(col)}3*SUM({R("J")})/SUM({R("I")}))',MON)
hdr(wq,6,['UF','Cidade (tabela PROLOG)','CEP inicial','CEP final','Região TSL','Prazo PROLOG / TSL','Pedidos no período']+labels*4,h=30)
for i,pp in enumerate(P,7):
    tt=tfind(pp['cepf']); v=['RJ',pp['cidade'],pp['cepi'],pp['cepf'],reg(tt),f"{pp['prazo']} / {tt['prazo']}",f'=COUNTIFS({R("E")},">="&C{i},{R("E")},"<="&D{i})']
    for j,x in enumerate(v,1): put(wq,i,j,x,'00000000' if j in(3,4) else None)
    for j in range(nb):
        ca,ct,cz,cd=[L(c0+b*nb+j) for b in range(4)]; W=f'{cz}$3'; NF=f'{cz}$4'
        put(wq,i,c0+j,pp['faixas'][j],MON,BLUE); put(wq,i,c0+nb+j,tt['faixas'][j],MON,BLUE)
        put(wq,i,c0+2*nb+j,f'=({ct}{i}+{NF}*({PR["gris_t"]}+{PR["seg_t"]})+{PR["ped_t"]}*CEILING({W}/100,1)+{PR["ent"]})*(1+{PR["trt"]})-({NF}*({PR["adv_p"]}+{PR["gris_p"]})+{PR["tas"]}+{PR["ped_p"]}*CEILING({W}/100,1)+({PR["cte"]}+{PR["tx"]})*CEILING({W},1))',MON)
        put(wq,i,c0+3*nb+j,f'=1-{cz}{i}/{ca}{i}',SPCT)
last=6+len(P)
wq.conditional_formatting.add(f'{L(c0+3*nb)}7:{L(c0+4*nb-1)}{last}',ColorScaleRule(start_type='num',start_value=0,start_color='63BE7B',mid_type='num',mid_value=0.3,mid_color='FFEB84',end_type='num',end_value=0.6,end_color='F8696B'))
wq.freeze_panes='H7'; wq.column_dimensions['B'].width=26
for j in [1,3,4,5,6,7]: wq.column_dimensions[L(j)].width=11
for j in range(c0,c0+4*nb): wq.column_dimensions[L(j)].width=9.5
wq.cell(last+2,2,'Redução negativa = a PROLOG já está abaixo do empate nessa faixa/cidade (tem margem).').font=NOTE
wq.cell(last+3,2,'Se a taxa interna R$ 0,45/kg também for aplicada à TSL (custo comum da filial SP), basta alterar Resumo!C13 para 0,45 — o alvo e todas as abas recalculam.').font=NOTE
wb.move_sheet('Pedidos',offset=10)
for w in wb.worksheets:
    for row in w.iter_rows():
        for c in row:
            if c.value is not None and (c.font is None or c.font.name!=F):
                c.font=Font(name=F,bold=c.font.b,italic=c.font.i,color=c.font.color,size=c.font.sz)
wb.save(OUT)
