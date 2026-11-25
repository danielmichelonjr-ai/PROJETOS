// Abrangência: lista de faixas de CEP atendidas, separada da tabela de preços.
// Cada faixa pertence a um grupo (ex.: "Zona Norte São Paulo I"), e cada grupo recebe a região de preço
// da proposta (ex.: "Capital", "Interior 1"). Aceita planilha com colunas de CEP inicial/final ou texto
// corrido do tipo "01000 a 01099 – Centro (Sé / República)".
import { normalizarCep, ufDoCep } from './cep'
import { numero, type Celula } from './planilha'
import type { Faixa } from './types'

export interface FaixaCep {
  grupo: string
  descricao: string
  cep_inicial: string
  cep_final: string
  uf: string
  prazo: number
}

export const simplificar = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const texto = (c: Celula | undefined) => (c === null || c === undefined ? '' : String(c).trim())

/** "01000" vira 01000000 (início) ou 01000999 (fim); CEP completo fica como está. */
function cepDaFaixa(s: string, fim: boolean): string {
  const d = s.replace(/\D/g, '')
  if (d.length >= 8) return d.slice(0, 8)
  if (d.length === 5) return d + (fim ? '999' : '000')
  if (d.length === 6) return d.slice(0, 5) + (fim ? '999' : '000') // "024999": erro de digitação comum
  return normalizarCep(d)
}

const RE_FAIXA = /^\s*(\d{5}-?\d{0,3})\s*(?:a|at[eé]|à|-|–|—)\s*(\d{5}-?\d{0,3})\s*[-–—:]?\s*(.*)$/i

/** Lê faixas de CEP escritas em texto: cada linha "CEP a CEP – descrição"; as demais linhas viram o grupo. */
function faixasDeTexto(linhas: Celula[][]): FaixaCep[] {
  const out: FaixaCep[] = []
  let grupo = ''
  for (const l of linhas) {
    const celulas = (l ?? []).map(texto).filter(Boolean)
    if (!celulas.length) continue
    const t = celulas.join(' ')
    const m = t.match(RE_FAIXA)
    if (m) {
      const ini = cepDaFaixa(m[1], false)
      const fim = cepDaFaixa(m[2], true)
      if (ini.length === 8 && fim.length === 8) {
        const prazo = t.match(/(\d+)\s*dias?/i)
        out.push({ grupo: grupo || 'Sem grupo', descricao: m[3].trim() || t, cep_inicial: ini, cep_final: fim, uf: ufDoCep(ini), prazo: prazo ? Number(prazo[1]) : 0 })
        continue
      }
    }
    // Títulos da planilha (primeira linha) não viram grupo se ainda não há faixas embaixo deles.
    grupo = t.replace(/\s+/g, ' ')
  }
  return out
}

/** Lê faixas de uma planilha com colunas de CEP inicial e final (grupo, UF e prazo opcionais). */
function faixasDeColunas(linhas: Celula[][]): FaixaCep[] | null {
  for (let h = 0; h < Math.min(linhas.length, 30); h++) {
    const cab = (linhas[h] ?? []).map(simplificar)
    const ci = cab.findIndex((c) => /cep.*(ini|de\b|inicio)|^de$|faixa ini/.test(c))
    const cf = cab.findIndex((c) => /cep.*(fim|final|ate)|^ate$|faixa fin/.test(c))
    if (ci < 0 || cf < 0) continue
    // Região tarifária tem prioridade sobre colunas de cidade/zona quando as duas existem.
    const cg = [/tarif/, /regiao|praca|classifica|tipo/, /grupo|zona/, /cidade|municipio|localidade/]
      .map((re) => cab.findIndex((c) => re.test(c)))
      .find((i) => i >= 0) ?? -1
    const cc = cab.findIndex((c, i) => i !== cg && /cidade|municipio|localidade|bairro|praca/.test(c))
    const cu = cab.findIndex((c) => c === 'uf' || c === 'estado')
    const cp = cab.findIndex((c) => /prazo|dias|lead/.test(c))
    const out: FaixaCep[] = []
    for (const l of linhas.slice(h + 1)) {
      const ini = cepDaFaixa(texto(l?.[ci]), false)
      const fim = cepDaFaixa(texto(l?.[cf]), true)
      if (ini.length !== 8 || fim.length !== 8) continue
      const grupo = cg >= 0 ? texto(l[cg]) : 'Todas as faixas'
      out.push({
        grupo: grupo || 'Sem grupo',
        descricao: cc >= 0 ? texto(l[cc]) : cg >= 0 ? texto(l[cg]) : '',
        cep_inicial: ini,
        cep_final: fim,
        uf: (cu >= 0 ? texto(l[cu]).toUpperCase().slice(0, 2) : '') || ufDoCep(ini),
        prazo: cp >= 0 ? numero(l[cp]) : 0,
      })
    }
    if (out.length) return out
  }
  return null
}

export function lerAbrangencia(linhas: Celula[][]): FaixaCep[] {
  return faixasDeColunas(linhas) ?? faixasDeTexto(linhas)
}

/** Quantas faixas de CEP a fonte parece ter (para sugerir qual arquivo é a abrangência). */
export const contarFaixasCep = (linhas: Celula[][]) => lerAbrangencia(linhas).length

export function gruposDe(faixas: FaixaCep[]): { grupo: string; qtd: number }[] {
  const m = new Map<string, number>()
  for (const f of faixas) m.set(f.grupo, (m.get(f.grupo) ?? 0) + 1)
  return [...m].map(([grupo, qtd]) => ({ grupo, qtd }))
}

/** Região usada quando a abrangência não informa a região tarifária: "Capital", se existir, ou a primeira. */
export const regiaoPadrao = (regioes: string[]) => regioes.find((r) => simplificar(r) === 'capital') ?? regioes[0] ?? ''

/** Sugere a região de preço de cada grupo quando o nome do grupo contém o nome da região. */
export function sugerirAtribuicao(grupos: string[], regioes: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const rs = [...regioes].sort((a, b) => simplificar(b).length - simplificar(a).length)
  for (const g of grupos) {
    const sg = simplificar(g)
    const r = rs.find((r) => simplificar(r) && (sg === simplificar(r) || sg.includes(simplificar(r))))
    if (r) out[g] = r
  }
  return out
}

/**
 * Cruza a tabela de preços (uma faixa por região × peso, com a região em "cidade") com a abrangência:
 * cada faixa de CEP recebe os preços da região atribuída ao seu grupo.
 */
export function aplicarAbrangencia(precos: Faixa[], cepFaixas: FaixaCep[], atribuicao: Record<string, string>) {
  const porRegiao = new Map<string, Faixa[]>()
  for (const f of precos) {
    const k = simplificar(f.cidade)
    porRegiao.set(k, [...(porRegiao.get(k) ?? []), f])
  }
  const faixas: Faixa[] = []
  const semRegiao = new Set<string>()
  const regiaoSemPreco = new Set<string>()
  for (const c of cepFaixas) {
    const regiao = atribuicao[c.grupo]
    if (!regiao) {
      semRegiao.add(c.grupo)
      continue
    }
    const lista = porRegiao.get(simplificar(regiao))
    if (!lista?.length) {
      regiaoSemPreco.add(regiao)
      continue
    }
    for (const p of lista)
      faixas.push({
        ...p,
        uf_destino: c.uf || p.uf_destino,
        cidade: `${regiao} · ${c.descricao || c.grupo}`.slice(0, 120),
        cep_inicial: c.cep_inicial,
        cep_final: c.cep_final,
        prazo_dias: c.prazo || p.prazo_dias,
      })
  }
  const avisos: string[] = []
  if (semRegiao.size) avisos.push(`${semRegiao.size} grupo(s) de CEP sem região de preço escolhida ficaram de fora: ${[...semRegiao].join('; ')}.`)
  if (regiaoSemPreco.size) avisos.push(`Região sem preço na tabela: ${[...regiaoSemPreco].join(', ')}.`)
  return { faixas, avisos }
}
