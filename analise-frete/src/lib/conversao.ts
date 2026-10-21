import { normalizarCep, ufDoCep } from './cep'
import { numero, pesoDoCabecalho, type Celula } from './planilha'
import type { Faixa } from './types'

export type CampoFaixa = keyof Faixa

export interface DefCampo {
  campo: CampoFaixa
  rotulo: string
  numerico: boolean
  sinonimos: string[]
}

// Sinônimos usados para sugerir automaticamente a coluna de origem.
export const CAMPOS: DefCampo[] = [
  { campo: 'uf_destino', rotulo: 'UF destino', numerico: false, sinonimos: ['uf', 'estado', 'uf destino', 'destino uf'] },
  { campo: 'cidade', rotulo: 'Cidade / Região', numerico: false, sinonimos: ['cidade', 'municipio', 'município', 'regiao', 'região', 'praca', 'praça', 'localidade'] },
  { campo: 'cep_inicial', rotulo: 'CEP inicial', numerico: false, sinonimos: ['cep inicial', 'cep ini', 'cep de', 'cep inicio', 'faixa inicial', 'cep_inicial'] },
  { campo: 'cep_final', rotulo: 'CEP final', numerico: false, sinonimos: ['cep final', 'cep fim', 'cep ate', 'cep até', 'faixa final', 'cep_final'] },
  { campo: 'peso_inicial', rotulo: 'Peso inicial (kg)', numerico: true, sinonimos: ['peso inicial', 'peso de', 'peso min', 'peso mínimo', 'kg inicial'] },
  { campo: 'peso_final', rotulo: 'Peso final (kg)', numerico: true, sinonimos: ['peso final', 'peso ate', 'peso até', 'peso max', 'peso máximo', 'kg final'] },
  { campo: 'valor_frete', rotulo: 'Valor do frete (R$)', numerico: true, sinonimos: ['valor', 'frete', 'frete peso', 'valor frete', 'preco', 'preço', 'tarifa'] },
  { campo: 'valor_kg_excedente', rotulo: 'Kg excedente (R$/kg)', numerico: true, sinonimos: ['excedente', 'kg excedente', 'kg adicional', 'adicional kg', 'exc'] },
  { campo: 'frete_minimo', rotulo: 'Frete mínimo (R$)', numerico: true, sinonimos: ['minimo', 'mínimo', 'frete minimo', 'frete mínimo'] },
  { campo: 'ad_valorem_pct', rotulo: 'Ad valorem (%)', numerico: true, sinonimos: ['ad valorem', 'advalorem', 'frete valor', 'adv', 'seguro'] },
  { campo: 'gris_pct', rotulo: 'GRIS (%)', numerico: true, sinonimos: ['gris', 'gerenciamento de risco'] },
  { campo: 'pedagio', rotulo: 'Pedágio (R$/100 kg)', numerico: true, sinonimos: ['pedagio', 'pedágio'] },
  { campo: 'taxa_fixa', rotulo: 'Taxa fixa (R$)', numerico: true, sinonimos: ['tas', 'taxa', 'despacho', 'tde', 'taxa fixa', 'cat'] },
  { campo: 'prazo_dias', rotulo: 'Prazo (dias)', numerico: true, sinonimos: ['prazo', 'dias', 'lead time', 'prazo entrega'] },
]

/** Origem de cada campo: uma coluna da planilha, um valor fixo para todas as linhas, ou nada. */
export type Origem = { tipo: 'coluna'; indice: number } | { tipo: 'fixo'; valor: string } | { tipo: 'nenhum' }
export type Mapeamento = Record<CampoFaixa, Origem>

export type Layout = 'linhas' | 'matriz'

const simplificar = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function sugerirMapeamento(cabecalho: Celula[]): Mapeamento {
  const usados = new Set<number>()
  const cab = cabecalho.map(simplificar)
  const map = {} as Mapeamento
  for (const def of CAMPOS) {
    let achou = -1
    // Primeiro procura correspondência exata, depois "contém".
    for (const modo of ['igual', 'contem'] as const) {
      for (const sin of def.sinonimos.map(simplificar)) {
        achou = cab.findIndex((c, i) => !usados.has(i) && c && (modo === 'igual' ? c === sin : c.includes(sin)))
        if (achou >= 0) break
      }
      if (achou >= 0) break
    }
    if (achou >= 0) usados.add(achou)
    map[def.campo] = achou >= 0 ? { tipo: 'coluna', indice: achou } : { tipo: 'nenhum' }
  }
  return map
}

/** Colunas cujo cabeçalho parece uma faixa de peso ("Até 10 kg", "10 kg", "0 a 5"). */
export function sugerirColunasPeso(cabecalho: Celula[]): number[] {
  return cabecalho
    .map((c, i) => ({ c: simplificar(c), i }))
    .filter(({ c }) => /\d/.test(c) && /(kg|ate|a |^\d+$)/.test(c) && !/cep|prazo|dia/.test(c))
    .map(({ i }) => i)
}

function ler(linha: Celula[], origem: Origem): Celula {
  if (origem.tipo === 'coluna') return linha[origem.indice] ?? null
  if (origem.tipo === 'fixo') return origem.valor
  return null
}

function base(linha: Celula[], map: Mapeamento): Faixa {
  const f = {} as Record<CampoFaixa, string | number>
  for (const def of CAMPOS) {
    const v = ler(linha, map[def.campo])
    f[def.campo] = def.numerico ? numero(v) : String(v ?? '').trim()
  }
  const faixa = f as unknown as Faixa
  faixa.cep_inicial = normalizarCep(faixa.cep_inicial)
  faixa.cep_final = normalizarCep(faixa.cep_final)
  faixa.uf_destino = faixa.uf_destino.toUpperCase().slice(0, 2) || ufDoCep(faixa.cep_inicial)
  return faixa
}

export interface ResultadoConversao {
  faixas: Faixa[]
  avisos: string[]
}

export function converter(
  linhas: Celula[][],
  linhaCabecalho: number,
  map: Mapeamento,
  layout: Layout,
  colunasPeso: number[],
): ResultadoConversao {
  const cabecalho = linhas[linhaCabecalho] ?? []
  const dados = linhas.slice(linhaCabecalho + 1).filter((l) => l.some((c) => c !== null && c !== ''))
  const faixas: Faixa[] = []
  const avisos: string[] = []

  if (layout === 'linhas') {
    for (const l of dados) {
      const f = base(l, map)
      if (!f.uf_destino && !f.cep_inicial) continue
      if (!f.peso_final) f.peso_final = 999999
      faixas.push(f)
    }
  } else {
    const pesos = colunasPeso
      .map((i) => ({ i, peso: pesoDoCabecalho(cabecalho[i]) }))
      .filter((x): x is { i: number; peso: number } => x.peso !== null)
      .sort((a, b) => a.peso - b.peso)
    if (!pesos.length) avisos.push('Nenhuma coluna de peso selecionada.')
    for (const l of dados) {
      const b = base(l, map)
      if (!b.uf_destino && !b.cep_inicial) continue
      let anterior = 0
      for (const { i, peso } of pesos) {
        const valor = numero(l[i])
        if (valor > 0) faixas.push({ ...b, peso_inicial: anterior, peso_final: peso, valor_frete: valor })
        anterior = peso
      }
    }
  }

  if (!faixas.length) avisos.push('Nenhuma faixa válida encontrada. Confira a linha de cabeçalho e o mapeamento de UF/CEP.')
  const semUf = faixas.filter((f) => !f.uf_destino).length
  if (semUf) avisos.push(`${semUf} faixa(s) sem UF identificada.`)
  const semValor = faixas.filter((f) => !f.valor_frete && !f.frete_minimo).length
  if (semValor) avisos.push(`${semValor} faixa(s) sem valor de frete.`)
  return { faixas, avisos }
}
