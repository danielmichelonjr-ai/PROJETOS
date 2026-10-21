import { UFS } from './cep'
import type { Faixa, NovaProposta } from './types'

// Propostas fictícias para experimentar o sistema no modo demonstração.
const REGIAO: Record<string, number> = {
  SP: 1, RJ: 1.15, MG: 1.15, PR: 1.2, SC: 1.25, ES: 1.3, RS: 1.35, GO: 1.4, DF: 1.4, MS: 1.45, MT: 1.6,
  BA: 1.7, SE: 1.8, AL: 1.85, PE: 1.85, PB: 1.9, RN: 1.95, CE: 1.95, PI: 2.05, MA: 2.1, TO: 1.9,
  PA: 2.3, AP: 2.6, AM: 2.7, RO: 2.4, AC: 2.8, RR: 2.9,
}
const PESOS = [10, 30, 50, 100, 200]

function tabela(fator: number, vies: Partial<Record<string, number>>, extra: Partial<Faixa>): Faixa[] {
  const faixas: Faixa[] = []
  for (const uf of UFS) {
    const r = REGIAO[uf] * fator * (vies[uf] ?? 1)
    let anterior = 0
    for (const p of PESOS) {
      faixas.push({
        uf_destino: uf,
        cidade: '',
        cep_inicial: '',
        cep_final: '',
        peso_inicial: anterior,
        peso_final: p,
        valor_frete: Math.round((38 + p * 1.6) * r * 100) / 100,
        valor_kg_excedente: Math.round(1.7 * r * 100) / 100,
        frete_minimo: Math.round(45 * r * 100) / 100,
        ad_valorem_pct: 0.3,
        gris_pct: 0.2,
        pedagio: 4.5,
        taxa_fixa: 0,
        prazo_dias: Math.round(2 + REGIAO[uf] * 3),
        ...extra,
      })
      anterior = p
    }
  }
  return faixas
}

export function propostasExemplo(): NovaProposta[] {
  const base = { vigencia_inicio: '2026-11-01', vigencia_fim: '2027-10-31', arquivo_nome: 'exemplo', observacoes: 'Dados fictícios' }
  return [
    {
      ...base,
      transportadora: 'Transportadora Alfa',
      nome: 'Proposta 2027',
      faixas: tabela(1, { SP: 0.85, RJ: 0.9, MG: 0.9, PA: 1.25, AM: 1.3 }, {}),
    },
    {
      ...base,
      transportadora: 'Beta Logística',
      nome: 'Tabela Nacional',
      faixas: tabela(1.05, { BA: 0.8, PE: 0.8, CE: 0.82, PA: 0.85, AM: 0.85 }, { gris_pct: 0.15, taxa_fixa: 3.9 }),
    },
    {
      ...base,
      transportadora: 'Gama Cargas',
      nome: 'Sul e Sudeste',
      faixas: tabela(0.95, { PR: 0.85, SC: 0.82, RS: 0.8 }, { ad_valorem_pct: 0.4 }).filter((f) =>
        ['SP', 'RJ', 'MG', 'ES', 'PR', 'SC', 'RS'].includes(f.uf_destino),
      ),
    },
  ]
}
