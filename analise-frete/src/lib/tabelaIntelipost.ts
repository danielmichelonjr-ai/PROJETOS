// Lê uma tabela de frete no modelo oficial da Intelipost e calcula o frete de um pedido com ela,
// do mesmo jeito que a Intelipost cotaria: faixa de peso (ou excedente), mínimo, ad valorem, taxas e ICMS.
import type { Celula } from './planilha'

export interface LinhaTabela {
  uf: string
  cidade: string
  cepi: number
  cepf: number
  prazo: number
  minimo: number
  /** Preço de cada faixa de peso, na ordem de `pesos` (NaN quando vazio). */
  precos: number[]
  /** Demais colunas preenchidas, pelo nome do cabeçalho. */
  v: Record<string, number>
}

export interface TabelaIntelipost {
  nome: string
  arquivo: string
  icmsIncluso: boolean | null
  cepOrigem: [number, number] | null
  pesos: number[]
  linhas: LinhaTabela[]
  ufs: string[]
  /** Colunas preenchidas que o simulador não considera (variações). */
  ignoradas: string[]
}

const norm = (c: Celula | undefined) => String(c ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
const n = (c: Celula | undefined) => {
  if (c === null || c === undefined || c === '') return NaN
  if (typeof c === 'number') return c
  const t = String(c).replace(/R\$|%/g, '').trim()
  return parseFloat(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t)
}

export function lerTabelaIntelipost(linhas: Celula[][], arquivo: string): TabelaIntelipost {
  const h = linhas.slice(0, 30).findIndex((l) => (l ?? []).map(norm).includes('CEPI') && (l ?? []).map(norm).includes('CEPF'))
  if (h < 0) throw new Error(`${arquivo} não parece uma tabela no modelo Intelipost (não achei as colunas CEPI e CEPF).`)
  const cab = linhas[h].map(norm)
  const col = (nome: string) => cab.indexOf(nome)
  const [cUf, cCid, cI, cF, cPrazo, cMin, cExc] = ['UF', 'CIDADE', 'CEPI', 'CEPF', 'PRAZO', 'VALOR MÍNIMO DO FRETE', 'VALOR EXCEDENTE'].map(col)
  // Faixas de peso: cabeçalhos numéricos entre o valor mínimo e o excedente.
  const colsPeso: [number, number][] = []
  for (let i = Math.max(cMin, cF) + 1; i < (cExc > 0 ? cExc : cab.length); i++) {
    const p = n(linhas[h][i])
    if (p > 0) colsPeso.push([i, p])
  }
  colsPeso.sort((a, b) => a[1] - b[1])
  const outras = cab.map((c, i) => [c, i] as const).filter(([c, i]) => c && i > cPrazo && !colsPeso.some(([j]) => j === i) && i !== cMin)

  // Parâmetros na coluna A: rótulo numa linha, valor na de baixo.
  const param = (re: RegExp) => {
    for (let r = h + 1; r < Math.min(linhas.length, h + 60); r++) if (re.test(norm(linhas[r]?.[0]))) return linhas[r + 1]?.[0]
    return undefined
  }
  const icms = norm(param(/ICMS/))
  const oi = n(param(/CEP ORIGEM INICIAL/))
  const of = n(param(/CEP ORIGEM FINAL/))

  const out: LinhaTabela[] = []
  const ignoradas = new Set<string>()
  for (const l of linhas.slice(h + 1)) {
    const cepi = n(l?.[cI])
    const cepf = n(l?.[cF])
    if (!(cepi >= 0 && cepf >= cepi) || !l) continue
    const v: Record<string, number> = {}
    for (const [c, i] of outras) {
      const x = n(l[i])
      if (Number.isFinite(x) && x !== 0) {
        v[c] = x
        if (/VARIAÇÃO/.test(c)) ignoradas.add(c)
      } else if (typeof l[i] === 'string' && /VARIAÇÃO/.test(c) && String(l[i]).trim()) ignoradas.add(c)
    }
    out.push({
      uf: norm(l[cUf]).slice(0, 2),
      cidade: String(l[cCid] ?? '').trim(),
      cepi,
      cepf,
      prazo: n(l[cPrazo]) || 0,
      minimo: n(l[cMin]) || 0,
      precos: colsPeso.map(([i]) => n(l[i])),
      v,
    })
  }
  if (!out.length) throw new Error(`${arquivo}: a tabela não tem nenhuma linha com CEPI e CEPF.`)
  out.sort((a, b) => a.cepi - b.cepi)
  const nome = String(param(/NOME DA TABELA/) ?? '').trim() || arquivo.replace(/\.[^.]+$/, '')
  return {
    nome,
    arquivo,
    icmsIncluso: icms === 'S' ? true : icms === 'N' ? false : null,
    cepOrigem: oi >= 0 && of >= oi ? [oi, of] : null,
    pesos: colsPeso.map(([, p]) => p),
    linhas: out,
    ufs: [...new Set(out.map((l) => l.uf))].sort(),
    ignoradas: [...ignoradas],
  }
}

/** Linha da tabela que atende o CEP (busca binária pelo CEP inicial). */
export function linhaDoCep(t: TabelaIntelipost, cep: number): LinhaTabela | null {
  const L = t.linhas
  let lo = 0
  let hi = L.length - 1
  let i = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (L[m].cepi <= cep) (i = m), (lo = m + 1)
    else hi = m - 1
  }
  // Faixas podem se sobrepor: volta enquanto houver alguma que ainda cubra o CEP.
  for (let k = i; k >= 0 && k > i - 50; k--) if (L[k].cepf >= cep) return L[k]
  return null
}

// Taxas do modelo: percentual (sobre a NF ou sobre o frete), valor fixo (por CT-e ou por faixa de peso), mínimo e máximo.
const TAXAS: { nome: string; pct?: string; base?: 'nf' | 'frete'; fixo?: string; faixa?: string; min?: string; max?: string }[] = [
  { nome: 'GRIS', pct: 'GRIS (%)', base: 'nf', fixo: 'GRIS FIXO', min: 'GRIS MÍNIMO', max: 'GRIS MÁXIMO' },
  { nome: 'TAS', fixo: 'TAS FIXO' },
  { nome: 'TRT', pct: 'TRT (%)', base: 'frete', fixo: 'TRT FIXO', min: 'TRT MÍNIMO', max: 'TRT MÁXIMO' },
  { nome: 'TDE', pct: 'TDE (%)', base: 'frete', fixo: 'TDE FIXO', min: 'TDE MÍNIMO', max: 'TDE MÁXIMO' },
  { nome: 'TDA', pct: 'TDA (%)', base: 'frete', fixo: 'TDA FIXO', min: 'TDA MÍNIMO', max: 'TDA MÁXIMO' },
  { nome: 'TSB', pct: 'TSB (%)', base: 'nf', fixo: 'TSB FIXO' },
  { nome: 'SUFRAMA', fixo: 'SUFRAMA FIXO' },
  { nome: 'Seguro fluvial', pct: 'SEGURO FLUVIAL (%)', base: 'nf', fixo: 'SEGURO FLUVIAL FIXO', min: 'SEGURO FLUVIAL MÍNIMO', max: 'SEGURO FLUVIAL MÁXIMO' },
  { nome: 'Pedágio', fixo: 'PEDÁGIO FIXO', faixa: 'FAIXA DE PESO (KG) DO PEDÁGIO FIXO' },
  { nome: 'Coleta', fixo: 'COLETA FIXO' },
  { nome: 'Entrega', fixo: 'ENTREGA FIXO' },
  { nome: 'SECCAT', fixo: 'SECCAT FIXO' },
  { nome: 'Seguro', pct: 'SEGURO (%)', base: 'nf', fixo: 'SEGURO FIXO', min: 'SEGURO MÍNIMO', max: 'SEGURO MÁXIMO' },
  { nome: 'ADEME', pct: 'ADEME (%)', base: 'nf', fixo: 'ADEME FIXO', min: 'ADEME MÍNIMO', max: 'ADEME MÁXIMO' },
  { nome: 'CT-e', pct: 'CTE (%)', base: 'nf', fixo: 'CTE FIXO', faixa: 'FAIXA DE PESO (KG) DO CTE FIXO', min: 'CTE MÍNIMO', max: 'CTE MÁXIMO' },
  { nome: 'Outra taxa', pct: 'OUTRA TAXA (%) - SOBRE A NF', base: 'nf', fixo: 'OUTRA TAXA FIXO', faixa: 'FAIXA DE PESO (KG) DA OUTRA TAXA FIXO', min: 'OUTRA TAXA MÍNIMO', max: 'OUTRA TAXA MÁXIMO' },
]

export interface FreteSimulado {
  total: number
  frete: number
  adValorem: number
  taxas: number
  icms: number
  prazo: number
  linha: LinhaTabela
}

/** Alíquota de ICMS do frete: 12% dentro do estado; entre estados, 7% de Sul/Sudeste (menos ES) para N/NE/CO/ES, 12% nos demais. */
export function aliquotaIcms(ufOrigem: string, ufDestino: string): number {
  if (!ufOrigem || ufOrigem === ufDestino) return 12
  const sulSudeste = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']
  return sulSudeste.includes(ufOrigem) && !sulSudeste.includes(ufDestino) ? 7 : 12
}

const r2 = (x: number) => Math.round(x * 100) / 100

/**
 * Frete do pedido pela tabela, ou null se o CEP não é atendido.
 * `icmsPct` só é somado quando a tabela diz que o ICMS não está incluso (por dentro: total / (1 − alíquota)).
 */
export function simularFrete(t: TabelaIntelipost, cep: number, peso: number, valorNf: number, icmsPct: number): FreteSimulado | null {
  const l = linhaDoCep(t, cep)
  if (!l) return null
  const v = l.v
  // Frete por peso: primeira faixa que comporta o peso; acima da última, excedente por kg.
  let frete = NaN
  for (let i = 0; i < t.pesos.length; i++) {
    if (peso <= t.pesos[i] && Number.isFinite(l.precos[i])) {
      frete = l.precos[i]
      break
    }
  }
  if (!Number.isFinite(frete)) {
    let ult = -1
    for (let i = t.pesos.length - 1; i >= 0; i--) if (Number.isFinite(l.precos[i])) (ult = i), (i = -1)
    if (ult >= 0) frete = l.precos[ult] + Math.max(0, peso - t.pesos[ult]) * (v['VALOR EXCEDENTE'] ?? 0)
  }
  // Sem faixas de peso: tabela por comparação (maior entre valor por kg, % sobre a NF e frete mínimo).
  if (!Number.isFinite(frete)) frete = Math.max((v['VALOR POR KG'] ?? 0) * peso, ((v['% SOBRE A NF'] ?? 0) * valorNf) / 100, v['FRETE MÍNIMO'] ?? 0)
  frete = Math.max(frete, l.minimo)
  const adValorem = ((v['FRETE VALOR (%)'] ?? 0) * valorNf) / 100
  let taxas = 0
  for (const tx of TAXAS) {
    const pct = tx.pct ? v[tx.pct] ?? 0 : 0
    const fixo = tx.fixo ? v[tx.fixo] ?? 0 : 0
    if (!pct && !fixo) continue
    const faixa = tx.faixa ? v[tx.faixa] ?? 0 : 0
    let x = (pct * (tx.base === 'frete' ? frete : valorNf)) / 100 + fixo * (faixa > 0 ? Math.ceil(peso / faixa) : 1)
    if (tx.min && v[tx.min]) x = Math.max(x, v[tx.min])
    if (tx.max && v[tx.max]) x = Math.min(x, v[tx.max])
    taxas += x
  }
  const semIcms = frete + adValorem + taxas
  const total = t.icmsIncluso === false && icmsPct > 0 ? semIcms / (1 - icmsPct / 100) : semIcms
  return { total: r2(total), frete: r2(frete), adValorem: r2(adValorem), taxas: r2(taxas), icms: r2(total - semIcms), prazo: l.prazo, linha: l }
}
