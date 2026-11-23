import { formatarCep } from './cep'
import { baixarXlsx, type Celula } from './planilha'
import type { Faixa, Proposta } from './types'

// Layout de saída da planilha de frete Intelipost.
// PROVISÓRIO: ajuste cabeçalhos e ordem quando o modelo oficial usado pela
// Multimóveis for enviado. Cada coluna é só um cabeçalho + como obter o valor.
export const COLUNAS_INTELIPOST: { cabecalho: string; valor: (f: Faixa) => Celula }[] = [
  { cabecalho: 'Região', valor: (f) => f.cidade || f.uf_destino },
  { cabecalho: 'UF', valor: (f) => f.uf_destino },
  { cabecalho: 'CEP Inicial', valor: (f) => formatarCep(f.cep_inicial) },
  { cabecalho: 'CEP Final', valor: (f) => formatarCep(f.cep_final) },
  { cabecalho: 'Peso Inicial (kg)', valor: (f) => f.peso_inicial },
  { cabecalho: 'Peso Final (kg)', valor: (f) => f.peso_final },
  { cabecalho: 'Prazo (dias úteis)', valor: (f) => f.prazo_dias },
  { cabecalho: 'Frete Peso (R$)', valor: (f) => f.valor_frete },
  { cabecalho: 'Kg Adicional (R$)', valor: (f) => f.valor_kg_excedente },
  { cabecalho: 'Frete Mínimo (R$)', valor: (f) => f.frete_minimo },
  { cabecalho: 'Ad Valorem (%)', valor: (f) => f.ad_valorem_pct },
  { cabecalho: 'GRIS (%)', valor: (f) => f.gris_pct },
  { cabecalho: 'Pedágio (R$ / 100 kg)', valor: (f) => f.pedagio },
  { cabecalho: 'Taxa Fixa (R$)', valor: (f) => f.taxa_fixa },
]

export function linhasIntelipost(faixas: Faixa[]): Celula[][] {
  return faixas.map((f) => COLUNAS_INTELIPOST.map((c) => c.valor(f)))
}

export async function exportarIntelipost(proposta: Pick<Proposta, 'transportadora' | 'nome'>, faixas: Faixa[]) {
  const nome = `Intelipost - ${proposta.transportadora} - ${proposta.nome}`.replace(/[\\/:*?"<>|]/g, '-')
  await baixarXlsx(`${nome}.xlsx`, [
    { nome: 'Tabela de Frete', cabecalho: COLUNAS_INTELIPOST.map((c) => c.cabecalho), linhas: linhasIntelipost(faixas) },
  ])
}
