// Modelo normalizado de uma faixa de frete. Toda proposta importada,
// independente do layout da transportadora, é convertida para este formato.
export interface Faixa {
  uf_destino: string
  cidade: string
  cep_inicial: string // 8 dígitos, vazio quando a proposta é só por UF
  cep_final: string
  peso_inicial: number // kg
  peso_final: number // kg
  valor_frete: number // R$ da faixa de peso
  valor_kg_excedente: number // R$/kg acima do peso_final da última faixa
  frete_minimo: number // R$
  ad_valorem_pct: number // % sobre o valor da NF
  gris_pct: number // % sobre o valor da NF
  pedagio: number // R$ por fração de 100 kg
  taxa_fixa: number // R$ por envio (TAS, despacho etc.)
  prazo_dias: number
}

export interface Proposta {
  id: string
  transportadora: string
  nome: string
  vigencia_inicio: string | null
  vigencia_fim: string | null
  arquivo_nome: string | null
  observacoes: string | null
  created_at: string
  total_faixas?: number
}

export interface NovaProposta {
  transportadora: string
  nome: string
  vigencia_inicio: string | null
  vigencia_fim: string | null
  arquivo_nome: string | null
  observacoes: string | null
  faixas: Faixa[]
}

export interface Envio {
  id: string
  descricao: string
  cep: string
  uf: string
  peso: number
  valor_nf: number
}

export interface Cotacao {
  proposta_id: string
  transportadora: string
  total: number
  prazo_dias: number
  detalhe: {
    frete_peso: number
    excedente: number
    ad_valorem: number
    gris: number
    pedagio: number
    taxa_fixa: number
    minimo_aplicado: boolean
  }
}

export interface Analise {
  id: string
  nome: string
  parametros: unknown
  resultado: unknown
  created_at: string
}
