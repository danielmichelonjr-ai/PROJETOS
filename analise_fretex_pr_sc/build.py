import pandas as pd, numpy as np
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import ColorScaleRule, CellIsRule
from openpyxl.utils import get_column_letter as L
D='./'  # pasta com data/ (xlsx de entrada) e base.pkl
OUT='Simulacao_FRETEX_PR_SC_90dias.xlsx'
df=pd.read_pickle(D+'base.pkl'); df=df[df['STATUS HUB']!='Cancelado'].reset_index(drop=True)
BANDS=['0 - 20','20 - 40','40 - 60','60 - 70','70 - 90','90 - 120','120 - 160','160 - 200','200 - 1500']
top={}
for o in ['MATRIZ','FILIAL SP']:
    for uf in ['PR','SC']:
        top[(o,uf)]=list(df[(df.ORIGEM==o)&(df.UF==uf)].CIDADE.value_counts().head(20).index)
df['TOP20']=[1 if c in top[(o,u)] else 0 for o,u,c in zip(df.ORIGEM,df.UF,df.CIDADE)]
df['FX_BASE']=df.FX_PESO+df.FX_ADV_GRIS+df.FX_TAXAS
N=len(df)+1
F='Arial'
H=Font(name=F,bold=True,color='FFFFFF'); HF=PatternFill('solid',fgColor='1F4E78')
B=Font(name=F); BB=Font(name=F,bold=True); T=Font(name=F,bold=True,size=14)
BLUE=Font(name=F,color='0000FF',bold=True); YEL=PatternFill('solid',fgColor='FFFF00')
SUB=PatternFill('solid',fgColor='DDEBF7'); TOT=PatternFill('solid',fgColor='F2F2F2')
thin=Side(style='thin',color='BFBFBF'); BD=Border(top=thin,bottom=thin,left=thin,right=thin)
MO='R$ #,##0.00;-R$ #,##0.00;-'; M0='R$ #,##0;-R$ #,##0;-'; PC='0.0%;-0.0%;-'; IN='#,##0;-#,##0;-'
wb=Workbook()
def hdr(ws,r,c,vals,width=None):
    for i,v in enumerate(vals):
        x=ws.cell(r,c+i,v); x.font=H; x.fill=HF; x.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True); x.border=BD
def put(ws,r,c,v,fmt=None,font=B,fill=None):
    x=ws.cell(r,c,v); x.font=font; x.border=BD
    if fmt: x.number_format=fmt
    if fill: x.fill=fill
    return x
# ---------- Premissas
P=wb.active; P.title='Premissas'
P['A1']='Simulação FRETEX – pedidos PR e SC (06/08/2026 a 03/11/2026)'; P['A1'].font=T
rows=[('Parâmetro editável',None),
('ICMS a acrescentar sobre a tabela FRETEX (%)',0),
('Fator aplicado ao frete FRETEX',"=1/(1-B4)")]
P['A3']='Parâmetro'; P['B3']='Valor'
for c in ('A3','B3'): P[c].font=H; P[c].fill=HF
P['A4']='ICMS a acrescentar sobre a tabela FRETEX (%)'; P['B4']=0; P['B4'].font=BLUE; P['B4'].fill=YEL; P['B4'].number_format='0.0%'
P['A5']='Fator aplicado ao frete FRETEX'; P['B5']='=1/(1-B4)'; P['B5'].number_format='0.0000'
P['A6']='Limite p/ "muito competitiva" (dif. ≤)'; P['B6']=-0.15; P['B6'].font=BLUE; P['B6'].number_format=PC
P['A7']='Limite p/ "empate técnico" (± dif.)'; P['B7']=0.05; P['B7'].font=BLUE; P['B7'].number_format=PC
for r in range(4,8): P.cell(r,1).font=B
notes=['','PREMISSAS E FONTES',
'• Base: arquivo "ultimos_90_dias_SC_e_PR.xlsx" (enviado pelo usuário). Pedidos CANCELADOS foram excluídos (459); restam %d pedidos.'%len(df),
'• Custo atual = coluna "COTAÇÃO TRANSPORTADOR" (custo da transportadora que efetivamente cotou/atendeu o pedido).',
'• ORIGEM: a base enviada NÃO possui a coluna "ORIGEM DE COTAÇÃO" (a coluna F é "DATA PAGAMENTO"). A origem foi inferida pelo transportador:',
'     FILIAL SP = pedidos cotados pela "Dominalog Filial Sp"; MATRIZ = todos os demais. Se houver um export com a coluna de origem, basta refazer.',
'• Tabela FRETEX: arquivo "tbl_FRETEX_BRASIL.xlsx" (layout Intelipost, aba "ORIGEM BENTO", CEP origem 01000000–99999999, cubagem 300 kg/m³).',
'     A mesma tabela foi aplicada às duas origens (MATRIZ e FILIAL SP), pois é a única fornecida.',
'• Cálculo FRETEX por pedido = frete-peso da faixa (até 10/20/30/50/70/100/150/200 kg; acima de 200 kg = valor 200 kg + excedente R$/kg × kg acima de 200)',
'     + Ad valorem 0,18% s/ NF + GRIS 0,30% s/ NF + Pedágio R$ 4,00 a cada fração de 100 kg + CT-e R$ 20,00 + TDA da faixa de CEP.',
'     Valor da NF = "VALOR PRODUTOS". Peso = "PESO ITENS" (peso real; a base não traz cubagem). Frete mínimo: não preenchido na tabela.',
'     Quando o CEP cai em mais de uma faixa, foi usada a faixa mais específica (menor intervalo). 100% dos CEPs foram encontrados na tabela.',
'• ICMS: o campo "ICMS Incluso? (S/N)" está em branco na tabela. Cenário-base = ICMS incluso (0%). Para simular ICMS por fora, altere B4 (ex.: 12%).',
'• Leitura: Dif% = (Custo FRETEX ÷ Custo atual) − 1. Negativo = FRETEX mais barata. Participação = frete ÷ valor dos produtos (custo/pedido).',
'• Top 20 cidades = cidades com mais pedidos em cada UF, separadamente para cada origem.']
for i,n in enumerate(notes): c=P.cell(9+i,1,n); c.font=BB if n=='PREMISSAS E FONTES' else B
P.column_dimensions['A'].width=60; P.column_dimensions['B'].width=14
# ---------- Base
Bs=wb.create_sheet('Base')
cols=[('PEDIDO HUB','PEDIDO HUB',None,14),('DATA PAGAMENTO','DATA PAGAMENTO','dd/mm/yyyy',12),('STATUS','STATUS HUB',None,11),('CANAL','CANAL',None,18),
('ORIGEM','ORIGEM',None,11),('UF','UF',None,5),('CIDADE','CIDADE',None,24),('CEP','CEP ENTREGA',None,10),('PESO (kg)','PESO ITENS','#,##0.00',9),
('FAIXA PESO','RANGE FRETE (KG)',None,10),('VALOR PRODUTOS','VALOR PRODUTOS',MO,12),('TRANSPORTADOR ATUAL','TRANSPORTADOR COTAÇÃO',None,20),
('CUSTO ATUAL','COTAÇÃO TRANSPORTADOR',MO,12),('FRETEX REGIÃO','FX_REGIAO',None,10),('FRETEX PRAZO (d.u.)','FX_PRAZO','0',9),
('FRETEX FRETE-PESO','FX_PESO',MO,12),('FRETEX ADV+GRIS','FX_ADV_GRIS',MO,12),('FRETEX PEDÁGIO+CTE+TDA','FX_TAXAS',MO,12),('TOP20','TOP20','0',7)]
hdr(Bs,1,1,[c[0] for c in cols]+['FRETEX TOTAL S/ ICMS','FRETEX SIMULADO','DIF R$ (FRETEX − ATUAL)','FRETEX MAIS BARATA (1/0)'])
for i,row in enumerate(df.itertuples(index=False),start=2):
    rd=row._asdict() if hasattr(row,'_asdict') else None
for j,(h,src,fmt,w) in enumerate(cols,start=1):
    vals=df[src].tolist()
    if src=='DATA PAGAMENTO': vals=[v.to_pydatetime() if pd.notna(v) else None for v in vals]
    for i,v in enumerate(vals,start=2):
        c=Bs.cell(i,j,v)
        if fmt: c.number_format=fmt
    Bs.column_dimensions[L(j)].width=w
for i in range(2,N+1):
    Bs.cell(i,20,f'=P{i}+Q{i}+R{i}').number_format=MO
    Bs.cell(i,21,f'=T{i}*Premissas!$B$5').number_format=MO
    Bs.cell(i,22,f'=U{i}-M{i}').number_format=MO
    Bs.cell(i,23,f'=IF(U{i}<M{i},1,0)')
for j in range(20,24): Bs.column_dimensions[L(j)].width=13
Bs.freeze_panes='A2'; Bs.auto_filter.ref=f'A1:W{N}'
for row in Bs.iter_rows(min_row=2,max_row=N):
    for c in row: c.font=B
R=lambda col: f'Base!${col}$2:${col}${N}'
ORI,UF,CID,FX,ATU,VP,WIN,TOPC,BAND,CAR=R('E'),R('F'),R('G'),R('U'),R('M'),R('K'),R('W'),R('S'),R('J'),R('L')
def leitura(cell): return f'=IF({cell}<=Premissas!$B$6,"Muito competitiva",IF({cell}<-Premissas!$B$7,"Competitiva",IF({cell}<=Premissas!$B$7,"Empate técnico","Precisa melhorar")))'
def cfmt(ws,rng):
    ws.conditional_formatting.add(rng,ColorScaleRule(start_type='num',start_value=-0.4,start_color='63BE7B',mid_type='num',mid_value=0,mid_color='FFFFFF',end_type='num',end_value=0.4,end_color='F8696B'))
# ---------- Resumo
S=wb.create_sheet('Resumo',1)
S['A1']='Resumo – FRETEX simulada x custo atual'; S['A1'].font=T
S['A2']='Dif% negativa = FRETEX mais barata. Participação = frete ÷ valor dos produtos.'; S['A2'].font=Font(name=F,italic=True)
H1=['Origem','UF','Pedidos','Valor produtos','Custo atual','Custo FRETEX','Economia (R$)','Dif %','Frete médio atual','Frete médio FRETEX','Part. atual','Part. FRETEX','Ganho part. (p.p.)','% pedidos FRETEX + barata','Leitura']
hdr(S,4,1,H1); r=5
def rowf(ws,r,crit,c0=3):
    cnt=f'=COUNTIFS({crit})'; 
    ws.cell(r,c0,f'=COUNTIFS({crit})').number_format=IN
    ws.cell(r,c0+1,f'=SUMIFS({VP},{crit})').number_format=M0
    ws.cell(r,c0+2,f'=SUMIFS({ATU},{crit})').number_format=M0
    ws.cell(r,c0+3,f'=SUMIFS({FX},{crit})').number_format=M0
    a,b,cc,d=[L(c0+k) for k in range(4)]
    ws.cell(r,c0+4,f'={L(c0+2)}{r}-{L(c0+3)}{r}').number_format=M0
    ws.cell(r,c0+5,f'=IFERROR({L(c0+3)}{r}/{L(c0+2)}{r}-1,0)').number_format=PC
    ws.cell(r,c0+6,f'=IFERROR({L(c0+2)}{r}/{a}{r},0)').number_format=MO
    ws.cell(r,c0+7,f'=IFERROR({L(c0+3)}{r}/{a}{r},0)').number_format=MO
    ws.cell(r,c0+8,f'=IFERROR({L(c0+2)}{r}/{b}{r},0)').number_format=PC
    ws.cell(r,c0+9,f'=IFERROR({L(c0+3)}{r}/{b}{r},0)').number_format=PC
    ws.cell(r,c0+10,f'=({L(c0+8)}{r}-{L(c0+9)}{r})*100').number_format='0.0;-0.0;-'
    ws.cell(r,c0+11,f'=IFERROR(SUMIFS({WIN},{crit})/{a}{r},0)').number_format=PC
    ws.cell(r,c0+12,leitura(f'{L(c0+5)}{r}'))
    for k in range(c0,c0+13): ws.cell(r,k).font=B; ws.cell(r,k).border=BD
for o in ['MATRIZ','FILIAL SP']:
    for uf in ['PR','SC','PR+SC']:
        put(S,r,1,o); put(S,r,2,uf)
        crit=f'{ORI},"{o}"' + ('' if uf=='PR+SC' else f',{UF},"{uf}"')
        rowf(S,r,crit)
        if uf=='PR+SC':
            for k in range(1,16): S.cell(r,k).fill=SUB; S.cell(r,k).font=BB
        r+=1
put(S,r,1,'TOTAL',font=BB); put(S,r,2,'PR+SC',font=BB); rowf(S,r,f'{ORI},"<>"')
for k in range(1,16): S.cell(r,k).fill=TOT; S.cell(r,k).font=BB
cfmt(S,f'H5:H{r}')
# carrier table
r+=3; S.cell(r-1,1,'Por transportadora atual (mesmos pedidos recalculados na FRETEX)').font=BB
hdr(S,r,1,['Origem','Transportador atual']+H1[2:]); r+=1
for o in ['MATRIZ','FILIAL SP']:
    for car in df[df.ORIGEM==o]['TRANSPORTADOR COTAÇÃO'].value_counts().index:
        put(S,r,1,o); put(S,r,2,car); rowf(S,r,f'{ORI},"{o}",{CAR},"{car}"'); r+=1
cfmt(S,f'H{r-15}:H{r}')
for j,w in enumerate([11,20,9,14,13,13,13,9,11,11,9,9,9,11,17],start=1): S.column_dimensions[L(j)].width=w
S.row_dimensions[4].height=42; S.freeze_panes='C5'
# ---------- Top20
for o in ['MATRIZ','FILIAL SP']:
    ws=wb.create_sheet(f'Top20 {o}')
    ws['A1']=f'Top 20 cidades por UF – origem {o} (ranking por nº de pedidos)'; ws['A1'].font=T
    if o=='FILIAL SP': ws['A2']='Atenção: amostra pequena em SC (46 pedidos no total) – cidades com 1–2 pedidos têm baixa significância.'; ws['A2'].font=Font(name=F,italic=True,color='C00000')
    r=4
    for uf in ['PR','SC']:
        ws.cell(r,1,f'{uf}').font=Font(name=F,bold=True,size=12); r+=1
        hdr(ws,r,1,['#','Cidade']+H1[2:]); ws.row_dimensions[r].height=42; r+=1; s=r
        for i,c in enumerate(top[(o,uf)],1):
            put(ws,r,1,i); put(ws,r,2,c); rowf(ws,r,f'{ORI},"{o}",{UF},"{uf}",{CID},"{c}"'); r+=1
        put(ws,r,1,'',fill=TOT); put(ws,r,2,'Subtotal Top 20',font=BB,fill=TOT); rowf(ws,r,f'{ORI},"{o}",{UF},"{uf}",{TOPC},1')
        for k in range(1,16): ws.cell(r,k).fill=TOT; ws.cell(r,k).font=BB
        r+=1
        put(ws,r,1,'',fill=TOT); put(ws,r,2,f'Total {uf} (todas as cidades)',font=BB,fill=TOT); rowf(ws,r,f'{ORI},"{o}",{UF},"{uf}"')
        for k in range(1,16): ws.cell(r,k).fill=TOT; ws.cell(r,k).font=BB
        cfmt(ws,f'H{s}:H{r}'); r+=3
    for j,w in enumerate([4,26,9,14,13,13,13,9,11,11,9,9,9,11,17],start=1): ws.column_dimensions[L(j)].width=w
    ws.freeze_panes='C4'
# ---------- Faixas de peso (top 20) x transportadoras
for o in ['MATRIZ','FILIAL SP']:
    ws=wb.create_sheet(f'Faixas Peso {o}')
    ws['A1']=f'Faixas de peso – Top 20 cidades – origem {o}: FRETEX x transportadoras que atenderam'; ws['A1'].font=T
    ws['A2']='Para cada transportadora: frete médio que ela cobrou x frete médio que a FRETEX cobraria NOS MESMOS pedidos (comparação like-for-like).'; ws['A2'].font=Font(name=F,italic=True)
    r=4
    for uf in ['PR','SC']:
        sub=df[(df.ORIGEM==o)&(df.UF==uf)&(df.TOP20==1)]
        cars=list(sub['TRANSPORTADOR COTAÇÃO'].value_counts().index)
        ws.cell(r,1,f'{uf} – Top 20 cidades').font=Font(name=F,bold=True,size=12); r+=1
        # header row 1: group names
        c=2; ws.cell(r,c,'TOTAL (todas transp.)')
        groups=[('TOTAL',None)]+[(x,x) for x in cars]
        col=2
        for g,_ in groups:
            ws.merge_cells(start_row=r,start_column=col,end_row=r,end_column=col+4)
            x=ws.cell(r,col,g if g!='TOTAL' else 'TOTAL (todas as transportadoras)'); x.font=H; x.fill=PatternFill('solid',fgColor='2F75B5'); x.alignment=Alignment(horizontal='center')
            col+=5
        r+=1
        hdr(ws,r,1,['Faixa (kg)']+['Pedidos','Médio atual','Médio FRETEX','Dif %','Part. FRETEX x atual (p.p.)']*len(groups)); ws.row_dimensions[r].height=42; r+=1; s=r
        for bnd in BANDS+['TOTAL']:
            put(ws,r,1,bnd,font=BB if bnd=='TOTAL' else B)
            col=2
            for g,car in groups:
                crit=f'{ORI},"{o}",{UF},"{uf}",{TOPC},1'+('' if bnd=='TOTAL' else f',{BAND},"{bnd}"')+('' if car is None else f',{CAR},"{car}"')
                n=L(col)
                ws.cell(r,col,f'=COUNTIFS({crit})').number_format=IN
                ws.cell(r,col+1,f'=IFERROR(SUMIFS({ATU},{crit})/{n}{r},0)').number_format=MO
                ws.cell(r,col+2,f'=IFERROR(SUMIFS({FX},{crit})/{n}{r},0)').number_format=MO
                ws.cell(r,col+3,f'=IFERROR({L(col+2)}{r}/{L(col+1)}{r}-1,0)').number_format=PC
                ws.cell(r,col+4,f'=IFERROR((SUMIFS({ATU},{crit})-SUMIFS({FX},{crit}))/SUMIFS({VP},{crit})*100,0)').number_format='0.0;-0.0;-'
                for k in range(col,col+5): ws.cell(r,k).border=BD; ws.cell(r,k).font=BB if bnd=='TOTAL' else B
                if bnd=='TOTAL':
                    for k in range(1,col+5): ws.cell(r,k).fill=TOT
                cfmt(ws,f'{L(col+3)}{s}:{L(col+3)}{r}')
                col+=5
            r+=1
        r+=2
    ws.column_dimensions['A'].width=11
    for j in range(2,60): ws.column_dimensions[L(j)].width=10.5
    ws.freeze_panes='B4'
# ---------- Onde melhorar / Onde está forte (todas cidades com >= 10 pedidos)
ws=wb.create_sheet('Cidades Forte x Fraca')
ws['A1']='Todas as cidades com 10+ pedidos – onde a FRETEX está muito bem e onde precisa melhorar'; ws['A1'].font=T
ws['A2']='"Redução necessária" = desconto que a FRETEX precisaria dar na cidade para empatar com o custo atual (só quando ela está mais cara).'; ws['A2'].font=Font(name=F,italic=True)
hdr(ws,4,1,['Origem','UF','Cidade']+H1[2:]+['Redução necessária FRETEX']); ws.row_dimensions[4].height=42
g=df.groupby(['ORIGEM','UF','CIDADE']).agg(n=('ATUAL' if 'ATUAL' in df else 'COTAÇÃO TRANSPORTADOR','size'),a=('COTAÇÃO TRANSPORTADOR','sum'),f=('FX_BASE','sum')).reset_index()
g=g[g.n>=10]; g['d']=g.f/g.a-1; g=g.sort_values(['ORIGEM','d'],ascending=[False,True])
r=5
for x in g.itertuples():
    put(ws,r,1,x.ORIGEM); put(ws,r,2,x.UF); put(ws,r,3,x.CIDADE)
    rowf(ws,r,f'{ORI},"{x.ORIGEM}",{UF},"{x.UF}",{CID},"{x.CIDADE}"',c0=4)
    ws.cell(r,17,f'=IF(I{r}>0,1-F{r}/G{r},0)').number_format=PC; ws.cell(r,17).border=BD; ws.cell(r,17).font=B
    r+=1
cfmt(ws,f'J5:J{r}')
ws.auto_filter.ref=f'A4:Q{r-1}'
for j,w in enumerate([11,5,26,9,14,13,13,13,9,11,11,9,9,9,11,17,12],start=1): ws.column_dimensions[L(j)].width=w
ws.freeze_panes='D5'
wb.move_sheet('Base',offset=10)
wb.save(OUT); print(OUT)
