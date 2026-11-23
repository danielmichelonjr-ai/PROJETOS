import { numero, type Aba, type Celula } from './planilha'

// Validação de SKUs contra as restrições de coleta da JADLOG.
// Cada linha da planilha de cadastro é um volume; linhas com o mesmo código
// modelo formam um SKU. Se qualquer volume falhar, o SKU inteiro fica não apto.

export interface SkuJadlog {
  sku: string
  desc: string
  peso: number // kg, NaN quando vazio
  qtd: number // quantidade de volumes informada no cadastro
  vols: [number, number, number][] // A × L × P em mm
}

export interface BaseJadlog {
  arquivo: string
  enviada_em: string
  skus: SkuJadlog[]
}

export interface RegrasJadlog {
  peso: number // aceita até o limite (≤)
  lado: number // recusa se o maior lado for ≥
  soma: number // recusa se A+L+P passar do limite (>)
  zero: boolean // peso/dimensão zerada = não apto
  termos: string[]
  excecoes: string[]
}

export type Motivo = 'PESO' | 'LADO' | 'SOMA' | 'TERMO' | 'DADOS'
export const MOTIVOS: Motivo[] = ['PESO', 'LADO', 'SOMA', 'TERMO', 'DADOS']

export interface ResultadoSku {
  s: SkuJadlog
  motivos: Set<Motivo>
  termos: string[]
  maiorLado: number
  maiorSoma: number
  volumesFora: number[]
  divergeQtd: boolean // quantidade de volumes no cadastro difere das linhas da base
}

export const REGRAS_PADRAO: RegrasJadlog = {
  peso: 24,
  lado: 1700,
  soma: 2400,
  zero: true,
  termos: ['PIA', 'COLCHAO', 'COLCHOES', 'CADEIRA', 'COOKTOP', 'COOK TOP', 'CUBA', 'FORNO ELETRICO', 'SOFA'],
  excecoes: [],
}

export const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Termo inteiro, tolerando plural (S/ES) e separadores entre palavras ("COOK-TOP"). */
function regexTermo(t: string) {
  return new RegExp('(?:^|[^A-Z0-9])(' + escRe(t).replace(/\s+/g, '[\\s\\-/]*') + ')(?:S|ES)?(?=[^A-Z0-9]|$)')
}

const COL = { sku: 2, desc: 3, qtd: 7, peso: 9, a: 23, l: 24, p: 25 } // C, D, H, J, X, Y, Z

const num = (v: Celula | undefined) => (v === null || v === undefined || v === '' ? NaN : numero(v))

export function lerBase(abas: Aba[], arquivo: string): BaseJadlog {
  // Prefere a aba "CADASTRO"; aceita qualquer aba com "Código Modelo" na coluna C.
  const ordem = [...abas].sort((a, b) => Number(normalizar(b.nome) === 'CADASTRO') - Number(normalizar(a.nome) === 'CADASTRO'))
  let linhas: Celula[][] | null = null
  let cab = -1
  let nomeAba = ''
  for (const aba of ordem) {
    const i = aba.linhas.slice(0, 30).findIndex((l) => normalizar(l?.[COL.sku]).includes('CODIGO MODELO'))
    if (i >= 0) {
      linhas = aba.linhas
      cab = i
      nomeAba = aba.nome
      break
    }
  }
  if (!linhas) {
    throw new Error(
      'Não encontrei a aba de cadastro. A planilha precisa ter o cabeçalho “Código Modelo” na coluna C e as dimensões dos volumes nas colunas X, Y e Z.',
    )
  }
  const mapa = new Map<string, SkuJadlog>()
  for (const l of linhas.slice(cab + 1)) {
    const sku = String(l?.[COL.sku] ?? '').trim()
    if (!sku) continue
    let s = mapa.get(sku)
    if (!s) {
      s = { sku, desc: String(l[COL.desc] ?? '').trim(), peso: num(l[COL.peso]), qtd: num(l[COL.qtd]), vols: [] }
      mapa.set(sku, s)
    }
    s.vols.push([num(l[COL.a]), num(l[COL.l]), num(l[COL.p])])
  }
  if (!mapa.size) throw new Error(`A aba “${nomeAba}” não tem linhas com código modelo preenchido.`)
  return { arquivo, enviada_em: new Date().toISOString(), skus: [...mapa.values()] }
}

export function avaliar(base: BaseJadlog, r: RegrasJadlog): ResultadoSku[] {
  const termos = r.termos.map((t) => ({ t, re: regexTermo(t) }))
  return base.skus.map((s) => {
    const motivos = new Set<Motivo>()
    const volumesFora: number[] = []
    let maiorLado = 0
    let maiorSoma = 0
    let zerado = !(s.peso > 0)
    s.vols.forEach(([a, l, p], i) => {
      if (!(a > 0 && l > 0 && p > 0)) zerado = true
      const lado = Math.max(a || 0, l || 0, p || 0)
      const soma = (a || 0) + (l || 0) + (p || 0)
      maiorLado = Math.max(maiorLado, lado)
      maiorSoma = Math.max(maiorSoma, soma)
      let fora = false
      if (lado >= r.lado) {
        motivos.add('LADO')
        fora = true
      }
      if (soma > r.soma) {
        motivos.add('SOMA')
        fora = true
      }
      if (fora) volumesFora.push(i)
    })
    if (s.peso > r.peso) motivos.add('PESO')
    if (zerado && r.zero) motivos.add('DADOS')

    let desc = ' ' + normalizar(s.desc) + ' '
    for (const e of r.excecoes) desc = desc.split(e).join(' ')
    const achados = termos.filter((x) => x.re.test(desc)).map((x) => x.t)
    if (achados.length) motivos.add('TERMO')

    return {
      s,
      motivos,
      termos: achados,
      maiorLado,
      maiorSoma,
      volumesFora,
      divergeQtd: Number.isFinite(s.qtd) && s.qtd !== s.vols.length,
    }
  })
}

export function rotuloMotivo(m: Motivo, r: RegrasJadlog): string {
  const kg = r.peso.toLocaleString('pt-BR')
  const mm = (n: number) => n.toLocaleString('pt-BR')
  return {
    PESO: `Peso bruto > ${kg} kg`,
    LADO: `Lado ≥ ${mm(r.lado)} mm`,
    SOMA: `A+L+P > ${mm(r.soma)} mm`,
    TERMO: 'Tipo de produto restrito',
    DADOS: 'Peso/dimensão zerada',
  }[m]
}

export function textoMotivos(x: ResultadoSku, r: RegrasJadlog): string {
  return MOTIVOS.filter((m) => x.motivos.has(m))
    .map((m) => (m === 'TERMO' ? `Termo: ${x.termos.join(', ')}` : rotuloMotivo(m, r)))
    .join(' | ')
}
