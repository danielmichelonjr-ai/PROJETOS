import math, openpyxl, pandas as pd
BANDS=[20,35,40,50,60,70,80,100,120,150,170,200,250]
def load_table(path):
    ws=openpyxl.load_workbook(path,read_only=True,data_only=True).active
    rows=list(ws.iter_rows(values_only=True))
    out=[]
    for r in rows[4:]:
        if r[2]!='RJ': continue
        out.append(dict(cidade=r[3],cepi=int(r[4]),cepf=int(r[5]),prazo=r[6],faixas=list(r[8:21]),exc=r[21] or 0,
            advalorem=(r[22] or 0)/100,gris=(r[28] or 0)/100,tas=r[36] or 0,ped=r[62] or 0,pedfx=r[63] or 100,
            cte=r[117] or 0,ctefx=r[118] or 1,outra=r[130] or 0,outrafx=r[131] or 1))
    return out
def find(tab,cep):
    c=int(cep)
    for t in tab:
        if t['cepi']<=c<=t['cepf']: return t
def price(t,peso,nf,icms=0.12,detail=False):
    if peso<=250:
        i=next(i for i,b in enumerate(BANDS) if peso<=b); fp=t['faixas'][i]
    else:
        fp=t['faixas'][-1]+(math.ceil(peso)-250)*t['exc']
    adv=nf*t['advalorem']; gris=nf*t['gris']
    ped=t['ped']*math.ceil(peso/t['pedfx'])
    cte=t['cte']*math.ceil(peso/t['ctefx']); outra=t['outra']*math.ceil(peso/t['outrafx'])
    sub=fp+adv+gris+t['tas']+ped+cte+outra
    tot=sub/(1-icms) if icms else sub
    if detail: return dict(frete_peso=fp,advalorem=adv,gris=gris,tas=t['tas'],pedagio=ped,cte=cte,outra=outra,subtotal=sub,total=tot)
    return tot
