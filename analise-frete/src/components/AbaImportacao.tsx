import { useEffect, useMemo, useState } from 'react'
import {
  CAMPOS,
  converter,
  sugerirColunasPeso,
  sugerirMapeamento,
  type CampoFaixa,
  type Layout,
  type Mapeamento,
  type Origem,
} from '../lib/conversao'
import { excluirProposta, listarPropostas, modoDemo, obterFaixas, salvarProposta } from '../lib/dados'
import { propostasExemplo } from '../lib/exemplo'
import { data, num } from '../lib/formato'
import { COLUNAS_INTELIPOST, exportarIntelipost, linhasIntelipost } from '../lib/intelipost'
import { detectarCabecalho, lerArquivo, type Aba, type Celula } from '../lib/planilha'
import type { Proposta } from '../lib/types'

export default function AbaImportacao() {
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [erroLista, setErroLista] = useState('')

  async function recarregar() {
    try {
      setPropostas(await listarPropostas())
      setErroLista('')
    } catch (e) {
      setErroLista((e as Error).message)
    }
  }
  useEffect(() => {
    recarregar()
  }, [])

  return (
    <>
      <Importador aoSalvar={recarregar} />
      <PropostasSalvas propostas={propostas} erro={erroLista} recarregar={recarregar} />
    </>
  )
}

// ---------------------------------------------------------------------------

function Importador({ aoSalvar }: { aoSalvar: () => void }) {
  const [abas, setAbas] = useState<Aba[]>([])
  const [arquivoNome, setArquivoNome] = useState('')
  const [abaIdx, setAbaIdx] = useState(0)
  const [linhaCab, setLinhaCab] = useState(0)
  const [layout, setLayout] = useState<Layout>('linhas')
  const [map, setMap] = useState<Mapeamento | null>(null)
  const [colunasPeso, setColunasPeso] = useState<number[]>([])
  const [transportadora, setTransportadora] = useState('')
  const [nome, setNome] = useState('')
  const [vigIni, setVigIni] = useState('')
  const [vigFim, setVigFim] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [salvando, setSalvando] = useState(false)

  const linhas: Celula[][] = abas[abaIdx]?.linhas ?? []
  const cabecalho = linhas[linhaCab] ?? []
  const opcoesColuna = cabecalho.map((c, i) => ({ i, rotulo: `${colunaLetra(i)} · ${c ?? '(vazio)'}` }))

  function prepararAba(lin: Celula[][]) {
    const cab = detectarCabecalho(lin)
    setLinhaCab(cab)
    aplicarCabecalho(lin[cab] ?? [])
  }

  function aplicarCabecalho(cab: Celula[]) {
    setMap(sugerirMapeamento(cab))
    const pesos = sugerirColunasPeso(cab)
    setColunasPeso(pesos)
    setLayout(pesos.length >= 2 ? 'matriz' : 'linhas')
  }

  async function abrirArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro('')
    setMsg('')
    try {
      const lidas = await lerArquivo(arquivo)
      setAbas(lidas)
      setArquivoNome(arquivo.name)
      setAbaIdx(0)
      prepararAba(lidas[0]?.linhas ?? [])
      if (!nome) setNome(arquivo.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  const conversao = useMemo(
    () => (map ? converter(linhas, linhaCab, map, layout, colunasPeso) : null),
    [linhas, linhaCab, map, layout, colunasPeso],
  )

  function definirOrigem(campo: CampoFaixa, origem: Origem) {
    setMap((m) => (m ? { ...m, [campo]: origem } : m))
  }

  async function salvar() {
    if (!conversao?.faixas.length) return
    if (!transportadora.trim()) return setErro('Informe o nome da transportadora.')
    setSalvando(true)
    setErro('')
    try {
      await salvarProposta({
        transportadora: transportadora.trim(),
        nome: nome.trim() || arquivoNome,
        vigencia_inicio: vigIni || null,
        vigencia_fim: vigFim || null,
        arquivo_nome: arquivoNome,
        observacoes: obs || null,
        faixas: conversao.faixas,
      })
      setMsg(`Proposta salva com ${num(conversao.faixas.length)} faixas.`)
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const passo = !abas.length ? 1 : !conversao?.faixas.length ? 2 : 3

  return (
    <div className="card">
      <h2>Importar proposta de transportadora</h2>
      <div className="passos">
        {['1. Arquivo', '2. Mapear colunas', '3. Conferir e salvar / exportar Intelipost'].map((p, i) => (
          <span key={p} className={`passo ${passo === i + 1 ? 'ativo' : passo > i + 1 ? 'feito' : ''}`}>
            {p}
          </span>
        ))}
      </div>

      <div className="linha">
        <div className="campo">
          <label>Transportadora *</label>
          <input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} placeholder="Ex.: Jadlog" />
        </div>
        <div className="campo">
          <label>Nome da proposta</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Tabela 2027" />
        </div>
        <div className="campo" style={{ maxWidth: 170 }}>
          <label>Vigência início</label>
          <input type="date" value={vigIni} onChange={(e) => setVigIni(e.target.value)} />
        </div>
        <div className="campo" style={{ maxWidth: 170 }}>
          <label>Vigência fim</label>
          <input type="date" value={vigFim} onChange={(e) => setVigFim(e.target.value)} />
        </div>
      </div>
      <div className="linha" style={{ marginTop: 12 }}>
        <div className="campo">
          <label>Planilha da proposta (.xlsx ou .csv)</label>
          <input type="file" accept=".xlsx,.csv,.txt,.xls" onChange={(e) => abrirArquivo(e.target.files?.[0])} />
        </div>
        <div className="campo">
          <label>Observações</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      {erro && <p className="erro" style={{ marginTop: 10 }}>{erro}</p>}

      {abas.length > 0 && map && (
        <>
          <hr style={{ borderColor: 'var(--borda)', margin: '20px 0' }} />
          <h3>Estrutura da planilha</h3>
          <div className="linha">
            {abas.length > 1 && (
              <div className="campo">
                <label>Aba</label>
                <select
                  value={abaIdx}
                  onChange={(e) => {
                    const i = Number(e.target.value)
                    setAbaIdx(i)
                    prepararAba(abas[i].linhas)
                  }}
                >
                  {abas.map((a, i) => (
                    <option key={i} value={i}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="campo" style={{ maxWidth: 200 }}>
              <label>Linha do cabeçalho</label>
              <input
                type="number"
                min={1}
                value={linhaCab + 1}
                onChange={(e) => {
                  const n = Math.max(0, Number(e.target.value) - 1)
                  setLinhaCab(n)
                  aplicarCabecalho(linhas[n] ?? [])
                }}
              />
            </div>
            <div className="campo">
              <label>Formato da tabela</label>
              <select value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
                <option value="linhas">Uma faixa de peso por linha</option>
                <option value="matriz">Matriz: faixas de peso em colunas</option>
              </select>
            </div>
          </div>

          {layout === 'matriz' && (
            <div style={{ marginTop: 12 }}>
              <span className="rotulo">Colunas que são faixas de peso (o limite é lido do cabeçalho, ex.: “Até 10 kg”)</span>
              <div className="linha" style={{ gap: 14, marginTop: 6 }}>
                {opcoesColuna.map(({ i, rotulo }) => (
                  <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={colunasPeso.includes(i)}
                      onChange={(e) =>
                        setColunasPeso((c) => (e.target.checked ? [...c, i] : c.filter((x) => x !== i)))
                      }
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ marginTop: 20 }}>Mapeamento de colunas</h3>
          <p className="suave">
            Sugerimos as colunas pelo nome do cabeçalho. Use “valor fixo” para taxas que a proposta informa uma única vez
            (ex.: GRIS de 0,3% para todo o Brasil).
          </p>
          <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {CAMPOS.filter((c) => !(layout === 'matriz' && ['peso_inicial', 'peso_final', 'valor_frete'].includes(c.campo))).map(
              (def) => {
                const o = map[def.campo]
                return (
                  <div key={def.campo} className="campo">
                    <label>{def.rotulo}</label>
                    <div className="linha" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <select
                        style={{ flex: 1, minWidth: 0 }}
                        value={o.tipo === 'coluna' ? String(o.indice) : o.tipo}
                        onChange={(e) => {
                          const v = e.target.value
                          definirOrigem(
                            def.campo,
                            v === 'nenhum' ? { tipo: 'nenhum' } : v === 'fixo' ? { tipo: 'fixo', valor: '' } : { tipo: 'coluna', indice: Number(v) },
                          )
                        }}
                      >
                        <option value="nenhum">— não informado —</option>
                        <option value="fixo">valor fixo…</option>
                        {opcoesColuna.map(({ i, rotulo }) => (
                          <option key={i} value={i}>
                            {rotulo}
                          </option>
                        ))}
                      </select>
                      {o.tipo === 'fixo' && (
                        <input
                          style={{ width: 90 }}
                          value={o.valor}
                          placeholder={def.numerico ? '0,00' : ''}
                          onChange={(e) => definirOrigem(def.campo, { tipo: 'fixo', valor: e.target.value })}
                        />
                      )}
                    </div>
                  </div>
                )
              },
            )}
          </div>

          {conversao && (
            <>
              <h3 style={{ marginTop: 22 }}>
                Prévia no modelo Intelipost · {num(conversao.faixas.length)} faixas
              </h3>
              {conversao.avisos.map((a) => (
                <div key={a} className="aviso">
                  {a}
                </div>
              ))}
              <div className="tabela-wrap" style={{ maxHeight: 340 }}>
                <table>
                  <thead>
                    <tr>
                      {COLUNAS_INTELIPOST.map((c) => (
                        <th key={c.cabecalho}>{c.cabecalho}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhasIntelipost(conversao.faixas.slice(0, 100)).map((l, i) => (
                      <tr key={i}>
                        {l.map((c, j) => (
                          <td key={j} className={typeof c === 'number' ? 'num' : ''}>
                            {typeof c === 'number' ? num(c) : c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {conversao.faixas.length > 100 && <p className="suave">Mostrando as 100 primeiras faixas.</p>}
              <div className="linha" style={{ marginTop: 14 }}>
                <button className="btn primario" disabled={!conversao.faixas.length || salvando} onClick={salvar}>
                  {salvando ? 'Salvando…' : 'Salvar proposta no histórico'}
                </button>
                <button
                  className="btn"
                  disabled={!conversao.faixas.length}
                  onClick={() => exportarIntelipost({ transportadora: transportadora || 'Transportadora', nome: nome || arquivoNome }, conversao.faixas)}
                >
                  Baixar planilha Intelipost (.xlsx)
                </button>
                {msg && <span style={{ color: 'var(--verde)' }}>{msg}</span>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function PropostasSalvas({ propostas, erro, recarregar }: { propostas: Proposta[]; erro: string; recarregar: () => void }) {
  const [ocupado, setOcupado] = useState('')

  async function exportar(p: Proposta) {
    setOcupado(p.id)
    try {
      await exportarIntelipost(p, await obterFaixas(p.id))
    } finally {
      setOcupado('')
    }
  }

  async function excluir(p: Proposta) {
    if (!window.confirm(`Excluir a proposta "${p.nome}" de ${p.transportadora}?`)) return
    await excluirProposta(p.id)
    recarregar()
  }

  async function carregarExemplos() {
    for (const p of propostasExemplo()) await salvarProposta(p)
    recarregar()
  }

  return (
    <div className="card">
      <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Propostas salvas</h2>
        {modoDemo && (
          <button className="btn pequeno" onClick={carregarExemplos}>
            Carregar propostas de exemplo
          </button>
        )}
      </div>
      {erro && <p className="erro">{erro}</p>}
      {!propostas.length ? (
        <p className="suave">Nenhuma proposta importada ainda.</p>
      ) : (
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Transportadora</th>
                <th>Proposta</th>
                <th>Vigência</th>
                <th className="num">Faixas</th>
                <th>Arquivo</th>
                <th>Importada em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {propostas.map((p) => (
                <tr key={p.id}>
                  <td>{p.transportadora}</td>
                  <td>{p.nome}</td>
                  <td>
                    {data(p.vigencia_inicio)} a {data(p.vigencia_fim)}
                  </td>
                  <td className="num">{num(p.total_faixas ?? 0)}</td>
                  <td className="suave">{p.arquivo_nome}</td>
                  <td>{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <div className="linha" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button className="btn pequeno" disabled={ocupado === p.id} onClick={() => exportar(p)}>
                        {ocupado === p.id ? 'Gerando…' : 'Intelipost .xlsx'}
                      </button>
                      <button className="btn pequeno perigo" onClick={() => excluir(p)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function colunaLetra(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
