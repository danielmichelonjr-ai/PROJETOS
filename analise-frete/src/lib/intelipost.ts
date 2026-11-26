import { baseCidades, corretorCidades, type CorretorCidade } from './cidades'
import { faixasCepDaUf } from './cep'
import type { Celula } from './planilha'
import type { Faixa, Proposta } from './types'
import {
  COLUNAS_FIM,
  COLUNAS_INICIO,
  LARGURA_A,
  LARGURA_B,
  LARGURA_PESO,
  NOTA_COMPARACAO,
  NOTA_FAIXA_PESO,
  PARAMETROS,
  TEXTO_A4,
  type ColunaModelo,
} from './intelipostModelo'

// Exportação no modelo oficial da Intelipost (PADRÃO INTELIPOST - 2026): uma linha por faixa de CEP,
// as faixas de peso em colunas, as taxas nas colunas do modelo e os parâmetros da tabela na coluna A.

/** Parâmetros da tabela, na coluna A do modelo. */
export interface ParametrosIntelipost {
  icms: '' | 'S' | 'N'
  cubagem: string
  isencaoCubagem: string
  altura: string
  largura: string
  comprimento: string
  somaDimensoes: string
  cepOrigemInicial: string
  cepOrigemFinal: string
  nomeTabela: string
  /** GRIS mínimo em R$ por CT-e: vai na coluna GRIS MÍNIMO de todas as linhas. */
  grisMinimo: string
  /** De onde a transportadora coleta: na Filial SP entra a taxa interna de transferência. */
  origemColeta: OrigemColeta
}

/** Origem padrão da Multimóveis: todo o Brasil. */
export const CEP_ORIGEM_INICIAL = '01000000'
export const CEP_ORIGEM_FINAL = '99999999'

export type OrigemColeta = 'MATRIZ' | 'FILIAL SP'
/** Taxa interna de transferência (R$ por kg) das coletas na Filial SP: vai em OUTRA TAXA FIXO, a cada 1 kg. */
export const TAXA_TRANSFERENCIA_SP = 0.45

/** Valores aplicados a todas as linhas da tabela, vindos dos parâmetros. */
export interface ExtrasIntelipost {
  grisMinimo?: number | null
  outraTaxa?: number | null
  /** Nome da cidade pela base de cidades por CEP. */
  cidade?: CorretorCidade
}

export const extrasDe = (p: ParametrosIntelipost): ExtrasIntelipost => ({
  grisMinimo: valorBr(p.grisMinimo),
  outraTaxa: p.origemColeta === 'FILIAL SP' ? TAXA_TRANSFERENCIA_SP : null,
})

export const PARAMETROS_VAZIOS: ParametrosIntelipost = {
  icms: '',
  cubagem: '',
  isencaoCubagem: '',
  altura: '',
  largura: '',
  comprimento: '',
  somaDimensoes: '',
  cepOrigemInicial: CEP_ORIGEM_INICIAL,
  cepOrigemFinal: CEP_ORIGEM_FINAL,
  nomeTabela: '',
  grisMinimo: '',
  origemColeta: 'MATRIZ',
}

const CHAVE_PARAMS = 'intelipost-parametros'

/** Origem e ICMS costumam se repetir entre propostas: ficam lembrados neste navegador. */
export function parametrosLembrados(): ParametrosIntelipost {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PARAMS) ?? 'null')
    if (p) return { ...PARAMETROS_VAZIOS, icms: p.icms ?? '', cepOrigemInicial: p.cepOrigemInicial || CEP_ORIGEM_INICIAL, cepOrigemFinal: p.cepOrigemFinal || CEP_ORIGEM_FINAL }
  } catch {
    // Sem armazenamento: começa vazio.
  }
  return { ...PARAMETROS_VAZIOS }
}

export function lembrarParametros(p: ParametrosIntelipost) {
  try {
    localStorage.setItem(CHAVE_PARAMS, JSON.stringify({ icms: p.icms, cepOrigemInicial: p.cepOrigemInicial, cepOrigemFinal: p.cepOrigemFinal }))
  } catch {
    // Ignora: vale só nesta sessão.
  }
}

/** "2,00" ou "2.00" em número; vazio vira null. */
export function valorBr(s: string): number | null {
  const t = String(s ?? '').trim()
  if (!t) return null
  const v = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(v) && v > 0 ? v : null
}

/** Valores dos parâmetros na ordem de PARAMETROS (rótulos da coluna A). */
const valoresParametros = (p: ParametrosIntelipost): (string | number | null)[] => {
  const n = (s: string) => {
    const v = Number(String(s).replace(/\./g, '').replace(',', '.'))
    return s.trim() && Number.isFinite(v) ? v : null
  }
  const cep = (s: string) => (s.replace(/\D/g, '') ? Number(s.replace(/\D/g, '')) : null)
  return [p.icms || null, n(p.cubagem), n(p.isencaoCubagem), n(p.altura), n(p.largura), n(p.comprimento), n(p.somaDimensoes), cep(p.cepOrigemInicial), cep(p.cepOrigemFinal), p.nomeTabela || null]
}

export interface LinhaIntelipost {
  uf: string
  cidade: string
  cepi: number
  cepf: number
  prazo: number | null
  minimo: number | null
  porPeso: (number | null)[]
  excedente: number | null
  adValorem: number | null
  gris: number | null
  tas: number | null
  pedagio: number | null
  grisMinimo: number | null
  outraTaxa: number | null
}

const ou = (n: number) => (n ? n : null)
const ABERTO = 999999

/** Agrupa as faixas (CEP × peso) em linhas do modelo: uma por faixa de CEP, com o frete de cada peso em colunas. */
export function montarTabelaIntelipost(faixas: Faixa[], extras: ExtrasIntelipost = {}): { pesos: number[]; linhas: LinhaIntelipost[] } {
  const limites = [...new Set(faixas.map((f) => f.peso_final).filter((p) => p > 0))].sort((a, b) => a - b)
  const pesos = limites.some((p) => p < ABERTO) ? limites.filter((p) => p < ABERTO) : limites
  const grupos = new Map<string, Faixa[]>()
  for (const f of faixas) {
    const k = [f.uf_destino, f.cidade, f.cep_inicial, f.cep_final, f.prazo_dias, f.frete_minimo, f.valor_kg_excedente, f.ad_valorem_pct, f.gris_pct, f.taxa_fixa, f.pedagio].join('|')
    grupos.set(k, [...(grupos.get(k) ?? []), f])
  }
  const linhas: LinhaIntelipost[] = []
  for (const g of grupos.values()) {
    const f = g[0]
    const porPeso = pesos.map((w) => {
      const faixa = g.filter((x) => x.peso_final >= w && x.peso_inicial < w).sort((a, b) => a.peso_final - b.peso_final)[0]
      return faixa ? faixa.valor_frete : null
    })
    // Sem CEP (proposta só por UF): usa as faixas de CEP da UF.
    const ceps: [string, string][] = f.cep_inicial ? [[f.cep_inicial, f.cep_final || f.cep_inicial]] : faixasCepDaUf(f.uf_destino)
    for (const [ci, cf] of ceps)
      linhas.push({
        uf: f.uf_destino,
        cidade: extras.cidade ? extras.cidade(f.uf_destino, f.cidade, Number(ci), Number(cf)) : f.cidade,
        cepi: Number(ci),
        cepf: Number(cf),
        prazo: ou(f.prazo_dias),
        minimo: ou(f.frete_minimo),
        porPeso,
        excedente: ou(f.valor_kg_excedente),
        adValorem: ou(f.ad_valorem_pct),
        gris: ou(f.gris_pct),
        tas: ou(f.taxa_fixa),
        pedagio: ou(f.pedagio),
        grisMinimo: extras.grisMinimo ?? null,
        outraTaxa: extras.outraTaxa ?? null,
      })
  }
  linhas.sort((a, b) => a.cepi - b.cepi)
  return { pesos, linhas }
}

/** Valor de cada coluna "fim" do modelo que o sistema preenche. */
const VALOR_FIM: Record<string, (l: LinhaIntelipost) => Celula> = {
  'VALOR EXCEDENTE': (l) => l.excedente,
  'FRETE VALOR (%)': (l) => l.adValorem,
  'GRIS MÍNIMO': (l) => l.grisMinimo,
  'GRIS (%)': (l) => l.gris,
  'TAS FIXO': (l) => l.tas,
  'PEDÁGIO FIXO': (l) => l.pedagio,
  'FAIXA DE PESO (KG) DO PEDÁGIO FIXO': (l) => (l.pedagio ? 100 : null),
  'OUTRA TAXA FIXO': (l) => l.outraTaxa,
  'FAIXA DE PESO (KG) DA OUTRA TAXA FIXO': (l) => (l.outraTaxa ? 1 : null),
}

/** Colunas mostradas na prévia da tela (as que o sistema preenche). */
export function previaIntelipost(faixas: Faixa[], extras: ExtrasIntelipost = {}, limite = 100): { cabecalho: string[]; linhas: Celula[][]; total: number } {
  const { pesos, linhas } = montarTabelaIntelipost(faixas, extras)
  const fim = Object.keys(VALOR_FIM).filter((c) => !c.includes('OUTRA TAXA') || linhas.some((l) => l.outraTaxa))
  return {
    cabecalho: ['UF', 'CIDADE', 'CEPI', 'CEPF', 'PRAZO', 'VALOR MÍNIMO DO FRETE', ...pesos.map((p) => `${p} kg`), ...fim],
    linhas: linhas.slice(0, limite).map((l) => [l.uf, l.cidade, l.cepi, l.cepf, l.prazo, l.minimo, ...l.porPeso, ...fim.map((c) => VALOR_FIM[c](l))]),
    total: linhas.length,
  }
}

const COR: Record<ColunaModelo[1], string> = { E: 'FF072B1D', C: 'FF2AD04B', V: 'FFACABC0', G: 'FF757070', A: 'FFFFC000' }
const BRL = '"R$" #,##0.00'

export async function exportarIntelipost(proposta: Pick<Proposta, 'transportadora' | 'nome'>, faixas: Faixa[], params: ParametrosIntelipost = parametrosLembrados()) {
  const { default: Excel } = await import('exceljs')
  const { pesos, linhas } = montarTabelaIntelipost(faixas, { ...extrasDe(params), cidade: corretorCidades((await baseCidades()).linhas) })
  const wb = new Excel.Workbook()
  const ws = wb.addWorksheet('Planilha1')
  const borda = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } as const
  const cab = (cor: string, centro: boolean) => ({
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } } as const,
    font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
    alignment: { vertical: 'middle', horizontal: centro ? 'center' : undefined, wrapText: true } as const,
  })

  // Colunas: A (parâmetros), B (vazia), C–H, faixas de peso, demais colunas do modelo.
  type Col = { titulo: string | number; cor: string; nota: string; largura: number; centro: boolean; brl: boolean; valor: (l: LinhaIntelipost) => Celula }
  const inicio: ((l: LinhaIntelipost) => Celula)[] = [(l) => l.uf, (l) => l.cidade, (l) => l.cepi, (l) => l.cepf, (l) => l.prazo, (l) => l.minimo]
  const cols: Col[] = [
    ...COLUNAS_INICIO.map(([t, c, n, w, ce], i) => ({ titulo: t, cor: COR[c], nota: n, largura: w, centro: !!ce, brl: false, valor: inicio[i] })),
    ...pesos.map((p, i) => ({ titulo: p, cor: COR.E, nota: NOTA_FAIXA_PESO, largura: LARGURA_PESO, centro: true, brl: true, valor: (l: LinhaIntelipost) => l.porPeso[i] })),
    ...COLUNAS_FIM.map(([t, c, n, w, ce]) => ({ titulo: t, cor: COR[c], nota: n, largura: w, centro: !!ce, brl: t === 'VALOR EXCEDENTE' || t === 'GRIS MÍNIMO', valor: VALOR_FIM[t] ?? (() => null) })),
  ]
  ws.getColumn(1).width = LARGURA_A
  ws.getColumn(2).width = LARGURA_B
  cols.forEach((c, i) => (ws.getColumn(i + 3).width = c.largura))

  // Títulos acima das faixas de peso e da tabela por comparação.
  const primeiroPeso = 3 + COLUNAS_INICIO.length
  const meioPeso = primeiroPeso + Math.max(0, Math.floor((pesos.length - 1) / 2))
  const titulo = (r: number, c: number, texto: string, cor: string, nota = '') => {
    const cel = ws.getCell(r, c)
    cel.value = texto
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } }
    cel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cel.alignment = { horizontal: 'center', vertical: 'middle' }
    if (nota) cel.note = nota
  }
  if (pesos.length) {
    titulo(1, meioPeso, 'TABELA DE FRETE POR PESO', COR.E)
    titulo(3, meioPeso, 'FAIXAS DE PESO (KG)', COR.E)
  }
  const colComparacao = 3 + cols.findIndex((c) => c.titulo === '% SOBRE A NF')
  titulo(1, colComparacao, 'TABELA DE FRETE POR COMPARAÇÃO', COR.C, NOTA_COMPARACAO)

  // Linha 4: cabeçalho.
  const r4 = ws.getRow(4)
  r4.height = 60
  const a4 = ws.getCell('A4')
  a4.value = TEXTO_A4
  Object.assign(a4, cab(COR.E, false))
  a4.alignment = { vertical: 'top', wrapText: true }
  cols.forEach((c, i) => {
    const cel = r4.getCell(i + 3)
    cel.value = c.titulo
    Object.assign(cel, cab(c.cor, c.centro || typeof c.titulo === 'number'))
    if (c.nota) cel.note = c.nota
  })

  // Dados a partir da linha 5.
  linhas.forEach((l, k) => {
    const row = ws.getRow(5 + k)
    cols.forEach((c, i) => {
      const cel = row.getCell(i + 3)
      const v = c.valor(l)
      if (v !== null && v !== undefined && v !== '') cel.value = v
      cel.border = borda
      cel.alignment = { horizontal: 'center' }
      if (c.brl) cel.numFmt = BRL
    })
  })

  // Coluna A: parâmetros da tabela (rótulo em 6, 9, 12… e valor logo abaixo).
  const valores = valoresParametros({ ...params, nomeTabela: params.nomeTabela || `${proposta.transportadora} - ${proposta.nome}` })
  PARAMETROS.forEach(([rotulo, nota], i) => {
    const r = 6 + i * 3
    const rot = ws.getCell(r, 1)
    rot.value = rotulo
    rot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.E } }
    rot.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    rot.alignment = { wrapText: true }
    rot.border = borda
    if (nota) rot.note = nota
    const val = ws.getCell(r + 1, 1)
    if (valores[i] !== null) val.value = valores[i]
    val.border = borda
    val.alignment = { horizontal: i === PARAMETROS.length - 1 ? 'right' : 'left' }
  })
  ws.getCell('A7').dataValidation = { type: 'list', allowBlank: true, formulae: ['"S,N"'], showErrorMessage: true, error: 'Atenção! - Sua resposta não corresponde ao que foi solicitado.' }
  for (const a of ['A10', 'A13']) ws.getCell(a).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'Atenção! - Fator de cubagem inválido.' }
  for (const a of ['A16', 'A19', 'A22', 'A25']) ws.getCell(a).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 300], showErrorMessage: true, error: 'Atenção! - Dimensão inválida.' }
  for (const a of ['A28', 'A31']) ws.getCell(a).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, error: 'Atenção! - CEP inválido.' }

  const buffer = await wb.xlsx.writeBuffer()
  const nome = `Intelipost - ${proposta.transportadora} - ${proposta.nome}`.replace(/[\\/:*?"<>|]/g, '-')
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nome}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Avisos sobre campos obrigatórios do modelo que ficaram vazios. */
export function pendenciasIntelipost(p: ParametrosIntelipost): string[] {
  const f: string[] = []
  if (!p.icms) f.push('ICMS já está calculado? (S/N)')
  if (!p.cepOrigemInicial.replace(/\D/g, '')) f.push('CEP origem inicial')
  if (!p.cepOrigemFinal.replace(/\D/g, '')) f.push('CEP origem final')
  return f
}

/** Parâmetros que a própria proposta informa no texto: ICMS e cubagem. */
/**
 * Parâmetros escritos na própria planilha da proposta, nas primeiras colunas: rótulo numa célula e valor logo abaixo
 * (ex.: "ICMS Incluso?(S/N)" / "N", "CUBAGEM(kg/m³)" / 300), como no modelo da Intelipost.
 */
export function parametrosDaPlanilha(linhas: Celula[][]): Partial<ParametrosIntelipost> {
  const p: Partial<ParametrosIntelipost> = {}
  const abaixo = (r: number, c: number) => {
    for (let k = r + 1; k < Math.min(linhas.length, r + 4); k++) {
      const v = linhas[k]?.[c]
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim()
    }
    return ''
  }
  for (let r = 0; r < Math.min(linhas.length, 80); r++) {
    for (let c = 0; c < 2; c++) {
      const rot = String(linhas[r]?.[c] ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      if (!p.icms && /ICMS/.test(rot)) {
        const v = abaixo(r, c).toUpperCase()
        if (v === 'S' || v === 'N') p.icms = v
      } else if (!p.cubagem && /CUBAGEM/.test(rot)) {
        const v = abaixo(r, c)
        if (/^\d{2,4}$/.test(v)) p.cubagem = v
      }
    }
  }
  return p
}

export function parametrosDoTexto(linhas: string[]): Partial<ParametrosIntelipost> {
  const t = linhas.join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '')
  const p: Partial<ParametrosIntelipost> = {}
  if (/sem icms|icms (nao )?(esta )?(nao )?incluso|nao inclu\w* (o )?icms|acrescid\w* (de |do )?icms/i.test(t)) p.icms = 'N'
  else if (/com icms|icms incluso|icms inclu[ií]do/i.test(t)) p.icms = 'S'
  const cub = t.match(/(\d{2,3})\s*kg\s*\/?\s*m(?:³|3)/i)
  if (cub) p.cubagem = cub[1]
  const gm = t.match(/GRIS[^.]*?(?:\.[^.]*?)?m[ií]nimo (?:de )?R\$\s*(\d+(?:[.,]\d{1,2})?)/i)
  if (gm) p.grisMinimo = gm[1]
  return p
}
