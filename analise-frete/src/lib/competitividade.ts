// Estudo de competitividade: recota pela tabela da transportadora em análise os pedidos reais do período
// que saíram da mesma origem para as praças que ela atende, e compara com o custo que tivemos.
import { P, type BasePedidos } from './pedidosBase'
import { aliquotaIcms, simularFrete, type TabelaIntelipost } from './tabelaIntelipost'

export interface OpcoesEstudo {
  origem: string
  ufOrigem: string
  /** Alíquota única de ICMS; null usa a regra 12%/7% por UF. Só vale quando a tabela não inclui ICMS. */
  icmsFixo: number | null
  de: string
  ate: string
}

export interface Soma {
  n: number
  atual: number
  sim: number
  valor: number
  cobrado: number
  peso: number
  /** Pedidos em que a tabela em análise sairia mais barata. */
  ganha: number
}

export interface PorTransportadora extends Soma {
  nome: string
}

export interface PorCidade extends Soma {
  cidade: string
  uf: string
  transp: PorTransportadora[]
  faixas: Soma[]
}

export interface PedidoEstudo {
  i: number
  dia: string
  cidade: string
  uf: string
  cep: number
  transp: string
  peso: number
  valor: number
  cobrado: number
  atual: number
  sim: number
  faixa: number
  /** Índice da linha da tabela (faixa de CEP) que atendeu o pedido. */
  linha: number
}

export interface Estudo {
  opcoes: OpcoesEstudo
  tabela: string
  total: Soma
  /** Pedidos da mesma origem fora da área da tabela, e pedidos na área que saíram de outras origens. */
  foraDaArea: number
  outrasOrigens: number
  porUf: (Soma & { uf: string })[]
  cidades: PorCidade[]
  transportadoras: (PorTransportadora & { faixas: Soma[] })[]
  faixas: Soma[]
  /** Por faixa de CEP da tabela: mostra bairros/regiões dentro de uma mesma cidade. */
  faixasCep: (Soma & { cepi: number; cepf: number; cidade: string })[]
  pedidos: PedidoEstudo[]
}

export const FAIXAS_PESO: [number, number][] = [
  [0, 20],
  [20, 40],
  [40, 60],
  [60, 70],
  [70, 90],
  [90, 120],
  [120, 160],
  [160, 200],
  [200, Infinity],
]
export const rotuloFaixa = (i: number) => {
  const [a, b] = FAIXAS_PESO[i]
  return b === Infinity ? `acima de ${a} kg` : `${a}–${b} kg`
}
export const faixaDoPeso = (p: number) => {
  const i = FAIXAS_PESO.findIndex(([, b]) => p <= b)
  return i < 0 ? FAIXAS_PESO.length - 1 : i
}

export const soma = (): Soma => ({ n: 0, atual: 0, sim: 0, valor: 0, cobrado: 0, peso: 0, ganha: 0 })
function somar(s: Soma, p: PedidoEstudo) {
  s.n++
  s.atual += p.atual
  s.sim += p.sim
  s.valor += p.valor
  s.cobrado += p.cobrado
  s.peso += p.peso
  if (p.sim < p.atual) s.ganha++
}

/** Diferença da tabela em análise sobre o custo atual: negativo = mais barata. */
export const dif = (s: Pick<Soma, 'atual' | 'sim'>) => (s.atual > 0 ? (s.sim - s.atual) / s.atual : 0)

export type Classe = 'muito' | 'boa' | 'perto' | 'ruim'
export const classe = (d: number): Classe => (d <= -0.1 ? 'muito' : d < 0 ? 'boa' : d <= 0.1 ? 'perto' : 'ruim')
export const ROTULO_CLASSE: Record<Classe, string> = {
  muito: 'Muito competitiva',
  boa: 'Competitiva',
  perto: 'Até 10% acima',
  ruim: 'Precisa melhorar',
}

export function estudar(base: BasePedidos, tabela: TabelaIntelipost, opcoes: OpcoesEstudo): Estudo {
  const { dic } = base
  const iOrigem = dic.origens.indexOf(opcoes.origem)
  const total = soma()
  const pedidos: PedidoEstudo[] = []
  let foraDaArea = 0
  let outrasOrigens = 0
  const cobre = (cep: number) => {
    // Mesma busca da simulação, sem calcular nada.
    const L = tabela.linhas
    let lo = 0
    let hi = L.length - 1
    let k = -1
    while (lo <= hi) {
      const m = (lo + hi) >> 1
      if (L[m].cepi <= cep) (k = m), (lo = m + 1)
      else hi = m - 1
    }
    for (let j = k; j >= 0 && j > k - 50; j--) if (L[j].cepf >= cep) return true
    return false
  }
  base.pedidos.forEach((p, i) => {
    const dia = dic.dias[p[P.dia]]
    if ((opcoes.de && dia < opcoes.de) || (opcoes.ate && dia > opcoes.ate)) return
    if (p[P.origem] !== iOrigem) {
      if (cobre(p[P.cep])) outrasOrigens++
      return
    }
    const icms = opcoes.icmsFixo ?? aliquotaIcms(opcoes.ufOrigem, p[P.uf])
    const s = simularFrete(tabela, p[P.cep], p[P.peso], p[P.valor], icms)
    if (!s) {
      foraDaArea++
      return
    }
    const pe: PedidoEstudo = {
      i,
      dia,
      cidade: dic.cidades[p[P.cidade]],
      uf: p[P.uf],
      cep: p[P.cep],
      transp: dic.transp[p[P.transp]],
      peso: p[P.peso],
      valor: p[P.valor],
      cobrado: p[P.frete],
      atual: p[P.custo],
      sim: s.total,
      faixa: faixaDoPeso(p[P.peso]),
      linha: tabela.linhas.indexOf(s.linha),
    }
    pedidos.push(pe)
    somar(total, pe)
  })

  const porUf = new Map<string, Soma & { uf: string }>()
  const porCidade = new Map<string, PorCidade>()
  const porTransp = new Map<string, PorTransportadora & { faixas: Soma[] }>()
  const faixas = FAIXAS_PESO.map(soma)
  const porLinha = new Map<number, Soma & { cepi: number; cepf: number; cidade: string }>()
  for (const p of pedidos) {
    if (!porLinha.has(p.linha)) {
      const l = tabela.linhas[p.linha]
      porLinha.set(p.linha, { ...soma(), cepi: l.cepi, cepf: l.cepf, cidade: l.cidade })
    }
    somar(porLinha.get(p.linha)!, p)
    if (!porUf.has(p.uf)) porUf.set(p.uf, { ...soma(), uf: p.uf })
    somar(porUf.get(p.uf)!, p)
    const kc = `${p.cidade}|${p.uf}`
    if (!porCidade.has(kc)) porCidade.set(kc, { ...soma(), cidade: p.cidade, uf: p.uf, transp: [], faixas: FAIXAS_PESO.map(soma) })
    const c = porCidade.get(kc)!
    somar(c, p)
    somar(c.faixas[p.faixa], p)
    let ct = c.transp.find((t) => t.nome === p.transp)
    if (!ct) c.transp.push((ct = { ...soma(), nome: p.transp }))
    somar(ct, p)
    if (!porTransp.has(p.transp)) porTransp.set(p.transp, { ...soma(), nome: p.transp, faixas: FAIXAS_PESO.map(soma) })
    const t = porTransp.get(p.transp)!
    somar(t, p)
    somar(t.faixas[p.faixa], p)
    somar(faixas[p.faixa], p)
  }
  const cidades = [...porCidade.values()].sort((a, b) => b.n - a.n)
  for (const c of cidades) c.transp.sort((a, b) => b.n - a.n)
  return {
    opcoes,
    tabela: tabela.nome,
    total,
    foraDaArea,
    outrasOrigens,
    porUf: [...porUf.values()].sort((a, b) => b.n - a.n),
    cidades,
    transportadoras: [...porTransp.values()].sort((a, b) => b.n - a.n),
    faixas,
    faixasCep: [...porLinha.values()].sort((a, b) => b.n - a.n),
    pedidos,
  }
}

/** As N cidades com mais pedidos de cada UF. */
export function topCidadesPorUf(e: Estudo, n = 20): Map<string, PorCidade[]> {
  const m = new Map<string, PorCidade[]>()
  for (const c of e.cidades) {
    const l = m.get(c.uf) ?? []
    if (l.length < n) l.push(c)
    m.set(c.uf, l)
  }
  return m
}
