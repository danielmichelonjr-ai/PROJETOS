import openpyxl, json, re, unicodedata, sys, collections
src, out_json, out_xlsx = sys.argv[1:4]
def norm(s): return unicodedata.normalize('NFD',str(s or '')).encode('ascii','ignore').decode().upper()
def num(v):
    if isinstance(v,(int,float)): return float(v)
    s=str(v or '').strip()
    if ',' in s: s=s.replace('.','').replace(',','.')
    try: return float(s)
    except: return float('nan')
wb=openpyxl.load_workbook(src,read_only=True)
ws=wb['Cadastro']
sk=collections.OrderedDict()
for r in ws.iter_rows(min_row=3,values_only=True):
    if not r[2]: continue
    k=str(r[2]).strip()
    if k not in sk: sk[k]={'sku':k,'desc':str(r[3] or '').strip().replace('\ufffd','?'),'peso':num(r[9]),'qtd':num(r[7]),'vols':[]}
    sk[k]['vols'].append([num(r[23]),num(r[24]),num(r[25])])
data=[[v['sku'],v['desc'],v['peso'],v['qtd'],v['vols']] for v in sk.values()]
json.dump({'arquivo':'Planilha_Auxiliar_Cadastro - PESOS E DIMENSOES PRODUTOS - 23-11-2026 - VALIDACAO JADLOG.xlsx','data':'2026-11-23','skus':data},open(out_json,'w'),separators=(',',':'),ensure_ascii=False)
terms=['PIA','COLCHAO','COLCHOES','CADEIRA','COOKTOP','COOK TOP','CUBA','FORNO ELETRICO','SOFA']
res=[t for t in terms]
def tre(t):
    e=re.escape(t).replace('\\ ',' ').replace(' ',r'[\s\-/]*')
    return re.compile(r'(?:^|[^A-Z0-9])('+e+r')(?:S|ES)?(?=[^A-Z0-9]|$)')
R=[(t,tre(t)) for t in terms]
na=[];ap=[];cnt=collections.Counter()
for v in sk.values():
    m=[]
    if not v['peso']>0 or any(not (x>0) for vol in v['vols'] for x in vol): m.append('Dados incompletos')
    if v['peso']>24: m.append('Peso > 24 kg')
    if any(max(vol)>=1700 for vol in v['vols']): m.append('Lado >= 1.700 mm')
    if any(sum(vol)>2400 for vol in v['vols']): m.append('Soma A+L+P > 2.400 mm')
    d=norm(v['desc']); hit=[t for t,rx in R if rx.search(d)]
    if hit: m.append('Termo: '+', '.join(hit))
    for x in m: cnt[x.split(':')[0]]+=1
    (na if m else ap).append((v,m))
print('total',len(sk),'nao apto',len(na),'apto',len(ap),cnt)
wo=openpyxl.Workbook(); s=wo.active; s.title='Nao Aptos JADLOG'
s.append(['SKU Comercial (Código Modelo)','Descrição','Peso Bruto (kg)','Qtde Volumes','Maior lado (mm)','Maior soma A+L+P (mm)','Motivos'])
for v,m in na:
    s.append([v['sku'],v['desc'],v['peso'],int(v['qtd']),max(max(x) for x in v['vols']),max(sum(x) for x in v['vols']),' | '.join(m)])
s2=wo.create_sheet('Aptos JADLOG'); s2.append(['SKU Comercial (Código Modelo)','Descrição','Peso Bruto (kg)','Qtde Volumes'])
for v,m in ap: s2.append([v['sku'],v['desc'],v['peso'],int(v['qtd'])])
for sh in (s,s2):
    sh.column_dimensions['A'].width=24; sh.column_dimensions['B'].width=70; sh.freeze_panes='A2'; sh.auto_filter.ref=sh.dimensions
    for c in sh[1]: c.font=openpyxl.styles.Font(bold=True)
s.column_dimensions['G'].width=60
wo.save(out_xlsx)
