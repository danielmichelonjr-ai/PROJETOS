import pandas as pd, numpy as np, html
S='/tmp/claude-0/-home-user-PROJETOS/54a36967-9b79-593a-9e93-a755e4241708/scratchpad/'
b=pd.read_pickle(S+'base.pkl'); b['FX']=b.FRETEX/0.88; b['AT']=b['COTAÇÃO TRANSPORTADOR']; b['VP']=b['VALOR PRODUTOS']
BANDS=['0 - 20','20 - 40','40 - 60','60 - 70','70 - 90','90 - 120','120 - 160','160 - 200','200 - 1500']
def brl(v,d=0): s=f'{abs(v):,.{d}f}'.replace(',','X').replace('.',',').replace('X','.'); return ('−' if v<0 else '')+'R$ '+s
def pct(v,d=1,sign=True): s=f'{v*100:+.{d}f}' if sign else f'{v*100:.{d}f}'; return s.replace('.',',').replace('-','−')+'%'
def num(v): return f'{v:,.0f}'.replace(',','.')
def cls(d): return 'good' if d<-0.05 else ('bad' if d>0.05 else 'even')
def tag(d): return {'good':'FRETEX mais barata','bad':'FRETEX mais cara','even':'Empate'}[cls(d)]
tot_at=b.AT.sum(); tot_fx=b.FX.sum(); n=len(b)
sel=(b.AT-b.FX).clip(lower=0).sum(); nwin=(b.FX<b.AT).sum()
part_at=tot_at/b.VP.sum(); part_fx=tot_fx/b.VP.sum()
# antes (CTE 20)
fx_old=(b.FRETEX+10)/0.88; d_old=fx_old.sum()/tot_at-1
segs=[('FILIAL SP','PR'),('FILIAL SP','SC'),('MATRIZ','PR'),('MATRIZ','SC')]
def seg(o,u): return b[(b.ORIGEM==o)&(b.UF==u)]
# bar scale
LO,HI=-0.5,0.6
def bar(d):
    dd=max(LO,min(HI,d)); z=-LO/(HI-LO)*100
    if dd<0: left=z+dd/(HI-LO)*100; w=-dd/(HI-LO)*100
    else: left=z; w=dd/(HI-LO)*100
    clip=' clip' if d!=dd else ''
    return f'<span class="track"><span class="zero" style="left:{z:.2f}%"></span><span class="fill {cls(d)}{clip}" style="left:{left:.2f}%;width:{w:.2f}%"></span></span>'
# segment rows
segrows=''
for o,u in segs:
    g=seg(o,u); d=g.FX.sum()/g.AT.sum()-1; do=((g.FRETEX+10)/0.88).sum()/g.AT.sum()-1
    segrows+=f'''<tr><th scope="row"><span class="org">{o}</span> → {u}</th><td class="r">{num(len(g))}</td><td class="r">{brl(g.AT.mean())}</td><td class="r">{brl(g.FX.mean())}</td><td class="r muted">{pct(do)}</td><td class="r"><b class="{cls(d)}t">{pct(d)}</b></td><td class="barcell">{bar(d)}</td><td class="r">{pct((g.FX<g.AT).mean(),0,False)}</td><td class="r">{brl(g.AT.sum()-g.FX.sum())}</td></tr>'''
# heatmap
heat='<tr><th scope="col">Faixa (kg)</th>'+''.join(f'<th scope="col">{o}<br><span>→ {u}</span></th>' for o,u in segs)+'</tr>'
for bd in BANDS:
    heat+=f'<tr><th scope="row">{bd.replace(" - ","–")}</th>'
    for o,u in segs:
        g=seg(o,u); g=g[g['RANGE FRETE (KG)']==bd]
        if len(g)<5: heat+=f'<td class="hc na"><span>{"—" if len(g)==0 else "n="+str(len(g))}</span></td>'; continue
        d=g.FX.sum()/g.AT.sum()-1; k=min(abs(d)/0.45,1)*62+6
        col='var(--good)' if d<-0.05 else ('var(--bad)' if d>0.05 else 'var(--line)')
        if cls(d)=='even': k=60
        heat+=f'<td class="hc" style="background:color-mix(in srgb,{col} {k:.0f}%,var(--surface))"><b>{pct(d,0)}</b><span>{num(len(g))} ped.</span></td>'
    heat+='</tr>'
# regions
REG={'PR-C':'Curitiba e região metropolitana','PR-I 1':'PR interior 1','PR-I 2':'PR interior 2','PR-I 3':'PR interior 3','PR-I 4':'PR interior 4 (oeste, sudoeste, norte)','SC-C':'SC capital e polos (Florianópolis, Joinville, Itajaí…)','SC-I 1':'SC interior 1','SC-I 2':'SC interior 2 (sul, serra, oeste)'}
regrows=''
for r,g in b.groupby('FX_REGIAO'):
    d=g.FX.sum()/g.AT.sum()-1
    regrows+=f'<tr><th scope="row"><code>{r}</code> <span class="muted">{REG.get(r,"")}</span></th><td class="r">{num(len(g))}</td><td class="r"><b class="{cls(d)}t">{pct(d)}</b></td><td class="barcell">{bar(d)}</td><td class="r">{brl(g.AT.sum()-g.FX.sum())}</td></tr>'
# cities top20
def citylist(o,u,k=20):
    g=seg(o,u); top=g.CIDADE.value_counts().head(k).index
    rows=[]
    for c in top:
        x=g[g.CIDADE==c]; d=x.FX.sum()/x.AT.sum()-1; rows.append((c,len(x),d))
    out=''
    for c,nn,d in rows:
        out+=f'<li><span class="cn">{html.escape(c)}</span><span class="cq">{nn}</span>{bar(d)}<b class="{cls(d)}t">{pct(d,0)}</b></li>'
    w=sum(1 for r in rows if r[2]<-0.05); e=sum(1 for r in rows if abs(r[2])<=0.05); l=sum(1 for r in rows if r[2]>0.05)
    return out,w,e,l
cl={s:citylist(*s) for s in segs if s!=('FILIAL SP','SC')}
# weak cities (MATRIZ, 10+ pedidos, dif>5%)
m=b[b.ORIGEM=='MATRIZ']
gc=m.groupby(['UF','CIDADE']).apply(lambda g: pd.Series({'n':len(g),'d':g.FX.sum()/g.AT.sum()-1,'gap':(g.FX.sum()-g.AT.sum())})).reset_index()
weak=gc[(gc.n>=10)&(gc.d>0.05)].sort_values('gap',ascending=False).head(15)
weakrows=''.join(f'<tr><th scope="row">{html.escape(r.CIDADE)} <span class="muted">{r.UF}</span></th><td class="r">{int(r.n)}</td><td class="r"><b class="badt">{pct(r.d,0)}</b></td><td class="r">{pct(1-1/(1+r.d),0,False)}</td><td class="r">{brl(r.gap)}</td></tr>' for r in weak.itertuples())
# carriers
car=''
for (o,c),g in b.groupby(['ORIGEM','TRANSPORTADOR COTAÇÃO']):
    if len(g)<50: continue
    d=g.FX.sum()/g.AT.sum()-1
    car+=f'<tr><th scope="row">{c} <span class="muted">{o}</span></th><td class="r">{num(len(g))}</td><td class="r">{brl(g.AT.mean())}</td><td class="r">{brl(g.FX.mean())}</td><td class="r"><b class="{cls(d)}t">{pct(d)}</b></td><td class="barcell">{bar(d)}</td></tr>'
# improvement figures
ms=seg('MATRIZ','SC'); sc70=ms[ms['PESO ITENS']>70]; d70=sc70.FX.sum()/sc70.AT.sum()-1; gap70=sc70.FX.sum()-sc70.AT.sum()
l20=b[b['PESO ITENS']<=20]; d20=l20.FX.sum()/l20.AT.sum()-1; gap20=(l20.FX-l20.AT).clip(lower=0).sum()
si2=b[b.FX_REGIAO=='SC-I 2']; dsi2=si2.FX.sum()/si2.AT.sum()-1
jad=b[b['TRANSPORTADOR COTAÇÃO']=='Jadlog Standard']; djad=jad.FX.sum()/jad.AT.sum()-1
tda=b[b.CIDADE.isin(['Guaíra','União da Vitória'])]; dtda=tda.FX.sum()/tda.AT.sum()-1
fsp=b[b.ORIGEM=='FILIAL SP']; dfsp=fsp.FX.sum()/fsp.AT.sum()-1
mpr=seg('MATRIZ','PR'); dmpr=mpr.FX.sum()/mpr.AT.sum()-1
msc_d=ms.FX.sum()/ms.AT.sum()-1
prz=b.FX_PRAZO
cw=cl[('FILIAL SP','PR')]; cm=cl[('MATRIZ','PR')]; cs=cl[('MATRIZ','SC')]
tpl=open(S+'scripts/page_tpl.html').read()
V=dict(N=num(n),D=pct(tot_fx/tot_at-1),DOLD=pct(d_old),SAV=brl(tot_at-tot_fx),SAVY=brl((tot_at-tot_fx)*4),SEL=brl(sel),SELY=brl(sel*4),SELP=pct(sel/tot_at,1,False),NWIN=num(nwin),PWIN=pct(nwin/n,0,False),
 PAT=pct(part_at,1,False),PFX=pct(part_fx,1,False),SEGROWS=segrows,HEAT=heat,REGROWS=regrows,WEAK=weakrows,CAR=car,
 C1=cw[0],C1W=cw[1],C1E=cw[2],C1L=cw[3],C2=cm[0],C2W=cm[1],C2E=cm[2],C2L=cm[3],C3=cs[0],C3W=cs[1],C3E=cs[2],C3L=cs[3],
 D70=pct(d70),GAP70=brl(gap70),N70=num(len(sc70)),D20=pct(d20),GAP20=brl(gap20),N20=num(len(l20)),DSI2=pct(dsi2),NSI2=num(len(si2)),DJAD=pct(djad),DTDA=pct(dtda,0),
 DFSP=pct(dfsp),SFSP=brl(fsp.AT.sum()-fsp.FX.sum()),DMPR=pct(dmpr),SMPR=brl(mpr.AT.sum()-mpr.FX.sum()),DMSC=pct(msc_d),SMSC=brl(ms.FX.sum()-ms.AT.sum()),
 PMIN=int(prz.min()),PMAX=int(prz.max()),PMED=f'{prz.mean():.1f}'.replace('.',','),CTEU=brl(10/0.88,2))
for k,v in V.items(): tpl=tpl.replace('{{'+k+'}}',str(v))
assert '{{' not in tpl, tpl[tpl.index('{{'):tpl.index('{{')+30]
open(S+'page/estudo_fretex.html','w').write(tpl)
print({k:v for k,v in V.items() if len(str(v))<40})
