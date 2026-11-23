import { normalizarCep, ufDoCep } from './cep'
import type { Cotacao, Envio, Faixa, Proposta } from './types'

const arred = (n: number) => Math.round(n * 100) / 100

/** Faixas que atendem o destino: por intervalo de CEP quando houver, senão por UF. */
function faixasDoDestino(faixas: Faixa[], cep: string, uf: string): Faixa[] {
  const cepNum = parseInt(normalizarCep(cep), 10)
  const ufDestino = uf || ufDoCep(cep)
  const porCep = cepNum
    ? faixas.filter((f) => {
        if (!f.cep_inicial || !f.cep_final) return false
        return cepNum >= parseInt(f.cep_inicial, 10) && cepNum <= parseInt(f.cep_final, 10)
      })
    : []
  if (porCep.length) return porCep
  return faixas.filter((f) => !f.cep_inicial && f.uf_destino === ufDestino)
}

/**
 * Calcula o frete de um envio para uma proposta. Retorna null quando a
 * proposta não atende o destino.
 *
 * total = max(frete_minimo, frete_peso + excedente + ad valorem + GRIS + pedágio + taxa fixa)
 */
export function cotar(proposta: Proposta, faixas: Faixa[], envio: Envio): Cotacao | null {
  const destino = faixasDoDestino(faixas, envio.cep, envio.uf)
  if (!destino.length) return null

  const ordenadas = [...destino].sort((a, b) => a.peso_final - b.peso_final)
  let faixa = ordenadas.find((f) => envio.peso >= f.peso_inicial && envio.peso <= f.peso_final)
  let excedente = 0
  if (!faixa) {
    const ultima = ordenadas[ordenadas.length - 1]
    if (envio.peso < ordenadas[0].peso_inicial) faixa = ordenadas[0]
    else {
      faixa = ultima
      excedente = (envio.peso - ultima.peso_final) * ultima.valor_kg_excedente
    }
  }

  const adValorem = (envio.valor_nf * faixa.ad_valorem_pct) / 100
  const gris = (envio.valor_nf * faixa.gris_pct) / 100
  const pedagio = faixa.pedagio * Math.ceil(Math.max(envio.peso, 0.001) / 100)
  const soma = faixa.valor_frete + excedente + adValorem + gris + pedagio + faixa.taxa_fixa
  const minimoAplicado = faixa.frete_minimo > soma

  return {
    proposta_id: proposta.id,
    transportadora: proposta.transportadora,
    total: arred(Math.max(soma, faixa.frete_minimo)),
    prazo_dias: faixa.prazo_dias,
    detalhe: {
      frete_peso: arred(faixa.valor_frete),
      excedente: arred(excedente),
      ad_valorem: arred(adValorem),
      gris: arred(gris),
      pedagio: arred(pedagio),
      taxa_fixa: arred(faixa.taxa_fixa),
      minimo_aplicado: minimoAplicado,
    },
  }
}

export interface LinhaResultado {
  envio: Envio
  cotacoes: Cotacao[] // ordenadas da mais barata para a mais cara
}

export interface RankingTransportadora {
  proposta_id: string
  transportadora: string
  proposta: string
  atendidos: number
  vitorias: number
  custo_total: number
  custo_medio: number
  diferenca_media_pct: number // quanto, em média, fica acima da melhor cotação de cada envio
  prazo_medio: number
}

export interface ResultadoAnalise {
  linhas: LinhaResultado[]
  ranking: RankingTransportadora[]
  melhor_combinacao_total: number // custo se cada envio fosse com a mais barata
}

export function analisar(
  propostas: Proposta[],
  faixasPorProposta: Record<string, Faixa[]>,
  envios: Envio[],
): ResultadoAnalise {
  const linhas: LinhaResultado[] = envios.map((envio) => {
    const cotacoes = propostas
      .map((p) => cotar(p, faixasPorProposta[p.id] ?? [], envio))
      .filter((c): c is Cotacao => c !== null)
      .sort((a, b) => a.total - b.total)
    return { envio, cotacoes }
  })

  const ranking: RankingTransportadora[] = propostas.map((p) => {
    let atendidos = 0
    let vitorias = 0
    let custo = 0
    let difSoma = 0
    let prazoSoma = 0
    for (const l of linhas) {
      const c = l.cotacoes.find((x) => x.proposta_id === p.id)
      if (!c) continue
      atendidos++
      custo += c.total
      prazoSoma += c.prazo_dias
      const melhor = l.cotacoes[0].total
      if (c.total === melhor) vitorias++
      if (melhor > 0) difSoma += ((c.total - melhor) / melhor) * 100
    }
    return {
      proposta_id: p.id,
      transportadora: p.transportadora,
      proposta: p.nome,
      atendidos,
      vitorias,
      custo_total: arred(custo),
      custo_medio: atendidos ? arred(custo / atendidos) : 0,
      diferenca_media_pct: atendidos ? arred(difSoma / atendidos) : 0,
      prazo_medio: atendidos ? Math.round((prazoSoma / atendidos) * 10) / 10 : 0,
    }
  })
  ranking.sort((a, b) => b.vitorias - a.vitorias || a.diferenca_media_pct - b.diferenca_media_pct)

  const melhor = linhas.reduce((s, l) => s + (l.cotacoes[0]?.total ?? 0), 0)
  return { linhas, ranking, melhor_combinacao_total: arred(melhor) }
}
