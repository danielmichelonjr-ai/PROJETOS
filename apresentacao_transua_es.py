import sys
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList

SIM, OUT = sys.argv[1], sys.argv[2]
b = pd.read_excel(SIM, sheet_name='Base Simulada')
b = b.rename(columns={'CUSTO ATUAL (COTAÇÃO TRANSP.)': 'ATUAL', 'TRANSUA C/ ICMS 7%': 'TRANSUA'})
GV = ['Serra', 'Vila Velha', 'Vitória', 'Cariacica', 'Viana']
b['REGIAO'] = b.CIDADE.isin(GV).map({True: 'Grande Vitória', False: 'Interior'})
ORD = ['0 - 20', '20 - 40', '40 - 60', '60 - 70', '70 - 90', '90 - 120', '120 - 160', '160 - 200', '200 - 1500']
b['FX'] = b.FAIXA.replace({'160 - 200': '160+', '200 - 1500': '160+'})
FX = ['0 - 20', '20 - 40', '40 - 60', '60 - 70', '70 - 90', '90 - 120', '120 - 160', '160+']
top = b.CIDADE.value_counts().head(20).index.tolist()
t20 = b[b.CIDADE.isin(top)]

NAVY, BLUE, LIGHT, GREY = '1F3864', '2E75B6', 'DDEBF7', 'F2F2F2'
GREEN_F, GREEN_T = 'C6EFCE', '006100'
YEL_F, YEL_T = 'FFEB9C', '9C5700'
ORA_F, ORA_T = 'FCD5B4', '974706'
RED_F, RED_T = 'FFC7CE', '9C0006'
F = 'Arial'
thin = Side(style='thin', color='BFBFBF')
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
R = '"R$" #,##0.00'
R0 = '"R$" #,##0'
P = '+0.0%;-0.0%;0.0%'
P0 = '0%'

wb = Workbook()


def sheet(name, title, subtitle, widths):
    ws = wb.create_sheet(name)
    ws.sheet_view.showGridLines = False
    for i, w in enumerate(widths):
        ws.column_dimensions[chr(66 + i)].width = w
    ws.column_dimensions['A'].width = 2
    last = chr(65 + len(widths))
    ws.merge_cells(f'B1:{last}1')
    ws['B1'] = title
    ws['B1'].font = Font(name=F, size=18, bold=True, color='FFFFFF')
    ws['B1'].fill = PatternFill('solid', fgColor=NAVY)
    ws['B1'].alignment = Alignment(vertical='center', indent=1)
    ws.row_dimensions[1].height = 36
    ws.merge_cells(f'B2:{last}2')
    ws['B2'] = subtitle
    ws['B2'].font = Font(name=F, size=10, italic=True, color='595959')
    ws['B2'].alignment = Alignment(indent=1)
    return ws


def section(ws, row, text, ncols):
    ws.cell(row, 2, text).font = Font(name=F, size=12, bold=True, color=NAVY)
    for c in range(2, 2 + ncols):
        ws.cell(row, c).border = Border(bottom=Side(style='medium', color=BLUE))


def header(ws, row, labels):
    for i, l in enumerate(labels):
        c = ws.cell(row, 2 + i, l)
        c.font = Font(name=F, size=10, bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor=BLUE)
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = BOX
    ws.row_dimensions[row].height = 32


def cellw(ws, row, col, v, fmt=None, bold=False, align='center', fill=None):
    c = ws.cell(row, col, v)
    c.font = Font(name=F, size=10, bold=bold)
    c.alignment = Alignment(horizontal=align, vertical='center')
    c.border = BOX
    if fmt:
        c.number_format = fmt
    if fill:
        c.fill = PatternFill('solid', fgColor=fill)
    return c


def status_rules(ws, rng):
    for txt, f, t in [('Competitivo', GREEN_F, GREEN_T), ('Ajuste fino', YEL_F, YEL_T),
                      ('Precisa melhorar', ORA_F, ORA_T), ('Crítico', RED_F, RED_T)]:
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=[f'"{txt}"'],
                                      fill=PatternFill('solid', fgColor=f), font=Font(name=F, bold=True, color=t)))


def diff_rules(ws, rng):
    ws.conditional_formatting.add(rng, CellIsRule(operator='lessThanOrEqual', formula=['0'],
                                  font=Font(name=F, bold=True, color=GREEN_T)))
    ws.conditional_formatting.add(rng, CellIsRule(operator='greaterThan', formula=['0.1'],
                                  font=Font(name=F, bold=True, color=RED_T)))


STATUS = '=IF({d}<=0,"Competitivo",IF({d}<=0.1,"Ajuste fino",IF({d}<=0.2,"Precisa melhorar","Crítico")))'


def legend(ws, row):
    ws.cell(row, 2, 'Legenda de status (diferença TRANSUA x mercado atual):').font = Font(name=F, size=9, bold=True, color='595959')
    for i, (txt, f, t, d) in enumerate([('Competitivo', GREEN_F, GREEN_T, '≤ 0%'), ('Ajuste fino', YEL_F, YEL_T, 'até +10%'),
                                        ('Precisa melhorar', ORA_F, ORA_T, '+10% a +20%'), ('Crítico', RED_F, RED_T, 'acima de +20%')]):
        c = ws.cell(row + 1 + i, 2, f'{txt}  ({d})')
        c.font = Font(name=F, size=9, bold=True, color=t)
        c.fill = PatternFill('solid', fgColor=f)
        c.alignment = Alignment(horizontal='center')


# ---------------- Aba 1: RESUMO ----------------
ws = sheet('Resumo', 'TRANSUA  |  Simulação de Frete – Espírito Santo',
           'Pedidos com destino ES pagos de jul a set: preço atual praticado x tabela TRANSUA proposta (valores com ICMS)',
           [26, 16, 16, 16, 16, 16, 16])
# KPI cards (row 4-6)
kpis = [('Pedidos simulados', len(b), '#,##0'),
        ('Custo atual (mercado)', b.ATUAL.sum(), R0),
        ('Custo com TRANSUA', b.TRANSUA.sum(), R0),
        ('Diferença', b.TRANSUA.sum() / b.ATUAL.sum() - 1, P),
        ('Pedidos em que a TRANSUA é mais barata', (b.TRANSUA < b.ATUAL).mean(), P0)]
cols = [2, 3, 5, 6, 7]
spans = [(2, 2), (3, 4), (5, 6), (7, 7), (8, 8)]
for (lab, v, fmt), (c1, c2) in zip(kpis, spans):
    for r in (4, 5):
        ws.merge_cells(start_row=r, start_column=c1, end_row=r, end_column=c2)
    a = ws.cell(4, c1, lab)
    a.font = Font(name=F, size=9, bold=True, color='595959')
    a.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    v_ = ws.cell(5, c1, v)
    v_.number_format = fmt
    v_.font = Font(name=F, size=20, bold=True, color=RED_T if lab == 'Diferença' else NAVY)
    v_.alignment = Alignment(horizontal='center', vertical='center')
    for r in (4, 5):
        for c in range(c1, c2 + 1):
            ws.cell(r, c).fill = PatternFill('solid', fgColor=LIGHT)
ws.row_dimensions[4].height = 28
ws.row_dimensions[5].height = 36

section(ws, 7, 'Resultado por região', 7)
header(ws, 8, ['Região', 'Pedidos', 'Preço médio atual', 'Preço médio TRANSUA', 'Diferença', 'TRANSUA mais barata em', 'Status'])
r = 9
for reg in ['Grande Vitória', 'Interior']:
    g = b[b.REGIAO == reg]
    cellw(ws, r, 2, reg + (' (Serra, Vila Velha, Vitória, Cariacica, Viana)' if reg == 'Grande Vitória' else ' (demais cidades)'), align='left', bold=True)
    cellw(ws, r, 3, len(g), '#,##0')
    cellw(ws, r, 4, round(g.ATUAL.mean(), 2), R)
    cellw(ws, r, 5, round(g.TRANSUA.mean(), 2), R)
    cellw(ws, r, 6, f'=E{r}/D{r}-1', P, bold=True)
    cellw(ws, r, 7, (g.TRANSUA < g.ATUAL).mean(), P0)
    cellw(ws, r, 8, STATUS.format(d=f'F{r}'))
    r += 1
cellw(ws, r, 2, 'Total ES', align='left', bold=True, fill=GREY)
cellw(ws, r, 3, '=SUM(C9:C10)', '#,##0', bold=True, fill=GREY)
cellw(ws, r, 4, '=SUMPRODUCT(C9:C10,D9:D10)/C11', R, bold=True, fill=GREY)
cellw(ws, r, 5, '=SUMPRODUCT(C9:C10,E9:E10)/C11', R, bold=True, fill=GREY)
cellw(ws, r, 6, f'=E{r}/D{r}-1', P, bold=True, fill=GREY)
cellw(ws, r, 7, (b.TRANSUA < b.ATUAL).mean(), P0, bold=True, fill=GREY)
cellw(ws, r, 8, STATUS.format(d=f'F{r}'), bold=True)
ws.column_dimensions['B'].width = 50
diff_rules(ws, 'F9:F11'); status_rules(ws, 'H9:H11')

section(ws, 13, 'Onde a TRANSUA já é competitiva', 7)
gv = b[b.REGIAO == 'Grande Vitória']
m = gv[(gv['PESO ITENS'] > 40) & (gv['PESO ITENS'] <= 90)]
pos = [f'Grande Vitória, pedidos de 40 a 90 kg: {m.TRANSUA.sum()/m.ATUAL.sum()-1:+.1%} vs. mercado; mais barata em {(m.TRANSUA<m.ATUAL).mean():.0%} dos pedidos.',
       'Cariacica e Viana: preço igual ou abaixo do mercado no total.',
       'Serra, Vila Velha e Vitória: apenas +5% a +7% acima do mercado — ajuste pequeno torna a tabela vencedora.']
neg = ['Interior: +32% acima do mercado, mais barata em só 2% dos pedidos. O frete mínimo de R$ 160 (sem ICMS) é a principal causa: 48% dos pedidos do interior caem no mínimo.',
       'Guarapari (maior cidade fora da Grande Vitória): está na faixa de CEP do interior (mínimo R$ 160, 18 d.u.); +35% vs. mercado e não vence nenhum pedido.',
       'Pedidos leves (0–20 kg): +44%. O mínimo de R$ 95 (capital) fica acima do preço praticado pelo mercado (~R$ 72 na Grande Vitória).',
       'Pedidos pesados (acima de 90 kg): +13% a +38%. As faixas de 100, 150 e 200 kg estão caras.',
       'Taxa SECCAT de R$ 220 por pedido em cidades pequenas do interior (37 pedidos no período) inviabiliza a cotação nesses CEPs.']
asks = ['Reduzir o frete mínimo do interior de R$ 160 para ~R$ 125 (sem ICMS).',
        'Enquadrar Guarapari (CEPs 29200-000 a 29229-999) na tabela da capital: mínimo R$ 95 e prazo 12 d.u.',
        'Reduzir o mínimo da capital e a faixa de até 20 kg em ~20%.',
        'Reduzir as faixas de 100, 150 e 200 kg em ~15% a 25% (ver aba "Faixas de Peso").',
        'Rever ou retirar a taxa SECCAT de R$ 220.']
r = 14
for t in pos:
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    c = ws.cell(r, 2, '✔  ' + t); c.font = Font(name=F, size=10, color=GREEN_T); c.alignment = Alignment(wrap_text=True, vertical='center', indent=1)
    c.fill = PatternFill('solid', fgColor='EBF6EE'); r += 1
r += 1
section(ws, r, 'Onde a TRANSUA precisa melhorar', 7); r += 1
for t in neg:
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    c = ws.cell(r, 2, '✖  ' + t); c.font = Font(name=F, size=10, color=RED_T); c.alignment = Alignment(wrap_text=True, vertical='center', indent=1)
    c.fill = PatternFill('solid', fgColor='FDEDEF'); ws.row_dimensions[r].height = 30; r += 1
r += 1
section(ws, r, 'Nossa proposta de ajuste', 7); r += 1
for i, t in enumerate(asks, 1):
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=8)
    c = ws.cell(r, 2, f'{i}.  {t}'); c.font = Font(name=F, size=10, bold=True, color=NAVY); c.alignment = Alignment(wrap_text=True, vertical='center', indent=1)
    c.fill = PatternFill('solid', fgColor=LIGHT); ws.row_dimensions[r].height = 20; r += 1

# ---------------- Aba 2: CIDADES ----------------
ws = sheet('Cidades', 'Top 20 cidades do ES  |  Preço médio por pedido',
           'Cidades com mais pedidos de jul a set. Preço alvo = preço médio praticado hoje pelo mercado nos mesmos pedidos (com ICMS).',
           [26, 11, 10, 16, 16, 12, 14, 16, 18])
header(ws, 4, ['Cidade', 'Região', 'Pedidos', 'Preço alvo (mercado)', 'Preço TRANSUA', 'Diferença', 'TRANSUA mais barata em', 'Redução necessária', 'Status'])
r = 5
for cdd in top:
    g = b[b.CIDADE == cdd]
    cellw(ws, r, 2, cdd, align='left', bold=True)
    cellw(ws, r, 3, 'Capital' if cdd in GV else 'Interior')
    cellw(ws, r, 4, len(g), '#,##0')
    cellw(ws, r, 5, round(g.ATUAL.mean(), 2), R)
    cellw(ws, r, 6, round(g.TRANSUA.mean(), 2), R)
    cellw(ws, r, 7, f'=F{r}/E{r}-1', P, bold=True)
    cellw(ws, r, 8, (g.TRANSUA < g.ATUAL).mean(), P0)
    cellw(ws, r, 9, f'=MAX(0,1-E{r}/F{r})', '0.0%;-0.0%;"—"')
    cellw(ws, r, 10, STATUS.format(d=f'G{r}'))
    if r % 2 == 0:
        for c in range(2, 10):
            ws.cell(r, c).fill = PatternFill('solid', fgColor=GREY)
    r += 1
cellw(ws, r, 2, 'Total top 20', align='left', bold=True, fill=LIGHT)
cellw(ws, r, 3, '', fill=LIGHT)
cellw(ws, r, 4, f'=SUM(D5:D{r-1})', '#,##0', bold=True, fill=LIGHT)
cellw(ws, r, 5, f'=SUMPRODUCT(D5:D{r-1},E5:E{r-1})/D{r}', R, bold=True, fill=LIGHT)
cellw(ws, r, 6, f'=SUMPRODUCT(D5:D{r-1},F5:F{r-1})/D{r}', R, bold=True, fill=LIGHT)
cellw(ws, r, 7, f'=F{r}/E{r}-1', P, bold=True, fill=LIGHT)
cellw(ws, r, 8, (t20.TRANSUA < t20.ATUAL).mean(), P0, bold=True, fill=LIGHT)
cellw(ws, r, 9, f'=MAX(0,1-E{r}/F{r})', '0.0%;-0.0%;"—"', bold=True, fill=LIGHT)
cellw(ws, r, 10, STATUS.format(d=f'G{r}'), bold=True)
diff_rules(ws, f'G5:G{r}'); status_rules(ws, f'J5:J{r}')
ws.conditional_formatting.add(f'I5:I{r-1}', ColorScaleRule(start_type='num', start_value=0, start_color='FFFFFF',
                                                           end_type='max', end_color='F8696B'))
legend(ws, r + 2)
ws.freeze_panes = 'C5'

# ---------------- Aba 3: FAIXAS DE PESO ----------------
ws = sheet('Faixas de Peso', 'Faixas de peso  |  Top 20 cidades',
           'Preço médio por pedido em cada faixa de peso (kg). "Melhor preço do mercado" = transportadora mais barata hoje na faixa (média).',
           [24, 10, 16, 16, 16, 12, 14, 16, 18])
header(ws, 4, ['Faixa de peso (kg)', 'Pedidos', 'Preço médio mercado', 'Melhor preço do mercado', 'Preço TRANSUA', 'Diferença x média', 'TRANSUA mais barata em', 'Redução p/ média do mercado', 'Status'])
r = 5
for fx in FX:
    g = t20[t20.FX == fx]
    best = g.groupby('TRANSPORTADOR COTAÇÃO').ATUAL.mean().min()
    cellw(ws, r, 2, fx + ' kg', bold=True)
    cellw(ws, r, 3, len(g), '#,##0')
    cellw(ws, r, 4, round(g.ATUAL.mean(), 2), R)
    cellw(ws, r, 5, round(best, 2), R)
    cellw(ws, r, 6, round(g.TRANSUA.mean(), 2), R)
    cellw(ws, r, 7, f'=F{r}/D{r}-1', P, bold=True)
    cellw(ws, r, 8, (g.TRANSUA < g.ATUAL).mean(), P0)
    cellw(ws, r, 9, f'=MAX(0,1-D{r}/F{r})', '0.0%;-0.0%;"—"')
    cellw(ws, r, 10, STATUS.format(d=f'G{r}'))
    r += 1
fx_end = r - 1
diff_rules(ws, f'G5:G{fx_end}'); status_rules(ws, f'J5:J{fx_end}')
ws.conditional_formatting.add(f'I5:I{fx_end}', ColorScaleRule(start_type='num', start_value=0, start_color='FFFFFF',
                                                              end_type='max', end_color='F8696B'))
legend(ws, r + 1)

# gráfico
ch = BarChart(); ch.type = 'col'; ch.style = 10
ch.title = 'Preço médio por faixa de peso: mercado x TRANSUA'
ch.y_axis.title = 'R$ por pedido'; ch.y_axis.numFmt = '"R$" #,##0'; ch.y_axis.majorGridlines = None
data = Reference(ws, min_col=4, max_col=4, min_row=4, max_row=fx_end)
data2 = Reference(ws, min_col=6, max_col=6, min_row=4, max_row=fx_end)
ch.add_data(data, titles_from_data=True); ch.add_data(data2, titles_from_data=True)
ch.set_categories(Reference(ws, min_col=2, min_row=5, max_row=fx_end))
ch.series[0].graphicalProperties.solidFill = 'A6A6A6'; ch.series[0].graphicalProperties.line.noFill = True
ch.series[1].graphicalProperties.solidFill = BLUE; ch.series[1].graphicalProperties.line.noFill = True
ch.legend.position = 'b'; ch.height = 7.5; ch.width = 22; ch.gapWidth = 60
ch.x_axis.delete = False; ch.y_axis.delete = False
ws.add_chart(ch, f'B{r + 7}')

# mapa de calor cidade x faixa
r = r + 24
section(ws, r, 'Mapa de calor: diferença TRANSUA x mercado por cidade e faixa (verde = TRANSUA mais barata)', 9)
r += 1
header(ws, r, ['Cidade'] + [f + ' kg' for f in FX])
r += 1
h0 = r
for cdd in top:
    cellw(ws, r, 2, cdd, align='left', bold=True)
    for j, fx in enumerate(FX):
        g = b[(b.CIDADE == cdd) & (b.FX == fx)]
        if len(g) >= 3:
            cellw(ws, r, 3 + j, round(g.TRANSUA.sum() / g.ATUAL.sum() - 1, 4), P)
        else:
            cellw(ws, r, 3 + j, '·', fill=GREY).font = Font(name=F, size=9, color='A6A6A6')
    r += 1
ws.conditional_formatting.add(f'C{h0}:J{r-1}', ColorScaleRule(start_type='num', start_value=-0.15, start_color='63BE7B',
                                                             mid_type='num', mid_value=0, mid_color='FFFFFF',
                                                             end_type='num', end_value=0.5, end_color='F8696B'))
n = ws.cell(r, 2, '·  = menos de 3 pedidos na combinação (não exibido).')
n.font = Font(name=F, size=9, italic=True, color='595959')

# ---------------- Aba 4: PREMISSAS ----------------
ws = sheet('Premissas', 'Premissas da simulação', 'Como os valores foram calculados', [110])
lines = [
    ('Base', 'Pedidos com destino ao Espírito Santo, pagos entre 01/07 e 30/09 (1.205 pedidos).'),
    ('Preço atual (mercado)', 'Custo de frete cotado pela transportadora que efetivamente atendeu cada pedido, com ICMS.'),
    ('Preço TRANSUA', 'Tabela proposta (formato Intelipost) aplicada pedido a pedido:'),
    ('', '•  Frete-peso pela faixa (até 10/20/40/60/70/100/150/200 kg; acima de 200 kg = faixa de 200 kg + excedente por kg).'),
    ('', '•  + Ad valorem 0,3% e GRIS 0,2% sobre a nota fiscal, TAS R$ 4,00, pedágio R$ 3,80 a cada 100 kg, entrega R$ 9,50 e SECCAT (R$ 220 nas faixas de CEP indicadas).'),
    ('', '•  Frete mínimo: R$ 95 (Grande Vitória, CEP 29000-000 a 29184-999) e R$ 160 (demais CEPs), aplicado sobre o total.'),
    ('ICMS', 'A tabela informa ICMS não incluso; aplicado ICMS interestadual de 7% (origem Sudeste → ES) por dentro: total ÷ 0,93.'),
    ('Peso', 'Peso real dos itens (a base não tem dimensões, portanto a cubagem de 300 kg/m³ não foi aplicada).'),
    ('Confidencialidade', 'Preços de mercado apresentados apenas como médias, sem identificação das transportadoras.'),
]
r = 4
for k, v in lines:
    if k:
        c = ws.cell(r, 2, k); c.font = Font(name=F, size=10, bold=True, color=NAVY)
        r += 1
    c = ws.cell(r, 2, v); c.font = Font(name=F, size=10); c.alignment = Alignment(wrap_text=True, indent=1)
    r += 1

del wb['Sheet']
for w in wb.worksheets:
    w.page_setup.orientation = 'landscape'; w.page_setup.fitToWidth = 1; w.page_setup.fitToHeight = 0
    w.sheet_properties.pageSetUpPr.fitToPage = True
wb['Resumo'].sheet_properties.tabColor = NAVY
wb.save(OUT)
