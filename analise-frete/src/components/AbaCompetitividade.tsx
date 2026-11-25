import { useEffect, useMemo, useState } from 'react'
import { FAIXAS_PESO, ROTULO_CLASSE, classe, dif, estudar, rotuloFaixa, topCidadesPorUf, type Estudo, type OpcoesEstudo, type PorCidade, type Soma } from '../lib/competitividade'
import { modoDemo, salvarBasePedidos, ultimaBasePedidos, usuarioAtual, type InfoBasePedidos } from '../lib/dados'
import { data, dataHora, moeda, num } from '../lib/formato'
import { P, type BasePedidos } from '../lib/pedidosBase'
import { baixarXlsx, lerArquivo, type Celula } from '../lib/planilha'
import { lerTabelaIntelipost, type TabelaIntelipost } from '../lib/tabelaIntelipost'

// Estudo de competitividade: os pedidos reais do período, da mesma origem e nas praças da tabela,
// recotados pela tabela Intelipost da transportadora em análise e comparados com o custo atual.

/** Lê a base de pedidos num Web Worker para não travar a página. */
function lerPedidosEmSegundoPlano(arquivo: File): Promise<BasePedidos> {
  return arquivo.arrayBuffer().then(
    (buffer) =>
      new Promise((ok, falha) => {
        const w = new Worker(new URL('../lib/pedidosBase.worker.ts', import.meta.url), { type: 'module' })
        w.onmessage = (e: MessageEvent<{ base?: BasePedidos; erro?: string }>) => {
          w.terminate()
          if (e.data.base) ok(e.data.base)
          else falha(new Error(e.data.erro))
        }
        w.onerror = (e) => {
          w.terminate()
          falha(new Error(e.message || 'Não consegui ler o arquivo.'))
        }
        w.postMessage({ buffer, nome: arquivo.name }, [buffer])
      }),
  )
}

/** UF de onde sai cada origem (para a alíquota de ICMS). */
const UF_ORIGEM: Record<string, string> = { 'FILIAL SP': 'SP', 'FILIAL RJ': 'RJ', 'FILIAL MG': 'MG', 'FILIAL PE': 'PE' }
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO']

const media = (v: number, n: number) => (n ? v / n : 0)
const sinal = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const pctDe = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—')

function Dif({ s }: { s: Pick<Soma, 'atual' | 'sim'> }) {
  const d = dif(s)
  return <span style={{ color: d < 0 ? 'var(--verde)' : d > 0 ? 'var(--vermelho)' : undefined, fontWeight: 600 }}>{sinal(d)}</span>
}

/** Barra divergente: para a esquerda (verde) quando a tabela é mais barata, para a direita (vermelho) quando é mais cara. */
function Barra({ d, escala = 0.4 }: { d: number; escala?: number }) {
  const w = Math.min(50, (Math.abs(d) / escala) * 50)
  return (
    <div style={{ position: 'relative', width: 140, height: 10, background: 'var(--superficie-2)', borderRadius: 4 }} title={sinal(d)}>
      <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--borda)' }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: `${w}%`,
          left: d < 0 ? `${50 - w}%` : '50%',
          background: d < 0 ? 'var(--verde)' : 'var(--vermelho)',
          borderRadius: d < 0 ? '4px 0 0 4px' : '0 4px 4px 0',
        }}
      />
    </div>
  )
}

function Classe({ s }: { s: Pick<Soma, 'atual' | 'sim'> }) {
  const c = classe(dif(s))
  return <span className={`chip ${c === 'muito' || c === 'boa' ? 'ok' : c === 'perto' ? 'alerta' : ''}`}>{ROTULO_CLASSE[c]}</span>
}

/** Cor de fundo da célula do mapa de calor (diferença %). */
const calor = (d: number, n: number) => {
  if (!n) return undefined
  const a = Math.min(0.55, Math.abs(d) * 1.6 + 0.08)
  return d < 0 ? `rgba(92, 201, 138, ${a})` : `rgba(239, 107, 107, ${a})`
}

/** Transportadora atual mais barata na cidade (com pedidos suficientes para a média valer). */
function melhorAtual(c: PorCidade) {
  const minimo = Math.max(3, Math.round(c.n * 0.05))
  const cand = c.transp.filter((t) => t.n >= minimo)
  return (cand.length ? cand : c.transp).reduce((m, t) => (media(t.atual, t.n) < media(m.atual, m.n) ? t : m))
}

// O que foi carregado continua disponível ao trocar de aba e voltar: a base fica na memória da página
// e a última tabela também fica guardada neste navegador.
const CHAVE_TABELA = 'competitividade-ultima-tabela'
const memoria: { base: BasePedidos | null; info: InfoBasePedidos | null; tabela: TabelaIntelipost | null; origem: string; de: string; ate: string } = {
  base: null,
  info: null,
  tabela: lerTabelaGuardada(),
  origem: '',
  de: '',
  ate: '',
}
function lerTabelaGuardada(): TabelaIntelipost | null {
  try {
    const t = JSON.parse(localStorage.getItem(CHAVE_TABELA) ?? 'null')
    return t && Array.isArray(t.linhas) && Array.isArray(t.pesos) ? t : null
  } catch {
    return null
  }
}
function guardarTabela(t: TabelaIntelipost) {
  try {
    localStorage.setItem(CHAVE_TABELA, JSON.stringify(t))
  } catch {
    // Tabela grande demais para o navegador: vale só enquanto a página estiver aberta.
  }
}

export default function AbaCompetitividade({ irParaImportacao }: { irParaImportacao: () => void }) {
  const [base, setBase] = useState<BasePedidos | null>(memoria.base)
  const [info, setInfo] = useState<InfoBasePedidos | null>(memoria.info)
  const [carregando, setCarregando] = useState(!memoria.base)
  const [msgBase, setMsgBase] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [tabela, setTabela] = useState<TabelaIntelipost | null>(memoria.tabela)
  const [msgTabela, setMsgTabela] = useState('')
  const [origem, setOrigem] = useState(memoria.origem)
  const [ufOrigem, setUfOrigem] = useState('SP')
  const [icmsModo, setIcmsModo] = useState<'regra' | 'fixo'>('regra')
  const [icmsFixo, setIcmsFixo] = useState('12')
  const [de, setDe] = useState(memoria.de)
  const [ate, setAte] = useState(memoria.ate)
  const [ufTop, setUfTop] = useState('')
  const [minPedidos, setMinPedidos] = useState('5')

  useEffect(() => {
    Object.assign(memoria, { base, info, tabela, origem, de, ate })
  }, [base, info, tabela, origem, de, ate])

  useEffect(() => {
    if (memoria.base) return
    ultimaBasePedidos()
      .then((r) => {
        if (r) setBase(r.base), setInfo(r.info)
      })
      .catch((e) => setMsgBase(/pedidos_bases/.test(e.message) ? 'Falta criar as tabelas da base de pedidos no Supabase (rode o competitividade.sql).' : e.message))
      .finally(() => setCarregando(false))
  }, [])

  // Período e origem padrão quando a base ou a tabela mudam.
  useEffect(() => {
    // Mantém o período escolhido ao voltar para a aba; base nova (ou período fora dela) volta para o período inteiro.
    if (!base || (de && ate && de >= base.meta.primeiro && ate <= base.meta.ultimo)) return
    setDe(base.meta.primeiro)
    setAte(base.meta.ultimo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])
  useEffect(() => {
    if (!base || !tabela) return
    // A taxa de transferência da Filial SP (OUTRA TAXA FIXO) indica coleta na Filial SP.
    const filialSp = tabela.linhas.some((l) => l.v['OUTRA TAXA FIXO'])
    const sugerida = filialSp ? 'FILIAL SP' : 'MATRIZ'
    setOrigem((o) => o || (base.dic.origens.includes(sugerida) ? sugerida : base.dic.origens[0]))
  }, [base, tabela])
  useEffect(() => {
    if (UF_ORIGEM[origem]) setUfOrigem(UF_ORIGEM[origem])
  }, [origem])

  const porOrigem = useMemo(() => {
    const m = new Map<number, number>()
    if (base) for (const p of base.pedidos) m.set(p[P.origem], (m.get(p[P.origem]) ?? 0) + 1)
    return m
  }, [base])

  const opcoes: OpcoesEstudo = { origem, ufOrigem, icmsFixo: icmsModo === 'fixo' ? Number(icmsFixo.replace(',', '.')) || 0 : null, de, ate }
  const estudo = useMemo(
    () => (base && tabela && origem ? estudar(base, tabela, opcoes) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, tabela, origem, ufOrigem, icmsModo, icmsFixo, de, ate],
  )
  const tops = useMemo(() => (estudo ? topCidadesPorUf(estudo, 20) : new Map<string, PorCidade[]>()), [estudo])
  const ufsTop = [...tops.keys()]
  const ufSel = ufsTop.includes(ufTop) ? ufTop : ufsTop[0] ?? ''

  async function enviarBase(f: File | undefined) {
    if (!f) return
    setOcupado(true)
    setMsgBase(`Lendo ${f.name} em segundo plano (bases de 90 dias levam alguns segundos)…`)
    try {
      const b = await lerPedidosEmSegundoPlano(f)
      const email = (await usuarioAtual())?.email ?? ''
      setMsgBase(`${num(b.meta.pedidos)} pedidos lidos. Gravando para a equipe…`)
      await salvarBasePedidos(b, email, (p) => setMsgBase(`${num(b.meta.pedidos)} pedidos lidos. Gravando para a equipe… ${Math.round(p * 100)}%`))
      setBase(b)
      setDe(b.meta.primeiro)
      setAte(b.meta.ultimo)
      setInfo({ arquivo: f.name, enviada_em: new Date().toISOString(), enviada_por: email || null })
      setMsgBase([`Base atualizada: ${num(b.meta.pedidos)} pedidos de ${data(b.meta.primeiro)} a ${data(b.meta.ultimo)}.`, ...(b.avisos ?? [])].join(' '))
    } catch (e) {
      const m = (e as Error).message
      setMsgBase(/pedidos_base/.test(m) ? 'Falta criar as tabelas da base de pedidos no Supabase (rode o competitividade.sql).' : m)
    } finally {
      setOcupado(false)
    }
  }

  async function enviarTabela(f: File | undefined) {
    if (!f) return
    setMsgTabela(`Lendo ${f.name}…`)
    try {
      const abas = await lerArquivo(f)
      let erro = ''
      for (const a of abas) {
        try {
          const t = lerTabelaIntelipost(a.linhas, f.name)
          setTabela(t)
          guardarTabela(t)
          setOrigem('')
          setMsgTabela('')
          return
        } catch (e) {
          erro = (e as Error).message
        }
      }
      throw new Error(erro || 'Arquivo sem abas.')
    } catch (e) {
      setMsgTabela((e as Error).message)
    }
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Competitividade de frete</h2>
        <p className="suave" style={{ marginTop: -6 }}>
          Recota os pedidos reais do período pela tabela da transportadora em análise, só nas praças que ela atende e só com pedidos da mesma origem
          de coleta, e compara com o custo que tivemos com as transportadoras atuais.
        </p>
        <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <label className="soltar" style={{ cursor: ocupado ? 'wait' : 'pointer' }}>
            <input type="file" accept=".xlsx" hidden disabled={ocupado} onChange={(e) => (enviarBase(e.target.files?.[0]), (e.target.value = ''))} />
            <strong>1. Base de pedidos (60 a 90 dias)</strong>
            <span className="suave">
              {carregando
                ? 'Carregando a base salva…'
                : base
                  ? `${num(base.meta.pedidos)} pedidos · ${data(base.meta.primeiro)} a ${data(base.meta.ultimo)} · ${info?.arquivo ?? base.meta.fonte}${info?.enviada_em ? ` · enviada em ${dataHora(info.enviada_em)}${info.enviada_por ? ` por ${info.enviada_por}` : ''}` : ''}`
                  : 'Exportação de pedidos do HUB (aba Export). Clique para enviar.'}
            </span>
            {base && <span className="suave">Clique para enviar uma base mais nova (substitui a atual para toda a equipe).</span>}
          </label>
          <label className="soltar">
            <input type="file" accept=".xlsx" hidden onChange={(e) => (enviarTabela(e.target.files?.[0]), (e.target.value = ''))} />
            <strong>2. Tabela da transportadora em análise</strong>
            <span className="suave">
              {tabela
                ? `${tabela.nome} · ${num(tabela.linhas.length)} faixas de CEP · ${tabela.ufs.join(', ')} · pesos até ${tabela.pesos[tabela.pesos.length - 1] ?? '—'} kg · ICMS ${tabela.icmsIncluso === false ? 'não incluso' : tabela.icmsIncluso ? 'incluso' : 'não informado'}`
                : 'Planilha no modelo Intelipost (a que sai em Importar propostas). Clique para enviar.'}
            </span>
          </label>
        </div>
        {msgBase && <p className="suave" style={{ marginTop: 10 }}>{msgBase}</p>}
        {msgTabela && <p className="erro" style={{ marginTop: 10 }}>{msgTabela}</p>}
        {modoDemo && <p className="suave">Modo demonstração: a base de pedidos fica só nesta sessão.</p>}
        {!tabela && (
          <p className="suave" style={{ marginTop: 10 }}>
            Ainda não tem a tabela no modelo Intelipost?{' '}
            <button className="btn pequeno" onClick={irParaImportacao}>
              Importar proposta
            </button>
          </p>
        )}

        {base && tabela && (
          <div className="linha" style={{ marginTop: 16 }}>
            <div className="campo">
              <label>Origem de coleta comparada</label>
              <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                {base.dic.origens.map((o, i) => (
                  <option key={o} value={o}>
                    {o} ({num(porOrigem.get(i) ?? 0)} pedidos)
                  </option>
                ))}
              </select>
            </div>
            <div className="campo" style={{ maxWidth: 170 }}>
              <label>De</label>
              <input type="date" value={de} min={base.meta.primeiro} max={base.meta.ultimo} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="campo" style={{ maxWidth: 170 }}>
              <label>Até</label>
              <input type="date" value={ate} min={base.meta.primeiro} max={base.meta.ultimo} onChange={(e) => setAte(e.target.value)} />
            </div>
            {tabela.icmsIncluso === false && (
              <>
                <div className="campo">
                  <label>ICMS a somar (tabela sem ICMS)</label>
                  <select value={icmsModo} onChange={(e) => setIcmsModo(e.target.value as 'regra' | 'fixo')}>
                    <option value="regra">Regra por UF: 12% no estado, 7% ou 12% entre estados</option>
                    <option value="fixo">Alíquota única</option>
                  </select>
                </div>
                {icmsModo === 'regra' ? (
                  <div className="campo" style={{ maxWidth: 140 }}>
                    <label>UF da origem</label>
                    <select value={ufOrigem} onChange={(e) => setUfOrigem(e.target.value)}>
                      {UFS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="campo" style={{ maxWidth: 140 }}>
                    <label>Alíquota (%)</label>
                    <input value={icmsFixo} inputMode="decimal" onChange={(e) => setIcmsFixo(e.target.value)} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {tabela && tabela.ignoradas.length > 0 && (
          <div className="aviso">A tabela usa colunas de variação que o simulador ainda não aplica: {tabela.ignoradas.join('; ')}.</div>
        )}
      </div>

      {estudo && estudo.total.n === 0 && (
        <div className="card">
          <p>
            Nenhum pedido da origem <b>{origem}</b> no período caiu nas faixas de CEP da tabela. Confira a origem de coleta ou o período.
          </p>
        </div>
      )}
      {estudo && estudo.total.n > 0 && <Resultado e={estudo} tops={tops} ufsTop={ufsTop} ufSel={ufSel} setUfTop={setUfTop} minPedidos={Number(minPedidos) || 1} setMinPedidos={setMinPedidos} />}
    </>
  )
}

function Resultado({
  e,
  tops,
  ufsTop,
  ufSel,
  setUfTop,
  minPedidos,
  setMinPedidos,
}: {
  e: Estudo
  tops: Map<string, PorCidade[]>
  ufsTop: string[]
  ufSel: string
  setUfTop: (u: string) => void
  minPedidos: number
  setMinPedidos: (s: string) => void
}) {
  const t = e.total
  const d = dif(t)
  /** Nome curto da tabela para cabeçalhos ("RAJLOG - CEPS ECOMMERCE" vira "RAJLOG"). */
  const curto = e.tabela.split(' - ')[0].trim() || e.tabela
  const economia = t.atual - t.sim
  const elegiveis = e.cidades.filter((c) => c.n >= minPedidos)
  const boas = [...elegiveis].filter((c) => dif(c) < 0).sort((a, b) => dif(a) - dif(b)).slice(0, 10)
  const ruins = [...elegiveis].filter((c) => dif(c) >= 0).sort((a, b) => dif(b) - dif(a)).slice(0, 10)
  const top = tops.get(ufSel) ?? []
  const transp = e.transportadoras
  const principais = transp.slice(0, 6)

  async function exportar() {
    const linhaSoma = (s: Soma): Celula[] => [s.n, r2(s.atual), r2(s.sim), r2(s.atual - s.sim), pctNum(dif(s)), r2(media(s.atual, s.n)), r2(media(s.sim, s.n)), pctNum(s.ganha / (s.n || 1)), pctNum(s.atual / (s.valor || 1)), pctNum(s.sim / (s.valor || 1))]
    const cabSoma = ['Pedidos', 'Custo atual (R$)', `Custo ${e.tabela} (R$)`, 'Economia (R$)', 'Diferença (%)', 'Custo médio atual', `Custo médio ${e.tabela}`, '% pedidos mais baratos', 'Frete/valor atual (%)', `Frete/valor ${e.tabela} (%)`]
    const melhor = (c: PorCidade) => melhorAtual(c)
    await baixarXlsx(`Competitividade - ${e.tabela} - ${e.opcoes.origem}.xlsx`, [
      {
        nome: 'Resumo',
        cabecalho: ['Indicador', 'Valor'],
        linhas: [
          ['Tabela em análise', e.tabela],
          ['Origem de coleta', e.opcoes.origem],
          ['Período', `${data(e.opcoes.de)} a ${data(e.opcoes.ate)}`],
          ['ICMS', e.opcoes.icmsFixo === null ? `Regra por UF (origem ${e.opcoes.ufOrigem})` : `${e.opcoes.icmsFixo}%`],
          ['Pedidos comparados', t.n],
          ['Custo atual (R$)', r2(t.atual)],
          [`Custo ${e.tabela} (R$)`, r2(t.sim)],
          ['Economia (R$)', r2(economia)],
          ['Diferença (%)', pctNum(d)],
          ['Pedidos em que a tabela é mais barata', t.ganha],
          ['Pedidos da origem fora da área da tabela', e.foraDaArea],
          ['Pedidos na área que saíram de outras origens (não comparados)', e.outrasOrigens],
        ],
      },
      { nome: 'Por UF', cabecalho: ['UF', ...cabSoma], linhas: e.porUf.map((u) => [u.uf, ...linhaSoma(u)]) },
      {
        nome: 'Cidades',
        cabecalho: ['Cidade', 'UF', ...cabSoma, 'Classificação', 'Transportadora atual mais barata', 'Custo médio dela'],
        linhas: e.cidades.map((c) => [c.cidade, c.uf, ...linhaSoma(c), ROTULO_CLASSE[classe(dif(c))], melhor(c).nome, r2(media(melhor(c).atual, melhor(c).n))]),
      },
      {
        nome: 'Top cidades x peso',
        cabecalho: ['UF', 'Cidade', 'Faixa de peso', ...cabSoma],
        linhas: [...tops.values()].flat().flatMap((c) => c.faixas.map((f, i) => [c.uf, c.cidade, rotuloFaixa(i), ...linhaSoma(f)] as Celula[]).filter((l) => (l[3] as number) > 0)),
      },
      { nome: 'Transportadoras', cabecalho: ['Transportadora atual', ...cabSoma], linhas: transp.map((x) => [x.nome, ...linhaSoma(x)]) },
      {
        nome: 'Transp x peso',
        cabecalho: ['Transportadora atual', 'Faixa de peso', ...cabSoma],
        linhas: transp.flatMap((x) => x.faixas.map((f, i) => [x.nome, rotuloFaixa(i), ...linhaSoma(f)] as Celula[]).filter((l) => (l[2] as number) > 0)),
      },
      { nome: 'Faixas de CEP', cabecalho: ['CEP inicial', 'CEP final', 'Cidade na tabela', ...cabSoma], linhas: e.faixasCep.map((f) => [cepTxt(f.cepi), cepTxt(f.cepf), f.cidade, ...linhaSoma(f)]) },
      {
        nome: 'Pedidos',
        cabecalho: ['Data', 'Cidade', 'UF', 'CEP', 'Transportadora atual', 'Peso (kg)', 'Valor produtos', 'Frete cobrado', 'Custo atual', `Custo ${e.tabela}`, 'Diferença (R$)', 'Diferença (%)'],
        linhas: e.pedidos.map((p) => [p.dia, p.cidade, p.uf, cepTxt(p.cep), p.transp, p.peso, p.valor, p.cobrado, p.atual, p.sim, r2(p.sim - p.atual), pctNum(dif(p))]),
      },
    ])
  }

  return (
    <>
      <div className="card">
        <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>
            {e.tabela} × transportadoras atuais · {e.opcoes.origem}
          </h3>
          <button className="btn primario" onClick={exportar}>
            Baixar estudo em Excel
          </button>
        </div>
        <p style={{ fontSize: '1.05rem', margin: '14px 0' }}>
          Nos <b>{num(t.n)}</b> pedidos de {data(e.opcoes.de)} a {data(e.opcoes.ate)} que saíram da <b>{e.opcoes.origem}</b> para as praças da tabela, o custo com a{' '}
          <b>{e.tabela}</b> seria de <b>{moeda(t.sim)}</b> contra <b>{moeda(t.atual)}</b> pagos hoje:{' '}
          <b style={{ color: d < 0 ? 'var(--verde)' : 'var(--vermelho)' }}>
            {sinal(d)} ({d < 0 ? 'economia de ' : 'aumento de '}
            {moeda(Math.abs(economia))})
          </b>
          . Ela sairia mais barata em <b>{pctDe(t.ganha, t.n)}</b> dos pedidos.
        </p>
        <div className="kpis">
          <div className="kpi">
            <div className="rotulo">Pedidos comparados</div>
            <div className="valor">{num(t.n)}</div>
            <div className="suave">{num(e.cidades.length)} cidades</div>
          </div>
          <div className="kpi">
            <div className="rotulo">Custo médio atual</div>
            <div className="valor">{moeda(media(t.atual, t.n))}</div>
            <div className="suave">{pctDe(t.atual, t.valor)} do valor dos produtos</div>
          </div>
          <div className="kpi">
            <div className="rotulo">Custo médio {curto}</div>
            <div className="valor destaque">{moeda(media(t.sim, t.n))}</div>
            <div className="suave">{pctDe(t.sim, t.valor)} do valor dos produtos</div>
          </div>
          <div className="kpi">
            <div className="rotulo">Diferença no período</div>
            <div className="valor" style={{ color: d < 0 ? 'var(--verde)' : 'var(--vermelho)' }}>{sinal(d)}</div>
            <div className="suave">{moeda(Math.abs(economia))} {d < 0 ? 'a menos' : 'a mais'}</div>
          </div>
          <div className="kpi">
            <div className="rotulo">Pedidos mais baratos</div>
            <div className="valor">{pctDe(t.ganha, t.n)}</div>
            <div className="suave">{num(t.ganha)} de {num(t.n)}</div>
          </div>
        </div>
        <p className="suave" style={{ margin: 0 }}>
          Fora da comparação: {num(e.foraDaArea)} pedidos da {e.opcoes.origem} para CEPs que a tabela não atende, e {num(e.outrasOrigens)} pedidos para a área da
          tabela que saíram de outras origens. O custo atual é a cotação do transportador registrada no pedido; o da tabela usa o peso dos itens (sem cubagem).
        </p>
      </div>

      {e.porUf.length > 1 && (
        <div className="card">
          <h3>Por estado</h3>
          <TabelaSomas linhas={e.porUf.map((u) => ({ chave: u.uf, rotulo: u.uf, s: u }))} total={t} nomeTabela={curto} />
        </div>
      )}

      <div className="grade">
        <div className="card">
          <h3 style={{ color: 'var(--verde)' }}>Onde a {curto} está muito bem</h3>
          <ListaCidades cidades={boas} vazio="Nenhuma cidade com a tabela mais barata." />
        </div>
        <div className="card">
          <h3 style={{ color: 'var(--vermelho)' }}>Onde precisa melhorar</h3>
          <ListaCidades cidades={ruins} vazio={`Nenhuma cidade com a tabela mais cara (com ${minPedidos} ou mais pedidos).`} />
        </div>
      </div>
      <p className="suave" style={{ marginTop: -8 }}>
        Considerando cidades com pelo menos{' '}
        <input style={{ width: 54, display: 'inline-block' }} value={String(minPedidos)} inputMode="numeric" onChange={(ev) => setMinPedidos(ev.target.value.replace(/\D/g, ''))} /> pedidos no período.
      </p>

      <div className="card">
        <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Top 20 cidades mais vendidas {ufsTop.length > 1 ? 'por estado' : `· ${ufSel}`}</h3>
          {ufsTop.length > 1 && (
            <div className="alternar">
              {ufsTop.map((u) => (
                <button key={u} className={u === ufSel ? 'ativo' : ''} onClick={() => setUfTop(u)}>
                  {u}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tabela-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cidade</th>
                <th className="num">Pedidos</th>
                <th className="num">Custo médio atual</th>
                <th className="num">Custo médio {curto}</th>
                <th className="num">Diferença</th>
                <th />
                <th>Classificação</th>
                <th>Atual mais barata na cidade</th>
                <th className="num">Custo médio dela</th>
                <th className="num">Pedidos mais baratos</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c, i) => {
                const m = melhorAtual(c)
                return (
                  <tr key={c.cidade}>
                    <td>{i + 1}</td>
                    <td>{c.cidade}</td>
                    <td className="num">{num(c.n)}</td>
                    <td className="num">{moeda(media(c.atual, c.n))}</td>
                    <td className="num">{moeda(media(c.sim, c.n))}</td>
                    <td className="num">
                      <Dif s={c} />
                    </td>
                    <td>
                      <Barra d={dif(c)} />
                    </td>
                    <td>
                      <Classe s={c} />
                    </td>
                    <td title={m.nome}>{nomeCurto(m.nome)}</td>
                    <td className="num">{moeda(media(m.atual, m.n))}</td>
                    <td className="num">{pctDe(c.ganha, c.n)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 22 }}>Faixas de peso nas top cidades · diferença da {curto} sobre o custo atual</h3>
        <p className="suave" style={{ marginTop: -6 }}>
          Verde: a tabela sai mais barata naquela faixa; vermelho: mais cara. Passe o mouse para ver os custos médios.
        </p>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Cidade</th>
                {FAIXAS_PESO.map((_, i) => (
                  <th key={i} className="num">
                    {rotuloFaixa(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...top, null].map((c) => {
                const faixas = c ? c.faixas : somarFaixas(top)
                return (
                  <tr key={c?.cidade ?? 'total'} style={c ? undefined : { fontWeight: 700 }}>
                    <td>{c ? c.cidade : `Top ${top.length} de ${ufSel}`}</td>
                    {faixas.map((f, i) => (
                      <td
                        key={i}
                        className="num"
                        style={{ background: calor(dif(f), f.n) }}
                        title={f.n ? `${num(f.n)} pedidos · atual ${moeda(media(f.atual, f.n))} · tabela ${moeda(media(f.sim, f.n))}` : 'sem pedidos'}
                      >
                        {f.n ? (
                          <>
                            {sinal(dif(f))}
                            <div className="suave" style={{ fontSize: '0.72rem' }}>
                              {num(f.n)} ped.
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Transportadoras atuais nas mesmas praças</h3>
        <p className="suave" style={{ marginTop: -6 }}>
          Cada linha compara o que cada transportadora atual custou com o que a {e.tabela} cobraria pelos mesmos pedidos.
        </p>
        <TabelaSomas linhas={transp.map((x) => ({ chave: x.nome, rotulo: nomeCurto(x.nome), titulo: x.nome, s: x }))} total={t} nomeTabela={curto} />

        <h3 style={{ marginTop: 22 }}>Custo médio por faixa de peso · {curto} × principais transportadoras</h3>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Faixa de peso</th>
                <th className="num">Pedidos</th>
                <th className="num" style={{ color: 'var(--amarelo)' }}>
                  {curto}
                </th>
                <th className="num">Média atual</th>
                {principais.map((x) => (
                  <th key={x.nome} className="num" title={x.nome}>
                    {nomeCurto(x.nome)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {e.faixas.map((f, i) =>
                f.n ? (
                  <tr key={i}>
                    <td>{rotuloFaixa(i)}</td>
                    <td className="num">{num(f.n)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {moeda(media(f.sim, f.n))}
                    </td>
                    <td className="num">
                      {moeda(media(f.atual, f.n))} <Dif s={f} />
                    </td>
                    {principais.map((x) => {
                      const g = x.faixas[i]
                      return (
                        <td key={x.nome} className="num" style={{ background: calor(-dif(g), g.n) }} title={g.n ? `${num(g.n)} pedidos · ${e.tabela} cobraria ${moeda(media(g.sim, g.n))}` : ''}>
                          {g.n ? moeda(media(g.atual, g.n)) : '—'}
                          {g.n > 0 && (
                            <div className="suave" style={{ fontSize: '0.72rem' }}>
                              {num(g.n)} ped. · tabela {sinal(dif(g))}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
        <p className="suave">Nas colunas das transportadoras, verde indica que ela custa menos que a {e.tabela} nos mesmos pedidos daquela faixa.</p>
      </div>

      <div className="card">
        <h3>Por faixa de CEP da tabela</h3>
        <p className="suave" style={{ marginTop: -6 }}>Útil quando a tabela atende poucas cidades: mostra bairros e regiões dentro da mesma cidade.</p>
        <TabelaSomas
          linhas={e.faixasCep.map((f) => ({ chave: `${f.cepi}`, rotulo: `${cepTxt(f.cepi)} a ${cepTxt(f.cepf)}${f.cidade ? ` · ${f.cidade}` : ''}`, s: f }))}
          total={t}
          nomeTabela={curto}
        />
      </div>
    </>
  )
}

function ListaCidades({ cidades, vazio }: { cidades: PorCidade[]; vazio: string }) {
  if (!cidades.length) return <p className="suave">{vazio}</p>
  return (
    <table>
      <thead>
        <tr>
          <th>Cidade</th>
          <th className="num">Pedidos</th>
          <th className="num">Atual</th>
          <th className="num">Tabela</th>
          <th className="num">Diferença</th>
        </tr>
      </thead>
      <tbody>
        {cidades.map((c) => (
          <tr key={c.cidade + c.uf}>
            <td>
              {c.cidade} <span className="suave">{c.uf}</span>
            </td>
            <td className="num">{num(c.n)}</td>
            <td className="num">{moeda(media(c.atual, c.n))}</td>
            <td className="num">{moeda(media(c.sim, c.n))}</td>
            <td className="num">
              <Dif s={c} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TabelaSomas({ linhas, total, nomeTabela }: { linhas: { chave: string; rotulo: string; titulo?: string; s: Soma }[]; total: Soma; nomeTabela: string }) {
  return (
    <div className="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th />
            <th className="num">Pedidos</th>
            <th className="num">% dos pedidos</th>
            <th className="num">Total atual</th>
            <th className="num">Total {nomeTabela}</th>
            <th className="num">Médio atual</th>
            <th className="num">Médio {nomeTabela}</th>
            <th className="num">Diferença</th>
            <th />
            <th className="num">Pedidos mais baratos</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ chave, rotulo, titulo, s }) => (
            <tr key={chave}>
              <td title={titulo}>{rotulo}</td>
              <td className="num">{num(s.n)}</td>
              <td className="num">{pctDe(s.n, total.n)}</td>
              <td className="num">{moeda(s.atual)}</td>
              <td className="num">{moeda(s.sim)}</td>
              <td className="num">{moeda(media(s.atual, s.n))}</td>
              <td className="num">{moeda(media(s.sim, s.n))}</td>
              <td className="num">
                <Dif s={s} />
              </td>
              <td>
                <Barra d={dif(s)} />
              </td>
              <td className="num">{pctDe(s.ganha, s.n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function somarFaixas(cidades: PorCidade[]): Soma[] {
  return FAIXAS_PESO.map((_, i) =>
    cidades.reduce<Soma>(
      (s, c) => {
        const f = c.faixas[i]
        return { n: s.n + f.n, atual: s.atual + f.atual, sim: s.sim + f.sim, valor: s.valor + f.valor, cobrado: s.cobrado + f.cobrado, peso: s.peso + f.peso, ganha: s.ganha + f.ganha }
      },
      { n: 0, atual: 0, sim: 0, valor: 0, cobrado: 0, peso: 0, ganha: 0 },
    ),
  )
}

const r2 = (x: number) => Math.round(x * 100) / 100
const pctNum = (x: number) => Math.round(x * 10000) / 100
const cepTxt = (c: number) => {
  const s = String(c).padStart(8, '0')
  return `${s.slice(0, 5)}-${s.slice(5)}`
}

/** "Vm Transportes (Tempo Justo ...)" vira "Vm Transportes"; razões sociais longas são cortadas. */
const nomeCurto = (s: string) => {
  const t = s.replace(/\s*\(.*$/, '').trim() || s
  return t.length > 28 ? t.slice(0, 26) + '…' : t
}
