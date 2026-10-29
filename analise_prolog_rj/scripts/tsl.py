import math, openpyxl
BANDS=[20,35,40,50,60,70,80,100,120,150,170,200,250]
def load_tsl(path):
    rows=list(openpyxl.load_workbook(path,read_only=True,data_only=True).active.iter_rows(values_only=True))
    out=[]
    for r in rows[4:]:
        if not r or not r[2]: continue
        out.append(dict(cepi=int(r[2]),cepf=int(r[3]),prazo=r[4],faixas=list(r[6:19]),exc=r[19] or 0,adv=(r[20] or 0)/100,gris=(r[21] or 0)/100,
                        trt=(r[22] or 0)/100,ped=r[23] or 0,pedfx=r[24] or 100,entrega=r[25] or 0,seguro=(r[26] or 0)/100))
    return out
def find(tab,cep):
    c=int(cep)
    for t in tab:
        if t['cepi']<=c<=t['cepf']: return t
def price_tsl(t,peso,nf,icms=0.12,trt_base='frete',detail=False):
    if peso<=250: fp=t['faixas'][next(i for i,b in enumerate(BANDS) if peso<=b)]
    else: fp=t['faixas'][-1]+(math.ceil(peso)-250)*t['exc']
    adv=nf*t['adv']; gris=nf*t['gris']; seg=nf*t['seguro']
    ped=t['ped']*math.ceil(peso/t['pedfx'])
    base=fp+adv+gris+seg+ped+t['entrega']
    trt=base*t['trt']  # TRT % sobre o subtotal (validado contra cotações reais)
    sub=base+trt
    tot=sub/(1-icms)
    if detail: return dict(frete_peso=fp,advalorem=adv,gris=gris,seguro=seg,trt=trt,pedagio=ped,entrega=t['entrega'],subtotal=sub,total=tot)
    return tot
