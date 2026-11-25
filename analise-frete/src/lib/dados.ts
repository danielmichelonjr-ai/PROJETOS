import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BaseCidades } from './cidades'
import type { BasePedidos } from './pedidosBase'
import type { TabelaIntelipost } from './tabelaIntelipost'
import type { BaseCotacao } from './cotacao'
import type { BaseJadlog } from './jadlog'
import type { Analise, Faixa, NovaProposta, Proposta } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && chave ? createClient(url, chave) : null

/** Sem Supabase configurado o app roda em modo demonstração, salvando no navegador. */
export const modoDemo = !supabase

export interface Usuario {
  email: string
}

// ---------- Autenticação ----------

export async function usuarioAtual(): Promise<Usuario | null> {
  if (!supabase) return lerLocal<Usuario | null>('demo_usuario', null)
  const { data } = await supabase.auth.getSession()
  return data.session?.user ? { email: data.session.user.email ?? '' } : null
}

export function aoMudarSessao(cb: (u: Usuario | null, recuperandoSenha: boolean) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((evento, sessao) =>
    cb(sessao?.user ? { email: sessao.user.email ?? '' } : null, evento === 'PASSWORD_RECOVERY'),
  )
  return () => data.subscription.unsubscribe()
}

export async function definirSenha(senha: string) {
  if (!supabase) return
  const { error } = await supabase.auth.updateUser({ password: senha })
  if (error) throw new Error(error.message)
}

export async function entrar(email: string, senha: string): Promise<Usuario> {
  if (!supabase) {
    const u = { email: email || 'demo@multimoveis' }
    gravarLocal('demo_usuario', u)
    return u
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : error.message)
  return { email: data.user.email ?? email }
}

export async function recuperarSenha(email: string) {
  if (!supabase) return
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
  if (error) throw new Error(error.message)
}

export async function sair() {
  if (!supabase) return gravarLocal('demo_usuario', null)
  await supabase.auth.signOut()
}

// ---------- Propostas ----------

export async function listarPropostas(): Promise<Proposta[]> {
  if (!supabase) {
    const todas = lerLocal<(Proposta & { faixas: Faixa[] })[]>('demo_propostas', [])
    return todas.map(({ faixas, ...p }) => ({ ...p, total_faixas: faixas.length }))
  }
  const { data, error } = await supabase
    .from('propostas')
    .select('*, proposta_faixas(count)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((p: Proposta & { proposta_faixas: { count: number }[] }) => {
    const { proposta_faixas, ...resto } = p
    return { ...resto, total_faixas: proposta_faixas?.[0]?.count ?? 0 }
  })
}

export async function obterFaixas(propostaId: string): Promise<Faixa[]> {
  if (!supabase) {
    return lerLocal<(Proposta & { faixas: Faixa[] })[]>('demo_propostas', []).find((p) => p.id === propostaId)?.faixas ?? []
  }
  // O Supabase limita 1000 linhas por consulta; busca em páginas.
  const faixas: Faixa[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('proposta_faixas')
      .select(
        'uf_destino, cidade, cep_inicial, cep_final, peso_inicial, peso_final, valor_frete, valor_kg_excedente, frete_minimo, ad_valorem_pct, gris_pct, pedagio, taxa_fixa, prazo_dias',
      )
      .eq('proposta_id', propostaId)
      .order('id')
      .range(de, de + 999)
    if (error) throw new Error(error.message)
    for (const f of (data ?? []) as Record<string, unknown>[]) {
      const faixa = { ...f } as Record<string, unknown>
      for (const k of Object.keys(faixa)) if (!['uf_destino', 'cidade', 'cep_inicial', 'cep_final'].includes(k)) faixa[k] = Number(faixa[k])
      faixas.push(faixa as unknown as Faixa)
    }
    if (!data || data.length < 1000) break
  }
  return faixas
}

export async function salvarProposta(nova: NovaProposta): Promise<string> {
  const { faixas, ...cabecalho } = nova
  if (!supabase) {
    const todas = lerLocal<(Proposta & { faixas: Faixa[] })[]>('demo_propostas', [])
    const id = crypto.randomUUID()
    todas.unshift({ ...cabecalho, id, created_at: new Date().toISOString(), faixas })
    gravarLocal('demo_propostas', todas)
    return id
  }
  const { data, error } = await supabase.from('propostas').insert(cabecalho).select('id').single()
  if (error) throw new Error(error.message)
  const id = data.id as string
  for (let i = 0; i < faixas.length; i += 500) {
    const lote = faixas.slice(i, i + 500).map((f) => ({ ...f, proposta_id: id }))
    const { error: e } = await supabase.from('proposta_faixas').insert(lote)
    if (e) {
      await supabase.from('propostas').delete().eq('id', id)
      throw new Error(e.message)
    }
  }
  return id
}

export async function excluirProposta(id: string) {
  if (!supabase) {
    gravarLocal(
      'demo_propostas',
      lerLocal<Proposta[]>('demo_propostas', []).filter((p) => p.id !== id),
    )
    return
  }
  const { error } = await supabase.from('propostas').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------- Histórico de análises ----------

export async function listarAnalises(): Promise<Analise[]> {
  if (!supabase) return lerLocal<Analise[]>('demo_analises', [])
  const { data, error } = await supabase.from('analises').select('*').order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error(error.message)
  return data as Analise[]
}

export async function salvarAnalise(a: Pick<Analise, 'nome' | 'parametros' | 'resultado'>) {
  if (!supabase) {
    const todas = lerLocal<Analise[]>('demo_analises', [])
    todas.unshift({ ...a, id: crypto.randomUUID(), created_at: new Date().toISOString() })
    gravarLocal('demo_analises', todas.slice(0, 50))
    return
  }
  const { error } = await supabase.from('analises').insert(a)
  if (error) throw new Error(error.message)
}

export async function excluirAnalise(id: string) {
  if (!supabase) {
    gravarLocal(
      'demo_analises',
      lerLocal<Analise[]>('demo_analises', []).filter((a) => a.id !== id),
    )
    return
  }
  const { error } = await supabase.from('analises').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------- Base de SKUs da validação JADLOG ----------

/** Última base de cadastro enviada, compartilhada por toda a equipe. */
export async function ultimaBaseJadlog(): Promise<BaseJadlog | null> {
  if (!supabase) return lerLocal<BaseJadlog | null>('demo_jadlog_base', null)
  const { data: cab, error } = await supabase
    .from('jadlog_bases')
    .select('id, arquivo, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!cab) return null
  const { data: lotes, error: e } = await supabase.from('jadlog_base_lotes').select('skus').eq('base_id', cab.id).order('parte')
  if (e) throw new Error(e.message)
  // Cada SKU é gravado como [sku, desc, peso, qtd, vols]; JSON não guarda NaN, então vazio volta como null.
  const n = (v: number | null) => (v === null ? NaN : v)
  const skus = (lotes ?? []).flatMap((l) =>
    (l.skus as [string, string, number | null, number | null, (number | null)[][]][]).map(([sku, desc, peso, qtd, vols]) => ({
      sku,
      desc,
      peso: n(peso),
      qtd: n(qtd),
      vols: vols.map((v) => v.map(n) as [number, number, number]),
    })),
  )
  return { arquivo: cab.arquivo, enviada_em: cab.created_at, skus }
}

export async function salvarBaseJadlog(base: BaseJadlog) {
  if (!supabase) return gravarLocal('demo_jadlog_base', base)
  const { data, error } = await supabase
    .from('jadlog_bases')
    .insert({
      arquivo: base.arquivo,
      total_skus: base.skus.length,
      total_volumes: base.skus.reduce((t, s) => t + s.vols.length, 0),
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  // Grava em lotes para não passar do limite de tamanho de cada requisição.
  for (let i = 0, parte = 0; i < base.skus.length; i += 2000, parte++) {
    const skus = base.skus.slice(i, i + 2000).map((s) => [s.sku, s.desc, s.peso, s.qtd, s.vols])
    const { error: e } = await supabase.from('jadlog_base_lotes').insert({ base_id: data.id, parte, skus })
    if (e) {
      await supabase.from('jadlog_bases').delete().eq('id', data.id)
      throw new Error(e.message)
    }
  }
}

// ---------- Base de pedidos da Cotação x Faturamento ----------

export interface InfoBaseCotacao {
  arquivo: string
  enviada_em: string
  enviada_por: string | null
}

/** Última base de pedidos enviada, compartilhada por toda a equipe. */
export async function ultimaBaseCotacao(): Promise<{ base: BaseCotacao; info: InfoBaseCotacao } | null> {
  if (!supabase) return lerLocal<{ base: BaseCotacao; info: InfoBaseCotacao } | null>('demo_cotacao_base', null)
  const { data: cab, error } = await supabase
    .from('cotacao_bases')
    .select('id, arquivo, meta, dic, enviado_por, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!cab) return null
  const { data: lotes, error: e } = await supabase.from('cotacao_base_lotes').select('pedidos').eq('base_id', cab.id).order('parte')
  if (e) throw new Error(e.message)
  return {
    base: { meta: cab.meta, dic: cab.dic, pedidos: (lotes ?? []).flatMap((l) => l.pedidos) },
    info: { arquivo: cab.arquivo, enviada_em: cab.created_at, enviada_por: cab.enviado_por },
  }
}

/** Grava a base nova e apaga as anteriores (o relatório usa só a mais recente). */
export async function salvarBaseCotacao(base: BaseCotacao, email: string) {
  const { meta, dic, pedidos } = base
  if (!supabase) {
    gravarLocal('demo_cotacao_base', { base: { meta, dic, pedidos }, info: { arquivo: meta.fonte, enviada_em: new Date().toISOString(), enviada_por: email } })
    return
  }
  const { data, error } = await supabase
    .from('cotacao_bases')
    .insert({ arquivo: meta.fonte, total_pedidos: meta.pedidos, cancelados: meta.cancelados, meta, dic, enviado_por: email || null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  // Grava em lotes para não passar do limite de tamanho de cada requisição.
  for (let i = 0, parte = 0; i < pedidos.length; i += 5000, parte++) {
    const { error: e } = await supabase.from('cotacao_base_lotes').insert({ base_id: data.id, parte, pedidos: pedidos.slice(i, i + 5000) })
    if (e) {
      await supabase.from('cotacao_bases').delete().eq('id', data.id)
      throw new Error(e.message)
    }
  }
  await supabase.from('cotacao_bases').delete().neq('id', data.id)
}

// ---------- Base de cidades por CEP (nomes usados na tabela Intelipost) ----------

/** Última base de cidades enviada pela equipe; null se ninguém enviou (vale a base inicial do sistema). */
export async function ultimaBaseCidades(): Promise<BaseCidades | null> {
  if (!supabase) return lerLocal<BaseCidades | null>('demo_cidades_base', null)
  const { data, error } = await supabase.from('cidades_bases').select('arquivo, linhas, enviado_por, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { linhas: data.linhas, arquivo: data.arquivo, enviada_em: data.created_at, enviada_por: data.enviado_por } : null
}

/** Grava a base nova e apaga as anteriores. */
export async function salvarBaseCidades(base: BaseCidades) {
  if (!supabase) return gravarLocal('demo_cidades_base', base)
  const { data, error } = await supabase.from('cidades_bases').insert({ arquivo: base.arquivo, linhas: base.linhas, enviado_por: base.enviada_por }).select('id').single()
  if (error) throw new Error(error.message)
  await supabase.from('cidades_bases').delete().neq('id', data.id)
}

// ---------- Base de pedidos do estudo de competitividade ----------

export interface InfoBasePedidos {
  arquivo: string
  enviada_em: string
  enviada_por: string | null
}

/** Última base de pedidos enviada para o estudo de competitividade (compartilhada pela equipe). */
export async function ultimaBasePedidos(): Promise<{ base: BasePedidos; info: InfoBasePedidos } | null> {
  if (!supabase) return lerLocal<{ base: BasePedidos; info: InfoBasePedidos } | null>('demo_pedidos_base', null)
  const { data: cab, error } = await supabase.from('pedidos_bases').select('id, arquivo, meta, dic, enviado_por, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  if (!cab) return null
  const { data: lotes, error: e } = await supabase.from('pedidos_base_lotes').select('pedidos').eq('base_id', cab.id).order('parte')
  if (e) throw new Error(e.message)
  return {
    base: { meta: cab.meta, dic: cab.dic, pedidos: (lotes ?? []).flatMap((l) => l.pedidos) },
    info: { arquivo: cab.arquivo, enviada_em: cab.created_at, enviada_por: cab.enviado_por },
  }
}

/** Grava a base nova em lotes e apaga as anteriores. */
export async function salvarBasePedidos(base: BasePedidos, email: string, progresso?: (pct: number) => void) {
  const { meta, dic, pedidos } = base
  if (!supabase) {
    // No modo demonstração a base inteira não cabe no navegador: guarda só nesta sessão.
    return
  }
  const { data, error } = await supabase.from('pedidos_bases').insert({ arquivo: meta.fonte, total_pedidos: meta.pedidos, meta, dic, enviado_por: email || null }).select('id').single()
  if (error) throw new Error(error.message)
  const LOTE = 5000
  for (let i = 0, parte = 0; i < pedidos.length; i += LOTE, parte++) {
    const { error: e } = await supabase.from('pedidos_base_lotes').insert({ base_id: data.id, parte, pedidos: pedidos.slice(i, i + LOTE) })
    if (e) {
      await supabase.from('pedidos_bases').delete().eq('id', data.id)
      throw new Error(e.message)
    }
    progresso?.(Math.min(1, (i + LOTE) / pedidos.length))
  }
  await supabase.from('pedidos_bases').delete().neq('id', data.id)
}

/** Última tabela Intelipost usada no estudo de competitividade (a mesma para toda a equipe). */
export async function ultimaTabelaCompetitividade(): Promise<{ tabela: TabelaIntelipost; enviada_em: string; enviada_por: string | null } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('competitividade_tabelas').select('tabela, enviado_por, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { tabela: data.tabela, enviada_em: data.created_at, enviada_por: data.enviado_por } : null
}

export async function salvarTabelaCompetitividade(tabela: TabelaIntelipost, email: string) {
  if (!supabase) return
  const { data, error } = await supabase.from('competitividade_tabelas').insert({ nome: tabela.nome, arquivo: tabela.arquivo, tabela, enviado_por: email || null }).select('id').single()
  if (error) throw new Error(error.message)
  await supabase.from('competitividade_tabelas').delete().neq('id', data.id)
}

// ---------- Armazenamento local (modo demonstração) ----------

function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave)
    return v ? (JSON.parse(v) as T) : padrao
  } catch {
    return padrao
  }
}

function gravarLocal(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    // Sem armazenamento disponível: os dados ficam só na sessão.
  }
}
