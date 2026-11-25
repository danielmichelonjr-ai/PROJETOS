// Leitura de propostas em PDF: reconstrói as tabelas a partir da posição do texto em cada página
// e procura as taxas gerais (GRIS, ad valorem, pedágio, taxas por CT-e) no texto corrido.
import type { Aba, Celula } from './planilha'

interface Item {
  x0: number
  x1: number
  y: number
  h: number
  str: string
}

interface Linha {
  y: number
  h: number
  celulas: Item[]
}

/** Junta itens da mesma linha que estão colados (ex.: "R$" e "40,25") numa célula só. */
function celulasDaLinha(itens: Item[]): Item[] {
  const ord = [...itens].sort((a, b) => a.x0 - b.x0)
  const out: Item[] = []
  for (const it of ord) {
    const ult = out[out.length - 1]
    const espaco = Math.max(2, it.h * 0.9)
    if (ult && it.x0 - ult.x1 <= espaco) {
      ult.str = (ult.str + (it.x0 - ult.x1 > 0.5 ? ' ' : '') + it.str).replace(/\s+/g, ' ')
      ult.x1 = Math.max(ult.x1, it.x1)
    } else out.push({ ...it })
  }
  return out.filter((c) => c.str.trim())
}

/** Agrupa os itens de texto em linhas pela coordenada vertical. */
function agruparLinhas(itens: Item[]): Linha[] {
  const ord = [...itens].sort((a, b) => b.y - a.y || a.x0 - b.x0)
  const linhas: { y: number; h: number; itens: Item[] }[] = []
  for (const it of ord) {
    const l = linhas[linhas.length - 1]
    if (l && Math.abs(l.y - it.y) <= Math.max(2, Math.min(l.h, it.h) * 0.5)) {
      l.itens.push(it)
      l.h = Math.max(l.h, it.h)
    } else linhas.push({ y: it.y, h: it.h, itens: [it] })
  }
  return linhas.map((l) => ({ y: l.y, h: l.h, celulas: celulasDaLinha(l.itens) }))
}

/**
 * Cabeçalhos quebrados em duas linhas ("Excedente acima" / "de 100 kg"): um fragmento curto logo acima
 * de uma linha com várias células é incorporado à célula que fica embaixo dele.
 */
function juntarCabecalhosQuebrados(linhas: Linha[]): Linha[] {
  const out: Linha[] = []
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    const prox = linhas[i + 1]
    if (prox && l.celulas.length <= 2 && prox.celulas.length >= 4 && l.y - prox.y <= Math.max(l.h, prox.h) * 1.6) {
      const alvos = l.celulas.map((c) => prox.celulas.find((p) => c.x0 < p.x1 && c.x1 > p.x0))
      if (alvos.every(Boolean)) {
        l.celulas.forEach((c, k) => (alvos[k]!.str = c.str + ' ' + alvos[k]!.str))
        continue
      }
    }
    out.push(l)
  }
  return out
}

/** Converte as linhas da página numa grade de colunas, alinhando pelas faixas horizontais das células. */
function montarGrade(linhas: Linha[]): Celula[][] {
  // As colunas vêm das linhas da tabela principal da página; linhas de texto com outro formato
  // (cabeçalho do documento, contatos) não podem fundir colunas vizinhas.
  // Usa o número de células mais frequente entre as linhas com 3 ou mais (o "formato" da tabela).
  const freq = new Map<number, number>()
  for (const l of linhas) if (l.celulas.length >= 3) freq.set(l.celulas.length, (freq.get(l.celulas.length) ?? 0) + 1)
  const [padrao] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0]
  const tabulares = linhas.filter((l) => l.celulas.length === padrao)
  const faixas: [number, number][] = []
  for (const c of tabulares.flatMap((l) => l.celulas).sort((a, b) => a.x0 - b.x0)) {
    const f = faixas[faixas.length - 1]
    if (f && c.x0 <= f[1]) f[1] = Math.max(f[1], c.x1)
    else faixas.push([c.x0, c.x1])
  }
  if (!faixas.length) return linhas.map((l) => [l.celulas.map((c) => c.str).join(' ')])
  const coluna = (c: Item) => {
    const meio = (c.x0 + c.x1) / 2
    let melhor = 0
    let dist = Infinity
    faixas.forEach(([a, b], i) => {
      const d = meio < a ? a - meio : meio > b ? meio - b : 0
      if (d < dist) (dist = d), (melhor = i)
    })
    return melhor
  }
  return linhas.map((l) => {
    const linha: Celula[] = new Array(faixas.length).fill(null)
    // Linhas de texto corrido (1 ou 2 células largas) ficam na primeira coluna, inteiras.
    if (l.celulas.length <= 2 && l.celulas.some((c) => c.x1 - c.x0 > 300)) {
      linha[0] = l.celulas.map((c) => c.str).join('   ')
      return linha
    }
    for (const c of l.celulas) {
      const i = coluna(c)
      linha[i] = linha[i] ? `${linha[i]} ${c.str}` : c.str
    }
    return linha
  })
}

export interface PdfLido {
  abas: Aba[]
  /** Texto de cada linha, na ordem, para procurar taxas. */
  texto: string[]
}

export async function lerPdf(arquivo: File): Promise<PdfLido> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise
  const abas: Aba[] = []
  const texto: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p)
    const conteudo = await pagina.getTextContent()
    const itens: Item[] = []
    for (const it of conteudo.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const [, , , d, x, y] = it.transform as number[]
      const h = Math.abs(d) || it.height || 8
      itens.push({ x0: x, x1: x + it.width, y, h, str: it.str.trim() })
    }
    const linhas = juntarCabecalhosQuebrados(agruparLinhas(itens))
    texto.push(...linhas.map((l) => l.celulas.map((c) => c.str).join('   ')))
    abas.push({ nome: doc.numPages > 1 ? `página ${p}` : 'PDF', linhas: montarGrade(linhas) })
  }
  if (!itensTotais(abas)) throw new Error(`O PDF ${arquivo.name} não tem texto selecionável (parece uma imagem escaneada).`)
  return { abas, texto }
}

const itensTotais = (abas: Aba[]) => abas.reduce((t, a) => t + a.linhas.filter((l) => l.some((c) => c !== null)).length, 0)

// ---------- Taxas gerais escritas no texto da proposta ----------

export interface TaxaEncontrada {
  campo: 'gris_pct' | 'ad_valorem_pct' | 'pedagio' | 'taxa_fixa' | 'frete_minimo' | 'valor_kg_excedente'
  valor: number
  trecho: string
}

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))
const pct = (l: string) => {
  const m = [...l.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].pop()
  return m ? num(m[1]) : null
}
const reais = (l: string) => {
  const m = [...l.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/gi)].pop()
  return m ? num(m[1]) : null
}
const isento = (l: string) => /\b(isento|isenta|incluso|inclusa|n[aã]o cobra)/i.test(l)

/** Procura GRIS, ad valorem, pedágio, frete mínimo e taxas por CT-e no texto. */
export function taxasDoTexto(linhas: string[]): TaxaEncontrada[] {
  const achadas: TaxaEncontrada[] = []
  const add = (campo: TaxaEncontrada['campo'], valor: number | null, trecho: string) => {
    if (valor !== null && Number.isFinite(valor) && !achadas.some((a) => a.campo === campo && a.trecho === trecho)) achadas.push({ campo, valor, trecho: trecho.replace(/\s+/g, ' ').trim() })
  }
  for (const l of linhas) {
    const t = l.normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (isento(t) && !/%|R\$\s*\d/.test(t.replace(/m[ií]nimo de R\$\s*[\d.,]+/i, ''))) continue
    if (/\bGRIS\b|gerenciamento de risco/i.test(t)) add('gris_pct', pct(t), l)
    else if (/ad ?valorem|\bADV\b/i.test(t)) add('ad_valorem_pct', pct(t), l)
    else if (/pedagio/i.test(t)) add('pedagio', reais(t), l)
    else if (/frete m[ií]nimo/i.test(t)) add('frete_minimo', reais(t), l)
    else if (/(por|cada) (CT-?e|conhecimento|despacho|embarque)|\bTAS\b|taxa de despacho/i.test(t) && !/%/.test(t)) add('taxa_fixa', reais(t), l)
  }
  // Várias taxas por CT-e somam numa taxa fixa só.
  const fixas = achadas.filter((a) => a.campo === 'taxa_fixa')
  if (fixas.length > 1) {
    const soma = fixas.reduce((s, a) => s + a.valor, 0)
    return [...achadas.filter((a) => a.campo !== 'taxa_fixa'), { campo: 'taxa_fixa', valor: Math.round(soma * 100) / 100, trecho: fixas.map((a) => a.trecho).join(' + ') }]
  }
  return achadas
}

/** Avisos úteis encontrados no texto (ex.: valores sem ICMS). */
export function observacoesDoTexto(linhas: string[]): string[] {
  const t = linhas.join(' ')
  const obs: string[] = []
  if (/sem icms/i.test(t)) obs.push('A proposta informa valores SEM ICMS.')
  const cub = t.match(/(\d{2,3})\s*kg\s*\/?\s*m(?:³|3)/i)
  if (cub) obs.push(`Cubagem informada: ${cub[1]} kg/m³.`)
  return obs
}
