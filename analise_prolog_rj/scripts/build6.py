# Versão para envio à PROLOG: concorrente anonimizado como OUTRO PARCEIRO, sem dados internos de pedido
import sys, os; sys.path.insert(0,os.path.dirname(__file__))
import prolog, tsl2, math
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import ColorScaleRule, FormulaRule
from openpyxl.chart import BarChart, Reference
from openpyxl.utils import get_column_letter as L
D, OUT = sys.argv[1:3]
P1=prolog.load_table(f'{D}/prolog_29-10.xlsx'); P2=prolog.load_table(f'{D}/prolog_06-11.xlsx'); TT=tsl2.load(f'{D}/tsl_vigente.xlsx')
s=pd.read_pickle(f'{D}/sim.pkl').sort_values('DATA PAGAMENTO')
BANDS=prolog.BANDS; labels=list(s.FAIXA.cat.categories)          # inclui '>250'
top=s.CIDADE.value_counts().head(20).index.tolist()
def fp_prolog(t,w): return t['faixas'][next(i for i,b in enumerate(BANDS) if w<=b)] if w<=250 else t['faixas'][-1]+(math.ceil(w)-250)*t['exc']
F='Arial'; H=Font(name=F,bold=True,color='FFFFFF'); HF=PatternFill('solid',fgColor='1F4E78'); HF1=PatternFill('solid',fgColor='7F7F7F'); HF2=PatternFill('solid',fgColor='2A78D6'); HFT=PatternFill('solid',fgColor='C55A11')
BB=Font(name=F,bold=True); BLUE=Font(name=F,color='0000FF'); T14=Font(name=F,bold=True,size=14); NOTE=Font(name=F,italic=True,color='595959'); YEL=PatternFill('solid',fgColor='FFFF00')
thin=Side(style='thin',color='BFBFBF'); BOR=Border(top=thin,bottom=thin,left=thin,right=thin)
MON='R$ #,##0.00;-R$ #,##0.00;-'; PCT='0.0%;-0.0%;-'; SPCT='+0.0%;-0.0%;0.0%'
GR=lambda lo,hi: ColorScaleRule(start_type='num',start_value=lo,start_color='63BE7B',mid_type='num',mid_value=0,mid_color='FFFFFF',end_type='num',end_value=hi,end_color='F8696B')
def hdr(ws,row,cols,start=1,fill=HF,h=None):
    for j,c in enumerate(cols):
        x=ws.cell(row,start+j,c); x.font=H; x.fill=fill; x.alignment=Alignment(wrap_text=True,horizontal='center',vertical='center'); x.border=BOR
    if h: ws.row_dimensions[row].height=h
def put(ws,r,c,v,nf=None,font=None):
    x=ws.cell(r,c,v); x.border=BOR
    if nf: x.number_format=nf
    if font: x.font=font
    return x
wb=Workbook()
# ================= Premissas
wpm=wb.active; wpm.title='Premissas'
wpm['A1']='Premissas de cálculo (células azuis podem ser alteradas — todas as abas recalculam)'; wpm['A1'].font=T14
hdr(wpm,3,['Parâmetro','PROLOG proposta 29/10','PROLOG proposta 06/11','OUTRO PARCEIRO','Observação'],h=32)
t0=TT[0]; a0=P1[0]; b0=P2[0]
prm=[('icms','ICMS por fora (total = subtotal / (1 − alíquota))',0.12,0.12,0.12,'12% SP→RJ, todas as tabelas com "ICMS incluso = N"','0.0%'),
 ('adv','Ad valorem / frete valor (% NF)',a0['advalorem'],b0['advalorem'],t0['adv'],'Nova proposta: 0,10% → 0,22%','0.00%'),
 ('gris','GRIS (% NF)',a0['gris'],b0['gris'],t0['gris'],'','0.00%'),
 ('seg','Seguro (% NF)',0,0,t0['seguro'],'','0.00%'),
 ('tas','TAS / taxa fixa por pedido (R$)',a0['tas'],b0['tas'],0,'Nova proposta retirou a TAS de R$ 1,00',MON),
 ('ped','Pedágio (R$ por fração de 100 kg)',a0['ped'],b0['ped'],t0['ped'],'Nova proposta: R$ 4,50 → R$ 2,50',MON),
 ('ctekg','CTe por kg (R$/kg)',a0['cte'],b0['cte'],0,'Nova proposta retirou o CTe de R$ 0,06/kg',MON),
 ('ctefx','CTe fixo (R$ por pedido)',0,0,t0['cte'],'OUTRO PARCEIRO: R$ 13,55 por CTe',MON),
 ('tx','Taxa interna (R$ por kg)',a0['outra'],b0['outra'],t0['outra'],'Taxa do embarcador, igual em todas as tabelas',MON)]
PM={}
for k,(key,a,v1,v2,vt,o,nf) in enumerate(prm,4):
    put(wpm,k,1,a)
    for j,v in zip((2,3,4),(v1,v2,vt)): put(wpm,k,j,v,nf,BLUE)
    put(wpm,k,5,o); PM[key]=(f'Premissas!$B${k}',f'Premissas!$C${k}',f'Premissas!$D${k}')
wpm.cell(14,1,'Frete peso: valor da faixa de peso de cada tabela (aba Pedidos). Acima de 250 kg: faixa 250 + excedente por kg. Sem cubagem (base sem dimensões).').font=NOTE
for c,w in zip('ABCDE',[52,18,18,20,60]): wpm.column_dimensions[c].width=w
# ================= Pedidos
wp=wb.create_sheet('Pedidos')
base=['Data pagamento','CEP','CEP (nº)','Cidade','Região','Faixa (kg)','Peso (kg)','Valor NF (R$)']
tc=['OUTRO PARCEIRO frete peso','OUTRO PARCEIRO % NF (GRIS+seguro+adv)','OUTRO PARCEIRO pedágio','OUTRO PARCEIRO CTe fixo','OUTRO PARCEIRO taxa interna','OUTRO PARCEIRO subtotal','OUTRO PARCEIRO total c/ ICMS']
def pc(p): return [f'{p} frete peso',f'{p} ad valorem',f'{p} GRIS',f'{p} TAS',f'{p} pedágio',f'{p} CTe',f'{p} taxa interna',f'{p} subtotal',f'{p} total c/ ICMS']
A,Bn='P29/10','P06/11'
tail=['06/11 vs 29/10 (%)','29/10 vs OUTRO PARCEIRO (%)','06/11 vs OUTRO PARCEIRO (%)','06/11 mais barata que OUTRO PARCEIRO?','Top 20?','Prazo PROLOG (du)','Prazo OUTRO PARCEIRO (du)']
cols=base+tc+pc(A)+pc(Bn)+tail; C={n:L(i) for i,n in enumerate(cols,1)}; CI={n:i for i,n in enumerate(cols,1)}
hdr(wp,1,cols,h=48)
for n in tc: wp.cell(1,CI[n]).fill=HFT
for n in pc(A): wp.cell(1,CI[n]).fill=HF1
for n in pc(Bn): wp.cell(1,CI[n]).fill=HF2
for i,(ix,r) in enumerate(s.iterrows(),start=2):
    cep=r['CEP ENTREGA']; w=r['PESO ITENS']; t=tsl2.find(TT,cep); a=prolog.find(P1,cep); b=prolog.find(P2,cep)
    I=lambda n:f'{C[n]}{i}'; W=I('Peso (kg)'); NF=I('Valor NF (R$)')
    v=dict(zip(base,[r['DATA PAGAMENTO'],cep,int(cep),r['CIDADE'],r['REG'],str(r['FAIXA']),w,r['VALOR PRODUTOS']]))
    v.update({'OUTRO PARCEIRO frete peso':tsl2.band_value(t,w),'OUTRO PARCEIRO % NF (GRIS+seguro+adv)':f'={NF}*({PM["adv"][2]}+{PM["gris"][2]}+{PM["seg"][2]})',
              'OUTRO PARCEIRO pedágio':f'={PM["ped"][2]}*CEILING({W}/100,1)','OUTRO PARCEIRO CTe fixo':f'={PM["ctefx"][2]}','OUTRO PARCEIRO taxa interna':f'={PM["tx"][2]}*CEILING({W},1)',
              'OUTRO PARCEIRO subtotal':f'=SUM({I("OUTRO PARCEIRO frete peso")}:{I("OUTRO PARCEIRO taxa interna")})','OUTRO PARCEIRO total c/ ICMS':f'={I("OUTRO PARCEIRO subtotal")}/(1-{PM["icms"][2]})'})
    for p,tab,k in ((A,a,0),(Bn,b,1)):
        v.update({f'{p} frete peso':round(fp_prolog(tab,w),2),f'{p} ad valorem':f'={NF}*{PM["adv"][k]}',f'{p} GRIS':f'={NF}*{PM["gris"][k]}',f'{p} TAS':f'={PM["tas"][k]}',
                  f'{p} pedágio':f'={PM["ped"][k]}*CEILING({W}/100,1)',f'{p} CTe':f'={PM["ctekg"][k]}*CEILING({W},1)',f'{p} taxa interna':f'={PM["tx"][k]}*CEILING({W},1)',
                  f'{p} subtotal':f'=SUM({I(p+" frete peso")}:{I(p+" taxa interna")})',f'{p} total c/ ICMS':f'={I(p+" subtotal")}/(1-{PM["icms"][k]})'})
    v.update({'06/11 vs 29/10 (%)':f'={I(Bn+" total c/ ICMS")}/{I(A+" total c/ ICMS")}-1','29/10 vs OUTRO PARCEIRO (%)':f'={I(A+" total c/ ICMS")}/{I("OUTRO PARCEIRO total c/ ICMS")}-1',
              '06/11 vs OUTRO PARCEIRO (%)':f'={I(Bn+" total c/ ICMS")}/{I("OUTRO PARCEIRO total c/ ICMS")}-1','06/11 mais barata que OUTRO PARCEIRO?':f'=IF({I(Bn+" total c/ ICMS")}<{I("OUTRO PARCEIRO total c/ ICMS")},"SIM","NÃO")',
              'Top 20?':'SIM' if r['CIDADE'] in top else 'NÃO','Prazo PROLOG (du)':b['prazo'],'Prazo OUTRO PARCEIRO (du)':t['prazo']})
    for n,x in v.items():
        c=wp.cell(i,CI[n],x)
        if n in tc or n in pc(A) or n in pc(Bn) or n in ('Valor NF (R$)',): c.number_format=MON
        elif n.endswith('(%)'): c.number_format=SPCT
    wp.cell(i,1).number_format='dd/mm/yyyy'
N=len(s); wp.freeze_panes='E2'; wp.auto_filter.ref=f'A1:{L(len(cols))}{N+1}'
for j in range(1,len(cols)+1): wp.column_dimensions[L(j)].width=12
wp.column_dimensions['D'].width=22; wp.column_dimensions['C'].hidden=True
R=lambda n:f'Pedidos!${C[n]}$2:${C[n]}${N+1}'
TOT={'P1':R(A+' total c/ ICMS'),'P2':R(Bn+' total c/ ICMS'),'TS':R('OUTRO PARCEIRO total c/ ICMS')}
Nn=f'COUNTA({R("Cidade")})'
# ================= Comparativo das propostas (tabelas)
wc=wb.create_sheet('Proposta 29-10 x 06-11')
wc['A1']='O que mudou na tabela PROLOG: proposta 29/10 x proposta 06/11'; wc['A1'].font=T14
hdr(wc,3,['Item','Proposta 29/10','Proposta 06/11','OUTRO PARCEIRO','Efeito'],h=30)
itens=[('Faixas de CEP / prazos','93 faixas, prazos 5 a 11 du','Iguais (sem mudança)','2 du capital/metropolitana, 13 du interior','—'),
 ('Frete peso até 20 kg','base','SOBE 9% a 32% na maioria das cidades (Rio +13%)','—','Piora nas faixas leves'),
 ('Frete peso 20 a 50 kg','base','−1% a −12% (Rio −1% a −5%)','—','Pequena melhora na faixa de maior volume'),
 ('Frete peso 50 a 80 kg','base','−5% a −22% (Rio −13% a −16%)','—','Melhora'),
 ('Frete peso acima de 80 kg','base','−13% a −32% (Rio −23% a −30%)','—','Melhora forte'),
 ('Excedente acima de 250 kg','R$ 7,71 a 12,05 / kg','R$ 1,41 a 1,87 / kg','R$ 0,96 a 1,34 / kg','Corrigido para valor de mercado'),
 ('Ad valorem','0,10% NF','0,22% NF','0 (seguro 0,21%)','Piora ≈ R$ 0,78/pedido'),
 ('GRIS','0,20% NF','0,20% NF','0,21% NF','—'),
 ('TAS','R$ 1,00','retirada','—','Melhora R$ 1,00/pedido'),
 ('Pedágio','R$ 4,50 / 100 kg','R$ 2,50 / 100 kg','R$ 1,05 / 100 kg','Melhora ≈ R$ 2,16/pedido; ainda acima do OUTRO PARCEIRO'),
 ('CTe','R$ 0,06 / kg','retirado','R$ 13,55 fixo por pedido','Melhora ≈ R$ 3,05/pedido'),
 ('Taxa interna','R$ 0,45 / kg','R$ 0,45 / kg','R$ 0,45 / kg','Igual')]
for k,row in enumerate(itens,4):
    for j,v in enumerate(row,1): x=put(wc,k,j,v); x.alignment=Alignment(wrap_text=True,vertical='top')
for c,w in zip('ABCDE',[28,24,38,30,40]): wc.column_dimensions[c].width=w
r0=18; wc.cell(r0,1,'Frete peso por faixa de CEP — variação da proposta 06/11 sobre a 29/10 (%)').font=BB
nb=len(BANDS); hdr(wc,r0+1,['Cidade (tabela)','CEP inicial','CEP final','Prazo (du)','Pedidos ago–out']+[f'{a}-{b}' for a,b in zip([0]+BANDS[:-1],BANDS)]+['Excedente/kg'],h=30)
blk2=r0+len(P1)+5; blk3=blk2+len(P1)+4
wc.cell(blk2-1,1,'Frete peso proposta 29/10 (R$)').font=BB; wc.cell(blk3-1,1,'Frete peso proposta 06/11 (R$)').font=BB
hdr(wc,blk2,['Cidade (tabela)','CEP inicial','CEP final','Prazo (du)','Pedidos ago–out']+[f'{a}-{b}' for a,b in zip([0]+BANDS[:-1],BANDS)]+['Excedente/kg'],fill=HF1)
hdr(wc,blk3,['Cidade (tabela)','CEP inicial','CEP final','Prazo (du)','Pedidos ago–out']+[f'{a}-{b}' for a,b in zip([0]+BANDS[:-1],BANDS)]+['Excedente/kg'],fill=HF2)
for k,(a,b) in enumerate(zip(P1,P2)):
    for rr,tab,kind in ((r0+2+k,None,'var'),(blk2+1+k,a,'v'),(blk3+1+k,b,'v')):
        info=[a['cidade'],a['cepi'],a['cepf'],a['prazo'],f'=COUNTIFS({R("CEP (nº)")},">="&B{rr},{R("CEP (nº)")},"<="&C{rr})']
        for j,x in enumerate(info,1): put(wc,rr,j,x,'00000000' if j in (2,3) else None)
        for j in range(nb+1):
            col=6+j
            if kind=='v': put(wc,rr,col,(tab['faixas'][j] if j<nb else tab['exc']),MON,BLUE)
            else: put(wc,rr,col,f'={L(col)}{blk3+1+k}/{L(col)}{blk2+1+k}-1',SPCT)
wc.conditional_formatting.add(f'F{r0+2}:{L(6+nb)}{r0+1+len(P1)}',GR(-0.3,0.3))
wc.freeze_panes=f'F{r0+2}'
# ================= Regiões / faixas / top 20 (preço final)
def cmp_table(ws,row,title,crit_list,first_col_name):
    ws.cell(row,1,title).font=BB
    hdr(ws,row+1,[first_col_name,'Pedidos','% pedidos','Peso médio','PROLOG 29/10 (R$)','PROLOG 06/11 (R$)','OUTRO PARCEIRO (R$)','06/11 vs 29/10','29/10 vs OUTRO PARCEIRO','06/11 vs OUTRO PARCEIRO','Frete/NF 06/11','Frete/NF OUTRO PARCEIRO','% cotações ganhas 06/11','Redução adicional p/ empatar (preço final)'],h=48)
    st=row+2
    for i,(lab,cr) in enumerate(crit_list,st):
        bold=BB if lab in ('TOTAL','TODAS') else None
        f={1:lab,2:f'=COUNTIFS({cr})',3:f'=B{i}/{Nn}',4:f'=IFERROR(AVERAGEIFS({R("Peso (kg)")},{cr}),"")',5:f'=IFERROR(AVERAGEIFS({TOT["P1"]},{cr}),"")',
           6:f'=IFERROR(AVERAGEIFS({TOT["P2"]},{cr}),"")',7:f'=IFERROR(AVERAGEIFS({TOT["TS"]},{cr}),"")',8:f'=IFERROR(F{i}/E{i}-1,"")',9:f'=IFERROR(E{i}/G{i}-1,"")',
           10:f'=IFERROR(F{i}/G{i}-1,"")',11:f'=IFERROR(SUMIFS({TOT["P2"]},{cr})/SUMIFS({R("Valor NF (R$)")},{cr}),"")',12:f'=IFERROR(SUMIFS({TOT["TS"]},{cr})/SUMIFS({R("Valor NF (R$)")},{cr}),"")',
           13:f'=IFERROR(COUNTIFS({cr},{R("06/11 mais barata que OUTRO PARCEIRO?")},"SIM")/B{i},"")',14:f'=IFERROR(MAX(0,1-G{i}/F{i}),"")'}
        for j,x in f.items(): put(ws,i,j,x,{2:'0',3:PCT,4:'0.0',5:MON,6:MON,7:MON,8:SPCT,9:SPCT,10:SPCT,11:PCT,12:PCT,13:PCT,14:PCT}.get(j),bold)
    end=st+len(crit_list)-1
    ws.conditional_formatting.add(f'H{st}:H{end}',GR(-0.25,0.25)); ws.conditional_formatting.add(f'I{st}:J{end}',ColorScaleRule(start_type='num',start_value=0,start_color='63BE7B',mid_type='num',mid_value=0.3,mid_color='FFEB84',end_type='num',end_value=0.6,end_color='F8696B'))
    return end+3
allc=f'{R("Faixa (kg)")},"<>"'
ws=wb.create_sheet('Região e Faixa')
ws['A1']='Preço final (com taxas e ICMS) — PROLOG 29/10 x PROLOG 06/11 x OUTRO PARCEIRO, mesmos 2.741 pedidos'; ws['A1'].font=T14
row=3
row=cmp_table(ws,row,'Por região',[(g,f'{R("Região")},"{g}"') for g in ['Capital','Metropolitana','Interior']]+[('TOTAL',allc)],'Região')
row=cmp_table(ws,row,'Por faixa de peso — todas as regiões',[(b,f'{R("Faixa (kg)")},"{b}"') for b in labels]+[('TOTAL',allc)],'Faixa (kg)')
for g in ['Capital','Metropolitana','Interior']:
    row=cmp_table(ws,row,f'Por faixa de peso — {g}',[(b,f'{R("Região")},"{g}",{R("Faixa (kg)")},"{b}"') for b in labels]+[('TOTAL',f'{R("Região")},"{g}"')],'Faixa (kg)')
for j,w in enumerate([16,9,9,9,13,13,13,11,11,11,10,10,12,14],1): ws.column_dimensions[L(j)].width=w
wt=wb.create_sheet('Top 20 Cidades')
wt['A1']='Top 20 cidades (por nº de pedidos ago–out) — preço final PROLOG 29/10 x 06/11 x OUTRO PARCEIRO'; wt['A1'].font=T14
cmp_table(wt,3,'',[(c,f'{R("Cidade")},"{c}"') for c in top]+[('TOTAL',f'{R("Top 20?")},"SIM"')],'Cidade')
for j,w in enumerate([24,9,9,9,13,13,13,11,11,11,10,10,12,14],1): wt.column_dimensions[L(j)].width=w
# ================= Alvo de frete peso (estrutura de taxas da proposta 06/11)
wq=wb.create_sheet('Alvo Frete Peso 06-11')
wq['A1']='Frete peso ALVO para a proposta 06/11 empatar com o OUTRO PARCEIRO (mantendo as taxas da proposta 06/11)'; wq['A1'].font=T14
wq['A2']='Alvo = subtotal OUTRO PARCEIRO − taxas PROLOG 06/11 (ad valorem + GRIS + pedágio + taxa interna), para o pedido médio de cada faixa (peso e NF de referência nas linhas 3 e 4). O ICMS é igual e se anula.'; wq['A2'].font=NOTE
c0=7; nbq=nb
for bi,(tit,fill) in enumerate([('PROLOG 06/11 — frete peso',HF2),('OUTRO PARCEIRO — frete peso',HFT),('ALVO (empate)',HF),('Redução necessária',HF)]):
    cs=c0+bi*nbq; wq.merge_cells(start_row=5,start_column=cs,end_row=5,end_column=cs+nbq-1)
    x=wq.cell(5,cs,tit); x.font=H; x.fill=fill; x.alignment=Alignment(horizontal='center')
wq.cell(3,c0+2*nbq-1,'Peso ref. (kg) →').font=BB; wq.cell(4,c0+2*nbq-1,'NF ref. (R$) →').font=BB
for j,lab in enumerate(labels[:nbq]):
    col=c0+2*nbq+j; mid=(([0]+BANDS)[j]+BANDS[j])/2
    put(wq,3,col,f'=IFERROR(AVERAGEIFS({R("Peso (kg)")},{R("Faixa (kg)")},"{lab}"),{mid})','0.0')
    put(wq,4,col,f'=IFERROR(AVERAGEIFS({R("Valor NF (R$)")},{R("Faixa (kg)")},"{lab}"),{L(col)}3*SUM({R("Valor NF (R$)")})/SUM({R("Peso (kg)")}))',MON)
hdr(wq,6,['Cidade (tabela PROLOG)','CEP inicial','CEP final','Região OUTRO PARCEIRO','Prazo PROLOG / OUTRO PARCEIRO','Pedidos ago–out']+labels[:nbq]*4,h=30)
for i,b in enumerate(P2,7):
    t=tsl2.find(TT,b['cepf']); rg={33.42:'Capital',42.72:'Metropolitana'}.get(t['faixas'][0],'Interior')
    for j,x in enumerate([b['cidade'],b['cepi'],b['cepf'],rg,f"{b['prazo']} / {t['prazo']}",f'=COUNTIFS({R("CEP (nº)")},">="&B{i},{R("CEP (nº)")},"<="&C{i})'],1): put(wq,i,j,x,'00000000' if j in (2,3) else None)
    for j in range(nbq):
        ca,ct,cz,cd=[L(c0+k*nbq+j) for k in range(4)]; W=f'{cz}$3'; NFr=f'{cz}$4'
        put(wq,i,c0+j,b['faixas'][j],MON,BLUE); put(wq,i,c0+nbq+j,t['faixas'][t['bands'].index(float(BANDS[j]))],MON,BLUE)
        tsub=f'({ct}{i}+{NFr}*({PM["adv"][2]}+{PM["gris"][2]}+{PM["seg"][2]})+{PM["ped"][2]}*CEILING({W}/100,1)+{PM["ctefx"][2]}+{PM["tx"][2]}*CEILING({W},1))'
        pfee=f'({NFr}*({PM["adv"][1]}+{PM["gris"][1]})+{PM["tas"][1]}+{PM["ped"][1]}*CEILING({W}/100,1)+({PM["ctekg"][1]}+{PM["tx"][1]})*CEILING({W},1))'
        put(wq,i,c0+2*nbq+j,f'={tsub}-{pfee}',MON); put(wq,i,c0+3*nbq+j,f'=1-{cz}{i}/{ca}{i}',SPCT)
last=6+len(P2)
wq.conditional_formatting.add(f'{L(c0+3*nbq)}7:{L(c0+4*nbq-1)}{last}',ColorScaleRule(start_type='num',start_value=0,start_color='63BE7B',mid_type='num',mid_value=0.3,mid_color='FFEB84',end_type='num',end_value=0.6,end_color='F8696B'))
wq.freeze_panes='G7'; wq.column_dimensions['A'].width=26
for j in range(2,7): wq.column_dimensions[L(j)].width=11
for j in range(c0,c0+4*nbq): wq.column_dimensions[L(j)].width=9.5
wq.cell(last+2,1,'Faixas com pouco ou nenhum volume (acima de 150 kg) devem ser tratadas caso a caso.').font=NOTE
# ================= Painel
wd=wb.create_sheet('Painel',0); wd.sheet_view.showGridLines=False
wd['B1']='PROPOSTA PROLOG 06/11 — RESULTADO NO RIO DE JANEIRO'; wd['B1'].font=Font(name=F,bold=True,size=16,color='1F4E78')
wd['B2']=f'Base: {N:,} pedidos RJ com origem de cotação FILIAL SP, pagos de 01/08 a 31/10/2026. Preços finais com ICMS 12% e todas as taxas.'.replace(',','.'); wd['B2'].font=NOTE
TILE=PatternFill('solid',fgColor='F2F2F2')
tiles=[('NOVA PROPOSTA vs PROPOSTA 29/10',f'=SUM({TOT["P2"]})/SUM({TOT["P1"]})-1','+0.0%;-0.0%','redução média no preço final','548235'),
       ('NOVA PROPOSTA vs OUTRO PARCEIRO',f'=SUM({TOT["P2"]})/SUM({TOT["TS"]})-1','+0%;-0%','era '+'+46%'+' na proposta 29/10','C00000'),
       ('COTAÇÕES QUE A PROLOG GANHARIA',f'=COUNTIF({R("06/11 mais barata que OUTRO PARCEIRO?")},"SIM")/{Nn}','0.0%','pedidos em que seria a mais barata','C00000'),
       ('REDUÇÃO AINDA NECESSÁRIA NO FRETE PESO',f'=1-(SUM({R("OUTRO PARCEIRO subtotal")})-(SUM({R(Bn+" subtotal")})-SUM({R(Bn+" frete peso")})))/SUM({R(Bn+" frete peso")})','0%','para empatar, mantidas as taxas de 06/11','C00000')]
for k,(lab,f,nf,cap,col) in enumerate(tiles):
    c=2+k*3
    for rr in range(4,8):
        for cc in range(c,c+3): wd.cell(rr,cc).fill=TILE
    for r1,r2 in ((4,4),(5,6),(7,7)): wd.merge_cells(start_row=r1,start_column=c,end_row=r2,end_column=c+2)
    x=wd.cell(4,c,lab); x.font=Font(name=F,bold=True,size=9,color='595959'); x.alignment=Alignment(horizontal='center')
    x=wd.cell(5,c,f); x.font=Font(name=F,bold=True,size=26,color=col); x.number_format=nf; x.alignment=Alignment(horizontal='center',vertical='center')
    x=wd.cell(7,c,cap); x.font=Font(name=F,italic=True,size=9,color='595959'); x.alignment=Alignment(horizontal='center')
wd.cell(7,5).value=f'=TEXT(SUM({TOT["P1"]})/SUM({TOT["TS"]})-1,"+0%")&" na proposta 29/10"'
def title(r,t,sub=None):
    wd.cell(r,2,t).font=Font(name=F,bold=True,size=12,color='1F4E78')
    if sub: wd.cell(r,9,sub).font=NOTE
title(9,'QUADRO 1 — Preço médio por pedido por região')
hdr(wd,10,['Região','Pedidos','% volume','PROLOG 29/10','PROLOG 06/11','OUTRO PARCEIRO','06/11 vs 29/10','29/10 vs OUTRO PARCEIRO','06/11 vs OUTRO PARCEIRO','Cotações ganhas 06/11','Redução necessária no frete peso','Situação'],start=2,h=45)
for i,g in enumerate(['Capital','Metropolitana','Interior','TOTAL'],11):
    cr=f'{R("Região")},"{g}"' if g!='TOTAL' else allc
    f={2:g,3:f'=COUNTIFS({cr})',4:f'=C{i}/{Nn}',5:f'=AVERAGEIFS({TOT["P1"]},{cr})',6:f'=AVERAGEIFS({TOT["P2"]},{cr})',7:f'=AVERAGEIFS({TOT["TS"]},{cr})',
       8:f'=F{i}/E{i}-1',9:f'=E{i}/G{i}-1',10:f'=F{i}/G{i}-1',11:f'=COUNTIFS({cr},{R("06/11 mais barata que OUTRO PARCEIRO?")},"SIM")/C{i}',
       12:f'=1-(SUMIFS({R("OUTRO PARCEIRO subtotal")},{cr})-(SUMIFS({R(Bn+" subtotal")},{cr})-SUMIFS({R(Bn+" frete peso")},{cr})))/SUMIFS({R(Bn+" frete peso")},{cr})',
       13:f'=IF(J{i}<=0,"COMPETITIVO",IF(J{i}<=0.15,"AJUSTE MODERADO","AJUSTE FORTE"))'}
    for j,x in f.items(): put(wd,i,j,x,{3:'0',4:'0%',5:MON,6:MON,7:MON,8:SPCT,9:'+0%;-0%',10:'+0%;-0%',11:'0.0%',12:'0%'}.get(j),BB if g=='TOTAL' else None)
for rule,fill,font in (('AJUSTE FORTE','F8CBAD',Font(bold=True,color='C00000')),('AJUSTE MODERADO','FFE699',None),('COMPETITIVO','C6EFCE',None)):
    wd.conditional_formatting.add('M11:M14',FormulaRule(formula=[f'M11="{rule}"'],fill=PatternFill('solid',fgColor=fill),font=font))
wd.conditional_formatting.add('H11:H14',GR(-0.25,0.25))
bl=labels[:10]
title(16,'QUADRO 2 — Nova proposta 06/11 vs OUTRO PARCEIRO por faixa de peso (preço final)','verde = competitivo · vermelho = precisa reduzir')
hdr(wd,17,['Região']+[f'{b} kg' for b in bl]+['Total'],start=2,h=30)
for i,g in enumerate(['Capital','Metropolitana','Interior','TODAS'],18):
    put(wd,i,2,g,font=BB if g=='TODAS' else None)
    for j,b in enumerate(bl+['Total'],3):
        cr=(f'{R("Região")},"{g}"' if g!='TODAS' else allc)+(f',{R("Faixa (kg)")},"{b}"' if b!='Total' else '')
        put(wd,i,j,f'=IFERROR(SUMIFS({TOT["P2"]},{cr})/SUMIFS({TOT["TS"]},{cr})-1,"")','+0%;-0%')
put(wd,22,2,'Variação 06/11 vs 29/10',font=BB)
for j,b in enumerate(bl+['Total'],3):
    cr=f'{R("Faixa (kg)")},"{b}"' if b!='Total' else allc
    put(wd,22,j,f'=IFERROR(SUMIFS({TOT["P2"]},{cr})/SUMIFS({TOT["P1"]},{cr})-1,"")','+0%;-0%')
put(wd,23,2,'% do volume',font=NOTE)
for j,b in enumerate(bl,3): put(wd,23,j,f'=COUNTIFS({R("Faixa (kg)")},"{b}")/{Nn}','0%',NOTE)
put(wd,23,3+len(bl),f'=SUM(C23:{L(2+len(bl))}23)','0%',NOTE)
wd.conditional_formatting.add(f'C18:{L(3+len(bl))}21',ColorScaleRule(start_type='num',start_value=0,start_color='63BE7B',mid_type='num',mid_value=0.25,mid_color='FFEB84',end_type='num',end_value=0.5,end_color='F8696B'))
wd.conditional_formatting.add(f'C22:{L(3+len(bl))}22',GR(-0.25,0.25))
title(25,'QUADRO 3 — Top 10 cidades')
hdr(wd,26,['Cidade','Pedidos','PROLOG 29/10','PROLOG 06/11','OUTRO PARCEIRO','06/11 vs 29/10','06/11 vs OUTRO PARCEIRO','Redução no preço final p/ empatar'],start=2,h=32)
for i,c in enumerate(top[:10],27):
    cr=f'{R("Cidade")},"{c}"'
    f={2:c,3:f'=COUNTIFS({cr})',4:f'=AVERAGEIFS({TOT["P1"]},{cr})',5:f'=AVERAGEIFS({TOT["P2"]},{cr})',6:f'=AVERAGEIFS({TOT["TS"]},{cr})',7:f'=E{i}/D{i}-1',8:f'=E{i}/F{i}-1',9:f'=MAX(0,1-F{i}/E{i})'}
    for j,x in f.items(): put(wd,i,j,x,{3:'0',4:MON,5:MON,6:MON,7:SPCT,8:'+0%;-0%',9:'0%'}.get(j))
wd.conditional_formatting.add('G27:G36',GR(-0.25,0.25)); wd.conditional_formatting.add('H27:H36',ColorScaleRule(start_type='num',start_value=0,start_color='63BE7B',mid_type='num',mid_value=0.3,mid_color='FFEB84',end_type='num',end_value=0.6,end_color='F8696B'))
title(38,'QUADRO 4 — Onde a diferença ainda está (média por pedido, R$)')
hdr(wd,39,['Componente','PROLOG 29/10','PROLOG 06/11','OUTRO PARCEIRO','06/11 − OUTRO PARCEIRO'],start=2)
comps=[('Frete peso',A+' frete peso',Bn+' frete peso','OUTRO PARCEIRO frete peso'),('Ad valorem + GRIS + seguro',(A+' ad valorem',A+' GRIS'),(Bn+' ad valorem',Bn+' GRIS'),'OUTRO PARCEIRO % NF (GRIS+seguro+adv)'),
       ('TAS / CTe',(A+' TAS',A+' CTe'),(Bn+' TAS',Bn+' CTe'),'OUTRO PARCEIRO CTe fixo'),('Pedágio',A+' pedágio',Bn+' pedágio','OUTRO PARCEIRO pedágio'),('Taxa interna R$ 0,45/kg',A+' taxa interna',Bn+' taxa interna','OUTRO PARCEIRO taxa interna')]
def avg(x): return '+'.join(f'AVERAGE({R(n)})' for n in (x if isinstance(x,tuple) else (x,)))
for i,(lab,a,b,t) in enumerate(comps,40):
    put(wd,i,2,lab); put(wd,i,3,'='+avg(a),MON); put(wd,i,4,'='+avg(b),MON); put(wd,i,5,'='+avg(t),MON); put(wd,i,6,f'=D{i}-E{i}',MON)
i=45; put(wd,i,2,'ICMS 12%'); put(wd,i,3,f'=AVERAGE({TOT["P1"]})-AVERAGE({R(A+" subtotal")})',MON); put(wd,i,4,f'=AVERAGE({TOT["P2"]})-AVERAGE({R(Bn+" subtotal")})',MON); put(wd,i,5,f'=AVERAGE({TOT["TS"]})-AVERAGE({R("OUTRO PARCEIRO subtotal")})',MON); put(wd,i,6,f'=D{i}-E{i}',MON)
i=46; put(wd,i,2,'TOTAL',font=BB)
for j in (3,4,5,6): put(wd,i,j,f'=SUM({L(j)}40:{L(j)}45)',MON,BB)
wd.conditional_formatting.add('F40:F45',GR(-15,45))
title(48,'QUADRO 5 — Leitura')
acts=[('AVANÇO','A nova proposta reduz o preço final em ≈10% (−12% Capital, −11% Metropolitana, −6% Interior), concentrado nas faixas acima de 50 kg e na retirada de TAS, CTe por kg e parte do pedágio.'),
      ('AINDA LONGE','Continua ≈31% acima do OUTRO PARCEIRO e não ganharia nenhuma cotação. O frete peso segue ≈70% acima do cobrado pelo OUTRO PARCEIRO — é ele que explica praticamente toda a diferença.'),
      ('FAIXAS LEVES','Até 20 kg a proposta PIOROU (+6% vs 29/10): o frete peso dessa faixa subiu 9% a 32% na maioria das cidades. Antes a PROLOG estava a +18% do OUTRO PARCEIRO nessa faixa; agora +26%.'),
      ('INTERIOR NORTE','Macaé e Campos dos Goytacazes praticamente não mudaram (0% a +1%) e seguem 65% acima do OUTRO PARCEIRO.'),
      ('MELHOR POSIÇÃO','Baixada (Duque de Caxias, Nova Iguaçu, São João de Meriti, Belford Roxo): ≈ +14% a +16% vs OUTRO PARCEIRO — são as cidades mais próximas de empatar.'),
      ('CONTRAPROPOSTA','Para empatar: frete peso ≈30% abaixo da proposta 06/11 (Capital 30%, Metropolitana 22%, Interior 34%), sem voltar a cobrar TAS/CTe. Valores-alvo por cidade e faixa na aba "Alvo Frete Peso 06-11".')]
for i,(a,t) in enumerate(acts,49):
    x=put(wd,i,2,a); x.font=Font(name=F,bold=True,color='FFFFFF'); x.fill=HF; x.alignment=Alignment(vertical='center',indent=1)
    wd.merge_cells(start_row=i,start_column=3,end_row=i,end_column=13); x=wd.cell(i,3,t); x.font=Font(name=F); x.alignment=Alignment(wrap_text=True,vertical='center'); x.border=BOR
    wd.row_dimensions[i].height=30
# gráfico: preço médio por faixa (bloco "todas as regiões" da aba Região e Faixa)
wrf=wb['Região e Faixa']; fst=13  # 1ª linha de dados do bloco por faixa (título 11, cabeçalho 12)
ch=BarChart(); ch.type='col'; ch.grouping='clustered'; ch.title='Preço final médio por faixa de peso'; ch.y_axis.title='R$ por pedido'
ch.add_data(Reference(wrf,min_col=5,max_col=7,min_row=fst-1,max_row=fst+9),titles_from_data=True); ch.set_categories(Reference(wrf,min_col=1,min_row=fst,max_row=fst+9))
for ser,col in zip(ch.series,['9AA5B1','2A78D6','EB6834']): ser.graphicalProperties.solidFill=col; ser.graphicalProperties.line.solidFill=col
ch.height=8; ch.width=24; ch.legend.position='b'
wd.cell(57,2,'GRÁFICO').font=Font(name=F,bold=True,size=12,color='1F4E78'); wd.add_chart(ch,'B58')
wd.column_dimensions['A'].width=2; wd.column_dimensions['B'].width=26
for j in range(3,15): wd.column_dimensions[L(j)].width=13
wb.move_sheet('Premissas',offset=len(wb.sheetnames)); wb.move_sheet('Pedidos',offset=len(wb.sheetnames))
for w in wb.worksheets:
    for row in w.iter_rows():
        for c in row:
            if c.value is not None and (c.font is None or c.font.name!=F):
                c.font=Font(name=F,bold=c.font.b,italic=c.font.i,color=c.font.color,size=c.font.sz)
wb.save(OUT)
