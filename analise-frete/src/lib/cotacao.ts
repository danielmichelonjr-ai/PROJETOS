// Cotação x Faturamento: lê a planilha de pedidos (aba Export) e aplica as regras do relatório.
// Entrada: linhas como arrays (primeira linha = cabeçalho). Saída: { meta, dic, pedidos, avisos }.

export interface MetaCotacao {
  fonte: string
  linhas: number
  cancelados: number
  pedidos: number
  ultimo: string // "DD/MM/AAAA HH:MM"
  primeiro: string // AAAA-MM-DD
  ultimoDia: string // AAAA-MM-DD
}

export interface DicCotacao {
  dias: string[]
  origens: string[]
  transp: string[]
  canais: string[]
  cidades: string[]
}

/** [diaIdx, hora, serie, origemIdx, cotIdx, erpIdx, outra, nf, oc, canalIdx, cep, cidadeIdx, uf, frete, cotacao] */
export type PedidoCompacto = [number, string, string, number, number, number, number, string, string, number, string, number, string, number | null, number | null]

export interface BaseCotacao {
  meta: MetaCotacao
  dic: DicCotacao
  pedidos: PedidoCompacto[]
  avisos?: string[]
}

export const REGRAS = {
  // Série da NF -> origem. Série 25 é Filial SP, ou Filial RJ quando a entrega é no RJ. Série 36 = Dropshipping Automático (Drop. Aut.).
  series: { '24': 'FILIAL MG', '34': 'FILIAL SP', '7': 'MATRIZ', '31': 'MATRIZ', '14': 'FILIAL PE', '302': 'CBM FLOG', '35': 'DROPSHIPPING', '36': 'DROP. AUT.' } as Record<string, string>,
  seriesMatriz: ['7', '31'],
  // Mesma transportadora, nome do cadastro no ERP diferente.
  aliasErp: {
    'Ldc Cargas Ltda - Me': 'Jadlog Standard (Ldc Cargas Ltda - Me)',
    '44.657.205 Marcia Lira De Andrade Campos': 'Transvanio (44.657.205 Marcia Lira De Andrade Campos)',
    'Lls Transportes E Logistica Ltda': 'Tsl (Lls Transportes E Logistica Ltda)',
    'Via Cargas Transportes Ltda': 'Transiga (Via Cargas Transportes Ltda)',
    'J S De Oliveira Transportes': 'Trans Sua Log (J S De Oliveira Transportes)',
    'Silvanio Silva De Campos Transportes': 'Transvanio Matriz (Silvanio Silva De Campos Transportes)',
  } as Record<string, string>,
  // Operações com cadastro próprio (chave usada para comparar cotação x ERP).
  chaveFixa: { 'vm transportes': 'vm', 'tempo justo matriz': 'tempojusto_matriz', 'transvanio - matriz': 'transvanio_matriz', 'trans sua log - standard': 'transsualog' } as Record<string, string>,
  prefixoErp: { 'vm transportes (': 'vm', 'tempo justo matriz (': 'tempojusto_matriz', 'transvanio matriz (': 'transvanio_matriz', 'trans sua log (': 'transsualog' } as Record<string, string>,
  genericas: ['transportadora', 'transportes', 'transporte', 'empresa', 'cia', 'de', 'e'],
}

export const PEND = 'FAT. PENDENTE'
const NAO_FAT = 'Ainda não faturado'

const COLS = {
  pedido: 'PEDIDO HUB',
  oc: 'ORDEM COMPRA',
  nota: 'NOTA',
  status: 'STATUS HUB',
  data: 'DATA PAGAMENTO',
  canal: 'CANAL',
  cep: 'CEP ENTREGA',
  ufc: 'UF / CIDADE',
  erp: 'TRANSPORTADOR ERP',
  cot: 'TRANSPORTADOR COTAÇÃO',
  frete: 'FRETE PEDIDO',
  cotacao: 'COTAÇÃO TRANSPORTADOR',
}

export type Cel = string | number | boolean | Date | null | undefined

const normCab = (s: Cel) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
const limpo = (v: Cel) => {
  if (v == null) return null
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t || null
}
const txt = (v: Cel) => (v == null ? '' : typeof v === 'number' && Number.isInteger(v) ? v.toFixed(0) : String(v).trim())
const p2 = (n: number) => String(n).padStart(2, '0')
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Data do Excel (número de série), Date ou texto -> { dia: 'AAAA-MM-DD', hora: 'HH:MM', ts } */
export function quando(v: Cel): { dia: string; hora: string; ts: number } | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    const s = Math.round(v * 86400)
    const d = new Date((s - 25569 * 86400) * 1000)
    return { dia: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`, hora: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`, ts: s }
  }
  if (v instanceof Date) return { dia: `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`, hora: `${p2(v.getHours())}:${p2(v.getMinutes())}`, ts: v.getTime() / 1000 }
  let m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) return { dia: `${m[1]}-${m[2]}-${m[3]}`, hora: `${m[4]}:${m[5]}`, ts: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000 }
  m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return { dia: `${m[3]}-${m[2]}-${m[1]}`, hora: `${m[4] || '00'}:${m[5] || '00'}`, ts: Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) / 1000 }
  return null
}

/** Chave para comparar a transportadora da cotação com a do ERP. */
function chave(nome: string) {
  const t = semAcento(nome.toLowerCase())
  if (REGRAS.chaveFixa[t.trim()]) return REGRAS.chaveFixa[t.trim()]
  for (const [pre, k] of Object.entries(REGRAS.prefixoErp)) if (t.startsWith(pre)) return k
  const toks = t
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !REGRAS.genericas.includes(w))
  return toks.length ? toks[0] : t
}

export function nomeErp(v: string | null, serie: string) {
  if (!v) return v
  if (v.startsWith('Tempo Justo')) return (REGRAS.seriesMatriz.includes(serie) ? 'Tempo Justo Matriz (' : 'Vm Transportes (') + v + ')'
  return REGRAS.aliasErp[v] || v
}

const cep = (x: Cel) => {
  if (x == null || x === '') return ''
  const t = txt(x).split('.')[0].replace(/\D/g, '').padStart(8, '0')
  return t.slice(0, 5) + '-' + t.slice(5)
}
const valor = (x: Cel) => {
  if (x == null || x === '') return null
  const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Índice da linha de cabeçalho (com "PEDIDO HUB" e "DATA PAGAMENTO") nas 30 primeiras linhas, ou -1. */
export function acharCabecalhoPedidos(linhas: Cel[][]): number {
  return linhas.slice(0, 30).findIndex((l) => {
    const c = (l || []).map(normCab)
    return c.includes(COLS.pedido) && c.includes(COLS.data)
  })
}

/** Série da NF (o número depois do último "-") e a origem de expedição que ela indica. */
export function origemDaNota(nf: string, uf: string): { serie: string; origem: string } {
  const sm = nf.match(/-(\d+)$/)
  const serie = sm ? sm[1] : ''
  if (!serie) return { serie, origem: PEND }
  if (serie === '25') return { serie, origem: uf === 'RJ' ? 'FILIAL RJ' : 'FILIAL SP' }
  return { serie, origem: REGRAS.series[serie] || 'SÉRIE ' + serie + ' (SEM REGRA)' }
}

export function processarPedidos(linhasTodas: Cel[][], fonte: string): BaseCotacao {
  const cabIdx = Math.max(0, acharCabecalhoPedidos(linhasTodas))
  const linhas = linhasTodas.slice(cabIdx)
  const cab = (linhas[0] || []).map(normCab)
  const ci = {} as Record<keyof typeof COLS, number>
  const faltam: string[] = []
  for (const [k, nome] of Object.entries(COLS) as [keyof typeof COLS, string][]) {
    const i = cab.indexOf(normCab(nome))
    if (i < 0) faltam.push(nome)
    ci[k] = i
  }
  if (faltam.length) throw new Error('A planilha não tem estas colunas: ' + faltam.join(', ') + '.')

  interface Reg {
    ts: number
    dia: string
    hora: string
    serie: string
    origem: string
    cot: string
    erp: string
    outra: number
    nf: string
    oc: string
    canal: string
    cep: string
    cidade: string
    uf: string
    frete: number | null
    cotacao: number | null
  }
  const regs: Reg[] = []
  let ignoradas = 0
  let cancelados = 0
  const semRegra = new Map<string, number>()
  for (let k = 1; k < linhas.length; k++) {
    const l = linhas[k]
    if (!l) continue
    const q = quando(l[ci.data])
    if (!q) {
      ignoradas++
      continue
    }
    const nf = txt(l[ci.nota])
    const sm = nf.match(/-(\d+)$/)
    const serie = sm ? sm[1] : ''
    const ufc = l[ci.ufc] == null ? '' : String(l[ci.ufc])
    const mc = ufc.match(/^(.*?)\s*-\s*\((\w\w)\)\s*$/)
    const uf = mc ? mc[2] : (ufc.match(/\((\w\w)\)\s*$/) || [])[1] || ''
    let origem: string
    if (!serie) origem = PEND
    else if (serie === '25') origem = uf === 'RJ' ? 'FILIAL RJ' : 'FILIAL SP'
    else origem = REGRAS.series[serie] || 'SÉRIE ' + serie + ' (SEM REGRA)'
    if (serie && serie !== '25' && !REGRAS.series[serie]) semRegra.set(serie, (semRegra.get(serie) || 0) + 1)
    if (String(l[ci.status] ?? '').trim().toLowerCase() === 'cancelado') {
      cancelados++
      continue
    }
    const cot = limpo(l[ci.cot]) || '(sem cotação)'
    let erp = nomeErp(limpo(l[ci.erp]), serie)
    erp = origem === PEND ? NAO_FAT : erp || '(sem transportador no ERP)'
    const outra = erp !== NAO_FAT && chave(cot) !== chave(erp) ? 1 : 0
    regs.push({
      ts: q.ts,
      dia: q.dia,
      hora: q.hora,
      serie,
      origem,
      cot,
      erp,
      outra,
      nf: nf === '-' ? '' : nf,
      oc: txt(l[ci.oc]),
      canal: txt(l[ci.canal]),
      cep: cep(l[ci.cep]),
      cidade: mc ? mc[1] : '',
      uf,
      frete: valor(l[ci.frete]),
      cotacao: valor(l[ci.cotacao]),
    })
  }
  if (!regs.length) throw new Error('Nenhum pedido com DATA PAGAMENTO foi encontrado na planilha.')
  regs.sort((a, b) => a.ts - b.ts)

  const D: DicCotacao = { dias: [], origens: [], transp: [], canais: [], cidades: [] }
  const IX: Record<keyof DicCotacao, Map<string, number>> = { dias: new Map(), origens: new Map(), transp: new Map(), canais: new Map(), cidades: new Map() }
  const ix = (k: keyof DicCotacao, v: string) => {
    let i = IX[k].get(v)
    if (i === undefined) {
      i = D[k].length
      IX[k].set(v, i)
      D[k].push(v)
    }
    return i
  }
  const pedidos: PedidoCompacto[] = regs.map((r) => [
    ix('dias', r.dia),
    r.hora,
    r.serie,
    ix('origens', r.origem),
    ix('transp', r.cot),
    ix('transp', r.erp),
    r.outra,
    r.nf,
    r.oc,
    ix('canais', r.canal),
    r.cep,
    ix('cidades', r.cidade),
    r.uf,
    r.frete,
    r.cotacao,
  ])
  const ult = regs[regs.length - 1]
  const meta: MetaCotacao = {
    fonte,
    linhas: regs.length + cancelados,
    cancelados,
    pedidos: regs.length,
    ultimo: `${ult.dia.slice(8, 10)}/${ult.dia.slice(5, 7)}/${ult.dia.slice(0, 4)} ${ult.hora}`,
    primeiro: regs[0].dia,
    ultimoDia: ult.dia,
  }
  const avisos: string[] = []
  if (ignoradas) avisos.push(`${ignoradas} linha(s) sem DATA PAGAMENTO foram ignoradas (ex.: linhas de total ou de filtros no rodapé).`)
  semRegra.forEach((n, s) => avisos.push(`Série ${s} não tem regra de origem (${n} pedido(s)); aparecem como "SÉRIE ${s} (SEM REGRA)".`))
  return { meta, dic: D, pedidos, avisos }
}
