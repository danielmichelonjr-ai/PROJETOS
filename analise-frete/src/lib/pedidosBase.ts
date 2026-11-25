// Base de pedidos para o estudo de competitividade: a mesma exportação de pedidos do HUB (aba Export),
// guardando o que o estudo precisa por pedido: origem (série da NF), transportadora, destino, peso, valor e custo.
import { PEND, nomeErp, origemDaNota, quando, type Cel } from './cotacao'

export interface MetaPedidos {
  fonte: string
  pedidos: number
  cancelados: number
  pendentes: number
  semCusto: number
  primeiro: string // AAAA-MM-DD
  ultimo: string // AAAA-MM-DD
}

export interface DicPedidos {
  dias: string[]
  origens: string[]
  transp: string[]
  cidades: string[]
  canais: string[]
}

/** [diaIdx, origemIdx, transpIdx, cep (número), cidadeIdx, uf, peso kg, valor produtos, custo transportador, frete cobrado, canalIdx] */
export type PedidoBase = [number, number, number, number, number, string, number, number, number, number, number]

export interface BasePedidos {
  meta: MetaPedidos
  dic: DicPedidos
  pedidos: PedidoBase[]
  avisos?: string[]
}

export const P = { dia: 0, origem: 1, transp: 2, cep: 3, cidade: 4, uf: 5, peso: 6, valor: 7, custo: 8, frete: 9, canal: 10 } as const

const COLS = {
  pedido: 'PEDIDO HUB',
  nota: 'NOTA',
  status: 'STATUS HUB',
  data: 'DATA PAGAMENTO',
  canal: 'CANAL',
  peso: 'PESO ITENS',
  valor: 'VALOR PRODUTOS',
  cep: 'CEP ENTREGA',
  ufc: 'UF / CIDADE',
  erp: 'TRANSPORTADOR ERP',
  custo: 'COTAÇÃO TRANSPORTADOR',
  frete: 'FRETE PEDIDO',
}

const normCab = (s: Cel) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
const txt = (v: Cel) => (v == null ? '' : typeof v === 'number' && Number.isInteger(v) ? v.toFixed(0) : String(v).trim())
const num = (x: Cel) => {
  if (x == null || x === '') return NaN
  if (typeof x === 'number') return x
  const t = String(x).trim()
  return parseFloat(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t)
}
const r2 = (n: number) => Math.round(n * 100) / 100

export function processarBasePedidos(todas: Cel[][], fonte: string): BasePedidos {
  const cabIdx = todas.slice(0, 30).findIndex((l) => (l || []).map(normCab).includes(COLS.pedido))
  if (cabIdx < 0) throw new Error('Não encontrei o cabeçalho da exportação de pedidos (coluna PEDIDO HUB).')
  const cab = todas[cabIdx].map(normCab)
  const ci = {} as Record<keyof typeof COLS, number>
  const faltam: string[] = []
  for (const [k, nome] of Object.entries(COLS) as [keyof typeof COLS, string][]) {
    ci[k] = cab.indexOf(nome)
    if (ci[k] < 0) faltam.push(nome)
  }
  if (faltam.length) throw new Error('A planilha não tem estas colunas: ' + faltam.join(', ') + '.')

  const D: DicPedidos = { dias: [], origens: [], transp: [], cidades: [], canais: [] }
  const IX = Object.fromEntries(Object.keys(D).map((k) => [k, new Map<string, number>()])) as Record<keyof DicPedidos, Map<string, number>>
  const ix = (k: keyof DicPedidos, v: string) => {
    let i = IX[k].get(v)
    if (i === undefined) {
      i = D[k].length
      IX[k].set(v, i)
      D[k].push(v)
    }
    return i
  }

  const regs: { ts: number; dia: string; p: (number | string)[] }[] = []
  let cancelados = 0
  let pendentes = 0
  let semCusto = 0
  let semPeso = 0
  for (const l of todas.slice(cabIdx + 1)) {
    if (!l) continue
    const q = quando(l[ci.data])
    if (!q) continue
    if (String(l[ci.status] ?? '').trim().toLowerCase() === 'cancelado') {
      cancelados++
      continue
    }
    const ufc = String(l[ci.ufc] ?? '')
    const mc = ufc.match(/^(.*?)\s*-\s*\((\w\w)\)\s*$/)
    const uf = mc ? mc[2] : (ufc.match(/\((\w\w)\)\s*$/) || [])[1] || ''
    const { serie, origem } = origemDaNota(txt(l[ci.nota]), uf)
    // Sem nota fiscal ainda não dá para saber de onde sai: fica fora do estudo.
    if (origem === PEND) {
      pendentes++
      continue
    }
    const custo = num(l[ci.custo])
    const peso = num(l[ci.peso])
    if (!(custo > 0)) {
      semCusto++
      continue
    }
    if (!(peso > 0)) {
      semPeso++
      continue
    }
    const cep = Number(txt(l[ci.cep]).split('.')[0].replace(/\D/g, '')) || 0
    const valor = num(l[ci.valor])
    const frete = num(l[ci.frete])
    regs.push({
      ts: q.ts,
      dia: q.dia,
      p: [
        ix('origens', origem),
        ix('transp', nomeErp(String(l[ci.erp] ?? '').replace(/\s+/g, ' ').trim() || null, serie) || '(sem transportador no ERP)'),
        cep,
        ix('cidades', mc ? mc[1] : ufc),
        uf,
        Math.round(peso * 1000) / 1000,
        Number.isFinite(valor) ? r2(valor) : 0,
        r2(custo),
        Number.isFinite(frete) ? r2(frete) : 0,
        ix('canais', txt(l[ci.canal])),
      ],
    })
  }
  if (!regs.length) throw new Error('Nenhum pedido com nota fiscal, peso e custo do transportador foi encontrado.')
  regs.sort((a, b) => a.ts - b.ts)
  const pedidos = regs.map((r) => [ix('dias', r.dia), ...r.p] as unknown as PedidoBase)
  const avisos: string[] = []
  if (pendentes) avisos.push(`${pendentes} pedido(s) ainda sem nota fiscal ficaram de fora (sem série não dá para saber a origem).`)
  if (semCusto) avisos.push(`${semCusto} pedido(s) sem custo do transportador (COTAÇÃO TRANSPORTADOR) ficaram de fora.`)
  if (semPeso) avisos.push(`${semPeso} pedido(s) sem peso ficaram de fora.`)
  return {
    meta: { fonte, pedidos: pedidos.length, cancelados, pendentes, semCusto, primeiro: regs[0].dia, ultimo: regs[regs.length - 1].dia },
    dic: D,
    pedidos,
    avisos,
  }
}
