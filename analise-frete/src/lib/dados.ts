import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
