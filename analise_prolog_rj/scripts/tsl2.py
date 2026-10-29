# Leitor genérico de tabela TSL no layout GORT/Intelipost (colunas localizadas pelo cabeçalho)
import math, openpyxl
def load(path):
    rows=list(openpyxl.load_workbook(path,read_only=True,data_only=True).active.iter_rows(values_only=True))
    h=[str(x).strip() if x is not None else '' for x in rows[3]]
    ix={n:i for i,n in enumerate(h)}
    bcols=[(i,float(n)) for i,n in enumerate(h) if n.replace('.','',1).isdigit()]
    g=lambda r,n,d=0: (r[ix[n]] if n in ix and r[ix[n]] is not None else d)
    out=[]
    for r in rows[4:]:
        if not r or not r[2]: continue
        out.append(dict(cepi=int(r[2]),cepf=int(r[3]),prazo=r[4],bands=[b for _,b in bcols],faixas=[r[i] for i,_ in bcols],
            exc=g(r,'VALOR EXCEDENTE'),adv=g(r,'FRETE VALOR SOBRE A NOTA(%)')/100,gris=g(r,'GRIS(%)')/100,trt=g(r,'TRT(%)')/100,
            ped=g(r,'PEDÁGIO VALOR FIXO'),pedfx=g(r,'PEDÁGIO FRAÇÃO A CADA x KG',100),entrega=g(r,'ENTREGA VALOR FIXO'),seguro=g(r,'SEGURO(%)')/100,
            cte=g(r,'CTE VALOR FIXO'),outra=g(r,'OUTRA TAXA VALOR FIXO'),outrafx=g(r,'OUTRA TAXA FRAÇÃO A CADA x KG',0)))
    return out
def find(tab,cep):
    c=int(cep)
    for t in tab:
        if t['cepi']<=c<=t['cepf']: return t
    return find(tab,c+1) if c%100000==0 else None
def band_value(t,peso):
    if peso<=t['bands'][-1]: return t['faixas'][next(i for i,b in enumerate(t['bands']) if peso<=b)]
    return t['faixas'][-1]+(math.ceil(peso)-t['bands'][-1])*t['exc']
def price(t,peso,nf,icms=0.12,detail=False):
    fp=band_value(t,peso)
    adv=nf*t['adv']; gris=nf*t['gris']; seg=nf*t['seguro']; ped=t['ped']*math.ceil(peso/t['pedfx'])
    outra=t['outra']*(math.ceil(peso/t['outrafx']) if t['outrafx'] else 1)
    base=fp+adv+gris+seg+ped+t['entrega']+t['cte']+outra
    trt=base*t['trt']; sub=base+trt; tot=sub/(1-icms)
    if detail: return dict(frete_peso=fp,advalorem=adv,gris=gris,seguro=seg,pedagio=ped,entrega=t['entrega'],cte=t['cte'],outra=outra,trt=trt,subtotal=sub,total=tot)
    return tot
