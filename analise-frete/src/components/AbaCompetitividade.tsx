import { useEffect, useMemo, useState } from 'react'
import { CAPITAIS, UFS, formatarCep, normalizarCep, ufDoCep } from '../lib/cep'
import { excluirAnalise, listarAnalises, listarPropostas, obterFaixas, salvarAnalise } from '../lib/dados'
import { analisar, type ResultadoAnalise } from '../lib/frete'
import { dataHora, moeda, num, pct } from '../lib/formato'
import { baixarXlsx, detectarCabecalho, lerArquivo, numero, type Celula } from '../lib/planilha'
import type { Analise, Envio, Faixa, Proposta } from '../lib/types'

type Fonte = 'capitais' | 'planilha' | 'simulacao'

interface ResultadoSalvo {
  resultado: ResultadoAnalise
  propostas: Pick<Proposta, 'id' | 'transportadora' | 'nome'>[]
}

export default function AbaCompetitividade({ irParaImportacao }: { irParaImportacao: () => void }) {
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [fonte, setFonte] = useState<Fonte>('capitais')
  const [pesos, setPesos] = useState('5, 10, 30, 50, 100')
  const [valorNf, setValorNf] = useState('1000')
  const [ufs, setUfs] = useState<string[]>(UFS)
  const [enviosPlanilha, setEnviosPlanilha] = useState<Envio[]>([])
  const [avisoPlanilha, setAvisoPlanilha] = useState('')
  const [sim, setSim] = useState({ cep: '', peso: '10', valor: '1000' })
  const [resultado, setResultado] = useState<ResultadoSalvo | null>(null)
  const [historico, setHistorico] = useState<Analise[]>([])
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [nomeAnalise, setNomeAnalise] = useState('')

  useEffect(() => {
    listarPropostas()
      .then((p) => {
        setPropostas(p)
        setSelecionadas(p.map((x) => x.id))
      })
      .catch((e) => setErro(e.message))
    listarAnalises().then(setHistorico).catch(() => {})
  }, [])

  function montarEnvios(): Envio[] {
    if (fonte === 'simulacao') {
      const cep = normalizarCep(sim.cep)
      const uf = ufDoCep(cep) || sim.cep.trim().toUpperCase().slice(0, 2)
      return [{ id: '1', descricao: cep ? formatarCep(cep) : uf, cep, uf, peso: numero(sim.peso), valor_nf: numero(sim.valor) }]
    }
    if (fonte === 'planilha') return enviosPlanilha
    const listaPesos = pesos
      .split(/[;,\s]+/)
      .map((p) => parseFloat(p))
      .filter((p) => p > 0)
    const valor = numero(valorNf)
    return CAPITAIS.filter((c) => ufs.includes(c.uf)).flatMap((c) =>
      listaPesos.map((peso) => ({
        id: `${c.uf}-${peso}`,
        descricao: `${c.cidade}/${c.uf}`,
        cep: c.cep,
        uf: c.uf,
        peso,
        valor_nf: valor,
      })),
    )
  }

  async function executar() {
    setErro('')
    const envios = montarEnvios()
    if (!envios.length) return setErro('Nenhum envio para analisar.')
    const escolhidas = propostas.filter((p) => selecionadas.includes(p.id))
    if (!escolhidas.length) return setErro('Selecione ao menos uma proposta.')
    setProcessando(true)
    try {
      const faixas: Record<string, Faixa[]> = {}
      for (const p of escolhidas) faixas[p.id] = await obterFaixas(p.id)
      setResultado({
        resultado: analisar(escolhidas, faixas, envios),
        propostas: escolhidas.map(({ id, transportadora, nome }) => ({ id, transportadora, nome })),
      })
      setNomeAnalise(
        `${fonte === 'capitais' ? 'Capitais' : fonte === 'planilha' ? 'Base de envios' : 'Simulação'} · ${new Date().toLocaleDateString('pt-BR')}`,
      )
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setProcessando(false)
    }
  }

  async function abrirPlanilhaEnvios(arquivo: File | undefined) {
    if (!arquivo) return
    setAvisoPlanilha('')
    try {
      const [aba] = await lerArquivo(arquivo)
      const { envios, aviso } = enviosDaPlanilha(aba?.linhas ?? [])
      setEnviosPlanilha(envios)
      setAvisoPlanilha(aviso)
    } catch (e) {
      setAvisoPlanilha((e as Error).message)
    }
  }

  async function guardar() {
    if (!resultado) return
    const r = resultado.resultado
    // Limita o detalhe salvo para não estourar o histórico com bases muito grandes.
    const compacto: ResultadoSalvo = { ...resultado, resultado: { ...r, linhas: r.linhas.slice(0, 3000) } }
    try {
      await salvarAnalise({ nome: nomeAnalise || 'Análise', parametros: { fonte, pesos, valorNf, ufs }, resultado: compacto })
      setHistorico(await listarAnalises())
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  if (!propostas.length && !erro) {
    return (
      <div className="card">
        <h2>Competitividade de frete</h2>
        <p>Nenhuma proposta cadastrada ainda. Importe as propostas das transportadoras para comparar.</p>
        <button className="btn primario" onClick={irParaImportacao}>
          Importar propostas
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="grade">
        <div className="card">
          <h3>1. Propostas a comparar</h3>
          <div className="lista-check">
            {propostas.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={selecionadas.includes(p.id)}
                  onChange={(e) =>
                    setSelecionadas((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))
                  }
                />
                <span>
                  <strong>{p.transportadora}</strong> · {p.nome}{' '}
                  <span className="suave">({num(p.total_faixas ?? 0)} faixas)</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>2. Envios para simular</h3>
          <div className="linha" style={{ gap: 16, marginBottom: 12 }}>
            {(
              [
                ['capitais', 'Capitais × pesos'],
                ['planilha', 'Base de envios (planilha)'],
                ['simulacao', 'Cotação única'],
              ] as [Fonte, string][]
            ).map(([v, r]) => (
              <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" checked={fonte === v} onChange={() => setFonte(v)} />
                {r}
              </label>
            ))}
          </div>

          {fonte === 'capitais' && (
            <>
              <div className="linha">
                <div className="campo">
                  <label>Pesos (kg), separados por vírgula (decimais com ponto)</label>
                  <input value={pesos} onChange={(e) => setPesos(e.target.value)} />
                </div>
                <div className="campo" style={{ maxWidth: 160 }}>
                  <label>Valor da NF (R$)</label>
                  <input value={valorNf} onChange={(e) => setValorNf(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <span className="rotulo">
                  UFs ·{' '}
                  <a href="#" onClick={(e) => (e.preventDefault(), setUfs(UFS))}>todas</a> ·{' '}
                  <a href="#" onClick={(e) => (e.preventDefault(), setUfs([]))}>nenhuma</a>
                </span>
                <div className="linha" style={{ gap: 8, marginTop: 6 }}>
                  {UFS.map((uf) => (
                    <label key={uf} style={{ display: 'flex', gap: 3, alignItems: 'center', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={ufs.includes(uf)}
                        onChange={(e) => setUfs((u) => (e.target.checked ? [...u, uf] : u.filter((x) => x !== uf)))}
                      />
                      {uf}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {fonte === 'planilha' && (
            <>
              <p className="suave">
                Planilha com o histórico de pedidos: colunas de <strong>CEP</strong> (ou UF), <strong>peso</strong> e{' '}
                <strong>valor da NF</strong>. Os nomes das colunas são reconhecidos automaticamente.
              </p>
              <input type="file" accept=".xlsx,.csv,.txt" onChange={(e) => abrirPlanilhaEnvios(e.target.files?.[0])} />
              {enviosPlanilha.length > 0 && <p style={{ marginTop: 8 }}>{num(enviosPlanilha.length)} envios carregados.</p>}
              {avisoPlanilha && <div className="aviso">{avisoPlanilha}</div>}
            </>
          )}

          {fonte === 'simulacao' && (
            <div className="linha">
              <div className="campo">
                <label>CEP ou UF de destino</label>
                <input value={sim.cep} onChange={(e) => setSim({ ...sim, cep: e.target.value })} placeholder="01310-100" />
              </div>
              <div className="campo" style={{ maxWidth: 120 }}>
                <label>Peso (kg)</label>
                <input value={sim.peso} onChange={(e) => setSim({ ...sim, peso: e.target.value })} />
              </div>
              <div className="campo" style={{ maxWidth: 140 }}>
                <label>Valor NF (R$)</label>
                <input value={sim.valor} onChange={(e) => setSim({ ...sim, valor: e.target.value })} />
              </div>
            </div>
          )}

          <div className="linha" style={{ marginTop: 16 }}>
            <button className="btn primario" onClick={executar} disabled={processando}>
              {processando ? 'Calculando…' : 'Analisar competitividade'}
            </button>
            {erro && <span className="erro">{erro}</span>}
          </div>
        </div>
      </div>

      {resultado && (
        <Resultado
          dados={resultado}
          nome={nomeAnalise}
          setNome={setNomeAnalise}
          aoSalvar={guardar}
        />
      )}

      <Historico
        itens={historico}
        abrir={(a) => {
          setResultado(a.resultado as ResultadoSalvo)
          setNomeAnalise(a.nome)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        excluir={async (a) => {
          await excluirAnalise(a.id)
          setHistorico(await listarAnalises())
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------

function Resultado({
  dados,
  nome,
  setNome,
  aoSalvar,
}: {
  dados: ResultadoSalvo
  nome: string
  setNome: (s: string) => void
  aoSalvar: () => void
}) {
  const { resultado, propostas } = dados
  const { linhas, ranking } = resultado
  const atendidos = linhas.filter((l) => l.cotacoes.length).length
  const lider = ranking[0]
  const totalVitorias = Math.max(1, atendidos)

  // Custo médio por UF e transportadora: mostra onde cada uma é mais competitiva.
  const porUf = useMemo(() => {
    const mapa = new Map<string, Map<string, { soma: number; n: number }>>()
    for (const l of linhas) {
      const uf = l.envio.uf || ufDoCep(l.envio.cep) || '—'
      if (!mapa.has(uf)) mapa.set(uf, new Map())
      for (const c of l.cotacoes) {
        const m = mapa.get(uf)!
        const atual = m.get(c.proposta_id) ?? { soma: 0, n: 0 }
        m.set(c.proposta_id, { soma: atual.soma + c.total, n: atual.n + 1 })
      }
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([uf, m]) => {
        const medias = propostas.map((p) => {
          const v = m.get(p.id)
          return v ? v.soma / v.n : null
        })
        const validas = medias.filter((x): x is number => x !== null)
        return { uf, medias, melhor: validas.length ? Math.min(...validas) : null }
      })
  }, [linhas, propostas])

  const [salvo, setSalvo] = useState(false)

  async function exportar() {
    await baixarXlsx(`Competitividade - ${nome || 'analise'}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'), [
      {
        nome: 'Ranking',
        cabecalho: ['Transportadora', 'Proposta', 'Envios atendidos', 'Vitórias', 'Custo total', 'Custo médio', 'Acima do melhor (média %)', 'Prazo médio'],
        linhas: ranking.map((r) => [r.transportadora, r.proposta, r.atendidos, r.vitorias, r.custo_total, r.custo_medio, r.diferenca_media_pct, r.prazo_medio]),
      },
      {
        nome: 'Por UF',
        cabecalho: ['UF', ...propostas.map((p) => p.transportadora)],
        linhas: porUf.map((u) => [u.uf, ...u.medias.map((m) => (m === null ? null : Math.round(m * 100) / 100))]),
      },
      {
        nome: 'Detalhe',
        cabecalho: ['Destino', 'CEP', 'UF', 'Peso', 'Valor NF', 'Melhor', 'Melhor valor', ...propostas.map((p) => p.transportadora)],
        linhas: linhas.map((l) => [
          l.envio.descricao,
          formatarCep(l.envio.cep),
          l.envio.uf,
          l.envio.peso,
          l.envio.valor_nf,
          l.cotacoes[0]?.transportadora ?? 'sem cobertura',
          l.cotacoes[0]?.total ?? null,
          ...propostas.map((p) => l.cotacoes.find((c) => c.proposta_id === p.id)?.total ?? null),
        ]),
      },
    ])
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="rotulo">Envios simulados</div>
          <div className="valor">{num(linhas.length)}</div>
          <div className="suave">{num(atendidos)} com cobertura</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Mais competitiva</div>
          <div className="valor destaque">{lider?.transportadora ?? '—'}</div>
          <div className="suave">{lider ? `${pct((lider.vitorias / totalVitorias) * 100)} dos envios mais baratos` : ''}</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Custo com a melhor de cada envio</div>
          <div className="valor">{moeda(resultado.melhor_combinacao_total)}</div>
          <div className="suave">combinando transportadoras</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Custo só com a líder</div>
          <div className="valor">{lider ? moeda(lider.custo_total) : '—'}</div>
          <div className="suave">{lider ? `${num(lider.atendidos)} envios atendidos` : ''}</div>
        </div>
      </div>

      <div className="card">
        <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Ranking de competitividade</h2>
          <div className="linha" style={{ gap: 8 }}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da análise" style={{ minWidth: 220 }} />
            <button
              className="btn"
              disabled={salvo}
              onClick={async () => {
                await aoSalvar()
                setSalvo(true)
              }}
            >
              {salvo ? 'Salva no histórico' : 'Salvar no histórico'}
            </button>
            <button className="btn" onClick={exportar}>
              Exportar .xlsx
            </button>
          </div>
        </div>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Transportadora</th>
                <th>Proposta</th>
                <th className="num">Atendidos</th>
                <th>Mais barata em</th>
                <th className="num">Custo médio</th>
                <th className="num">Acima do melhor (média)</th>
                <th className="num">Prazo médio</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.proposta_id}>
                  <td>{i + 1}º</td>
                  <td>
                    <strong>{r.transportadora}</strong>
                  </td>
                  <td>{r.proposta}</td>
                  <td className="num">{num(r.atendidos)}</td>
                  <td>
                    <div className="linha" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
                      <div className="barra">
                        <div style={{ width: `${(r.vitorias / totalVitorias) * 100}%` }} />
                      </div>
                      {num(r.vitorias)} ({pct((r.vitorias / totalVitorias) * 100)})
                    </div>
                  </td>
                  <td className="num">{moeda(r.custo_medio)}</td>
                  <td className={`num ${r.diferenca_media_pct === 0 ? 'melhor' : ''}`}>+{pct(r.diferenca_media_pct)}</td>
                  <td className="num">{r.prazo_medio ? `${num(r.prazo_medio)} dias` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Custo médio por UF</h2>
        <p className="suave">Em verde, a transportadora mais barata em cada estado.</p>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>UF</th>
                {propostas.map((p) => (
                  <th key={p.id} className="num">
                    {p.transportadora}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porUf.map((u) => (
                <tr key={u.uf}>
                  <td>{u.uf}</td>
                  {u.medias.map((m, i) => (
                    <td key={i} className={`num ${m === null ? 'vazio' : m === u.melhor ? 'melhor' : ''}`}>
                      {m === null ? 'não atende' : moeda(m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Detalhe por envio</h2>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Destino</th>
                <th className="num">Peso</th>
                <th className="num">Valor NF</th>
                {propostas.map((p) => (
                  <th key={p.id} className="num">
                    {p.transportadora}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.slice(0, 500).map((l) => (
                <tr key={l.envio.id}>
                  <td>{l.envio.descricao}</td>
                  <td className="num">{num(l.envio.peso)} kg</td>
                  <td className="num">{moeda(l.envio.valor_nf)}</td>
                  {propostas.map((p) => {
                    const c = l.cotacoes.find((x) => x.proposta_id === p.id)
                    const melhor = c && c.total === l.cotacoes[0].total
                    return (
                      <td
                        key={p.id}
                        className={`num ${!c ? 'vazio' : melhor ? 'melhor' : ''}`}
                        title={
                          c
                            ? `Frete peso ${moeda(c.detalhe.frete_peso)} + excedente ${moeda(c.detalhe.excedente)} + ad valorem ${moeda(c.detalhe.ad_valorem)} + GRIS ${moeda(c.detalhe.gris)} + pedágio ${moeda(c.detalhe.pedagio)} + taxa ${moeda(c.detalhe.taxa_fixa)}${c.detalhe.minimo_aplicado ? ' (frete mínimo aplicado)' : ''} · ${c.prazo_dias} dias`
                            : ''
                        }
                      >
                        {c ? moeda(c.total) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {linhas.length > 500 && <p className="suave">Mostrando 500 de {num(linhas.length)} envios. Exporte para ver todos.</p>}
        <p className="suave" style={{ marginTop: 8 }}>Passe o mouse sobre um valor para ver a composição do frete.</p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function Historico({ itens, abrir, excluir }: { itens: Analise[]; abrir: (a: Analise) => void; excluir: (a: Analise) => void }) {
  if (!itens.length) return null
  return (
    <div className="card">
      <h2>Histórico de análises</h2>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>Análise</th>
              <th>Data</th>
              <th>Mais competitiva</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((a) => {
              const r = (a.resultado as ResultadoSalvo | null)?.resultado
              return (
                <tr key={a.id}>
                  <td>{a.nome}</td>
                  <td>{dataHora(a.created_at)}</td>
                  <td>{r?.ranking?.[0]?.transportadora ?? '—'}</td>
                  <td>
                    <div className="linha" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button className="btn pequeno" onClick={() => abrir(a)}>
                        Abrir
                      </button>
                      <button className="btn pequeno perigo" onClick={() => window.confirm('Excluir esta análise?') && excluir(a)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function enviosDaPlanilha(linhas: Celula[][]): { envios: Envio[]; aviso: string } {
  const iCab = detectarCabecalho(linhas)
  const cab = (linhas[iCab] ?? []).map((c) =>
    String(c ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, ''),
  )
  const achar = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c.includes(n)))
  const iCep = achar('cep')
  const iUf = achar('uf', 'estado')
  const iPeso = achar('peso', 'kg')
  const iValor = achar('valor nf', 'valor da nf', 'nota', 'valor mercadoria', 'valor')
  const iPedido = achar('pedido', 'nota fiscal', 'documento')
  if ((iCep < 0 && iUf < 0) || iPeso < 0) {
    return { envios: [], aviso: 'Não encontrei as colunas de CEP/UF e peso no cabeçalho.' }
  }
  const envios: Envio[] = []
  linhas.slice(iCab + 1).forEach((l, n) => {
    const cep = iCep >= 0 ? normalizarCep(l[iCep]) : ''
    const uf = (iUf >= 0 ? String(l[iUf] ?? '').toUpperCase().slice(0, 2) : '') || ufDoCep(cep)
    const peso = numero(l[iPeso])
    if ((!cep && !uf) || peso <= 0) return
    envios.push({
      id: String(n),
      descricao: iPedido >= 0 && l[iPedido] ? `${l[iPedido]} · ${formatarCep(cep) || uf}` : formatarCep(cep) || uf,
      cep,
      uf,
      peso,
      valor_nf: iValor >= 0 ? numero(l[iValor]) : 0,
    })
  })
  const aviso = iValor < 0 ? 'Coluna de valor da NF não encontrada: ad valorem e GRIS foram calculados como zero.' : ''
  return { envios, aviso }
}
