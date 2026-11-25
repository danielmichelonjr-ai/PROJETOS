// Base de cidades do Brasil por faixa de CEP (UF, cidade, CEP inicial e final). Serve para dar nome certo
// à cidade de cada faixa da tabela Intelipost quando a proposta da transportadora não traz ou traz errado.
import { simplificar } from './abrangencia'
import { ultimaBaseCidades } from './dados'
import { normalizarCep } from './cep'
import type { Celula } from './planilha'

export type LinhaCidade = [uf: string, cidade: string, cepInicial: number, cepFinal: number]

export interface BaseCidades {
  linhas: LinhaCidade[]
  arquivo: string
  enviada_em: string | null
  enviada_por: string | null
}

/** Base que já vem no sistema (planilha "CEPS - BRASIL - CIDADES COM E SEM ACENTOS" de 25/11/2026). */
async function basePadrao(): Promise<BaseCidades> {
  const { default: linhas } = await import('../dados/cidadesBrasil.json')
  return { linhas: linhas as LinhaCidade[], arquivo: 'CEPS - BRASIL - CIDADES COM E SEM ACENTOS.xlsx (base inicial)', enviada_em: null, enviada_por: null }
}

let atual: Promise<BaseCidades> | null = null

/** Base em uso: a última enviada pela equipe ou, se nenhuma foi enviada, a base inicial. */
export function baseCidades(): Promise<BaseCidades> {
  atual ??= ultimaBaseCidades()
    .catch(() => null)
    .then((b) => b ?? basePadrao())
  return atual
}

export function trocarBaseCidades(b: BaseCidades) {
  atual = Promise.resolve(b)
}

const texto = (c: Celula | undefined) => (c === null || c === undefined ? '' : String(c).trim())
const cepNum = (c: Celula | undefined) => Number(normalizarCep(texto(c)) || 0)

/** Lê a planilha de cidades: colunas UF, cidade (com acento de preferência), CEP inicial e CEP final. */
export function lerBaseCidades(linhas: Celula[][]): LinhaCidade[] {
  for (let h = 0; h < Math.min(linhas.length, 20); h++) {
    const cab = (linhas[h] ?? []).map(simplificar)
    const cu = cab.findIndex((c) => c === 'uf' || c === 'estado')
    const com = cab.findIndex((c) => /cidade|municipio|localidade/.test(c) && /com acento/.test(c))
    const sem = cab.findIndex((c, i) => /cidade|municipio|localidade/.test(c) && i !== com)
    const ci = cab.findIndex((c) => /cep.*(de|ini|inicio)\b|cep de/.test(c))
    const cf = cab.findIndex((c) => /cep.*(ate|fim|final)\b/.test(c))
    if (cu < 0 || (com < 0 && sem < 0) || ci < 0 || cf < 0) continue
    const out: LinhaCidade[] = []
    for (const l of linhas.slice(h + 1)) {
      const uf = texto(l?.[cu]).toUpperCase().slice(0, 2)
      const nomeCom = com >= 0 ? texto(l?.[com]) : ''
      // Fórmula quebrada na planilha (#REF!, #N/D) cai no nome sem acento.
      const nome = nomeCom && !nomeCom.startsWith('#') ? nomeCom : texto(l?.[sem])
      const a = cepNum(l?.[ci])
      const b = cepNum(l?.[cf])
      if (uf && nome && a && b && b >= a) out.push([uf, nome, a, b])
    }
    if (out.length) return out
  }
  return []
}

export type CorretorCidade = (uf: string, cidade: string, cepInicial: number, cepFinal: number) => string

/**
 * Nome da cidade de uma faixa de CEP: se a faixa está (quase) inteira dentro de uma cidade da base, usa o nome da base;
 * senão, se o nome da proposta bate com uma cidade da UF, usa a grafia da base; senão, mantém o da proposta.
 */
export function corretorCidades(linhas: LinhaCidade[]): CorretorCidade {
  const ord = [...linhas].sort((a, b) => a[2] - b[2])
  const porNome = new Map(linhas.map(([uf, nome]) => [`${uf}|${simplificar(nome)}`, nome]))
  const contendo = (cep: number) => {
    let lo = 0
    let hi = ord.length - 1
    let achado = -1
    while (lo <= hi) {
      const m = (lo + hi) >> 1
      if (ord[m][2] <= cep) (achado = m), (lo = m + 1)
      else hi = m - 1
    }
    return achado >= 0 && ord[achado][3] >= cep ? ord[achado] : null
  }
  return (uf, cidade, ci, cf) => {
    const tam = Math.max(1, cf - ci + 1)
    for (const r of [contendo(ci), contendo(cf)]) {
      if (r && Math.min(cf, r[3]) - Math.max(ci, r[2]) + 1 >= tam * 0.99) return r[1]
    }
    const simples = simplificar(cidade.split('·').pop())
    return porNome.get(`${uf.toUpperCase()}|${simples}`) ?? cidade
  }
}
