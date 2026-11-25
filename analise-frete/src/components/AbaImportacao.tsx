import { useEffect, useMemo, useState } from 'react'
import { aplicarAbrangencia, contarFaixasCep, gruposDe, lerAbrangencia, regiaoPadrao, sugerirAtribuicao, type FaixaCep } from '../lib/abrangencia'
import {
  CAMPOS,
  converter,
  detectarCabecalhoProposta,
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
import { exportarIntelipost, lembrarParametros, parametrosDoTexto, parametrosLembrados, pendenciasIntelipost, previaIntelipost, valorBr, type ParametrosIntelipost } from '../lib/intelipost'
import { lerPdf, observacoesDoTexto, taxasDoTexto } from '../lib/pdf'
import { detectarCabecalho, lerArquivo, numero, type Celula } from '../lib/planilha'
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

/** Uma tabela lida de um arquivo: uma aba do Excel, o CSV inteiro ou uma página do PDF. */
interface Fonte {
  arquivo: string
  nome: string
  linhas: Celula[][]
}

const rotuloFonte = (f: Fonte) => (f.nome && f.nome !== f.arquivo ? `${f.arquivo} · ${f.nome}` : f.arquivo)
const fmtValor = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

/** Quanto a fonte parece uma tabela de preços (campos conhecidos e faixas de peso no cabeçalho). */
function pontuarPreco(linhas: Celula[][]): number {
  const cab = detectarCabecalhoProposta(linhas)
  if (cab < 0) return 0
  const m = sugerirMapeamento(linhas[cab])
  const campos = Object.values(m).filter((o) => o.tipo === 'coluna').length
  const dados = linhas.slice(cab + 1).filter((l) => l.some((c) => numero(c) > 0)).length
  return sugerirColunasPeso(linhas[cab]).length * 2 + campos + Math.min(dados, 5)
}

function Importador({ aoSalvar }: { aoSalvar: () => void }) {
  const [fontes, setFontes] = useState<Fonte[]>([])
  const [textoPdf, setTextoPdf] = useState<string[]>([])
  const [precoIdx, setPrecoIdx] = useState(0)
  const [abrIdx, setAbrIdx] = useState(-1)
  const [atribuicao, setAtribuicao] = useState<Record<string, string>>({})
  const [regiaoTodos, setRegiaoTodos] = useState('')
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
  const [lendo, setLendo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const arquivos = [...new Set(fontes.map((f) => f.arquivo))]
  const arquivoNome = arquivos.join(' + ')
  const linhas: Celula[][] = fontes[precoIdx]?.linhas ?? []
  const cabecalho = linhas[linhaCab] ?? []
  const opcoesColuna = cabecalho.map((c, i) => ({ i, rotulo: `${colunaLetra(i)} · ${c ?? '(vazio)'}` }))
  const taxas = useMemo(() => taxasDoTexto(textoPdf), [textoPdf])
  const observacoes = useMemo(() => observacoesDoTexto(textoPdf), [textoPdf])
  const [params, setParams] = useState<ParametrosIntelipost>(parametrosLembrados)
  const mudarParam = (k: keyof ParametrosIntelipost, v: string) => setParams((p) => ({ ...p, [k]: v }))
  // PRAZO é obrigatório na Intelipost; quando a proposta não informa, vale o prazo padrão digitado.
  const [prazoPadrao, setPrazoPadrao] = useState('2')
  // O que a proposta informa (ICMS, cubagem) entra nos parâmetros da tabela Intelipost.
  useEffect(() => {
    const doTexto = parametrosDoTexto(textoPdf)
    if (Object.keys(doTexto).length) setParams((p) => ({ ...p, ...doTexto }))
  }, [textoPdf])

  function prepararPreco(lin: Celula[][], txt = textoPdf) {
    const cab = Math.max(0, detectarCabecalhoProposta(lin) >= 0 ? detectarCabecalhoProposta(lin) : detectarCabecalho(lin))
    setLinhaCab(cab)
    aplicarCabecalho(lin[cab] ?? [], txt)
  }

  function aplicarCabecalho(cab: Celula[], txt = textoPdf) {
    const m = sugerirMapeamento(cab)
    // Taxas gerais escritas no PDF entram como valor fixo quando a tabela não tem coluna para elas.
    for (const t of taxasDoTexto(txt)) if (m[t.campo].tipo === 'nenhum') m[t.campo] = { tipo: 'fixo', valor: fmtValor(t.valor) }
    setMap(m)
    const pesos = sugerirColunasPeso(cab)
    setColunasPeso(pesos)
    setLayout(pesos.length >= 2 ? 'matriz' : 'linhas')
  }

  async function adicionarArquivos(lista: FileList | null) {
    if (!lista?.length) return
    setErro('')
    setMsg('')
    const novas: Fonte[] = []
    const novoTexto: string[] = []
    const erros: string[] = []
    for (const arquivo of Array.from(lista)) {
      setLendo(`Lendo ${arquivo.name}…`)
      try {
        if (/\.pdf$/i.test(arquivo.name)) {
          const { abas, texto } = await lerPdf(arquivo)
          abas.forEach((a) => novas.push({ arquivo: arquivo.name, nome: a.nome, linhas: a.linhas }))
          novoTexto.push(...texto)
        } else {
          const abas = await lerArquivo(arquivo)
          abas.forEach((a) => novas.push({ arquivo: arquivo.name, nome: abas.length > 1 ? a.nome : '', linhas: a.linhas }))
        }
      } catch (e) {
        erros.push(`${arquivo.name}: ${(e as Error).message}`)
      }
    }
    setLendo('')
    if (erros.length) setErro(erros.join(' '))
    if (!novas.length) return
    const todas = [...fontes, ...novas]
    const txt = [...textoPdf, ...novoTexto]
    setFontes(todas)
    setTextoPdf(txt)
    escolherFontes(todas, txt)
    if (!nome) setNome(todas[0].arquivo.replace(/\.[^.]+$/, ''))
  }

  /** Sugere qual fonte é a tabela de preços e qual é a abrangência de CEPs. */
  function escolherFontes(todas: Fonte[], txt: string[]) {
    const notas = todas.map((f) => pontuarPreco(f.linhas))
    const p = notas.indexOf(Math.max(...notas))
    setPrecoIdx(p)
    prepararPreco(todas[p].linhas, txt)
    const ceps = todas.map((f, i) => (i === p ? 0 : contarFaixasCep(f.linhas)))
    const a = Math.max(...ceps) > 0 ? ceps.indexOf(Math.max(...ceps)) : -1
    setAbrIdx(a)
    setAtribuicao({})
  }

  function removerArquivo(arquivo: string) {
    const restantes = fontes.filter((f) => f.arquivo !== arquivo)
    setFontes(restantes)
    // O texto do PDF é recalculado a partir dos arquivos que ficaram só ao adicionar de novo; limpar evita taxas de um PDF removido.
    const txt = /\.pdf$/i.test(arquivo) ? [] : textoPdf
    setTextoPdf(txt)
    if (restantes.length) escolherFontes(restantes, txt)
    else (setMap(null), setAbrIdx(-1))
  }

  const conversao = useMemo(
    () => (map ? converter(linhas, linhaCab, map, layout, colunasPeso) : null),
    [linhas, linhaCab, map, layout, colunasPeso],
  )

  // Abrangência de CEPs (quando os preços vêm por região e os CEPs vêm em outro arquivo)
  const cepFaixas: FaixaCep[] = useMemo(() => (abrIdx >= 0 && fontes[abrIdx] ? lerAbrangencia(fontes[abrIdx].linhas) : []), [abrIdx, fontes])
  const grupos = useMemo(() => gruposDe(cepFaixas), [cepFaixas])
  const regioes = useMemo(() => [...new Set((conversao?.faixas ?? []).map((f) => f.cidade).filter(Boolean))], [conversao])
  // Quando nenhum grupo informa a região tarifária, todos começam com a região padrão (Capital).
  const sugestao = useMemo(() => sugerirAtribuicao(grupos.map((g) => g.grupo), regioes), [grupos, regioes])
  const regiaoAssumida = grupos.length > 0 && regioes.length > 0 && !Object.keys(sugestao).length ? regiaoPadrao(regioes) : ''
  useEffect(() => {
    // Ao trocar de abrangência ou de tabela, sugere a região de cada grupo e mantém o que já foi escolhido.
    const base = regiaoAssumida ? Object.fromEntries(grupos.map((g) => [g.grupo, regiaoAssumida])) : sugestao
    setAtribuicao((a) => ({ ...base, ...a }))
  }, [grupos, sugestao, regiaoAssumida])

  const final = useMemo(() => {
    if (!conversao) return null
    if (abrIdx < 0 || !cepFaixas.length) return { ...conversao, faixas: comPrazo(conversao.faixas, prazoPadrao), semPrazo: conversao.faixas.some((f) => !f.prazo_dias) }
    const r = aplicarAbrangencia(conversao.faixas, cepFaixas, atribuicao)
    const avisos = [...conversao.avisos.filter((a) => !/sem UF/.test(a)), ...r.avisos]
    if (!r.faixas.length) avisos.push('Escolha a região de preço de cada grupo de CEP para montar a tabela.')
    return { faixas: comPrazo(r.faixas, prazoPadrao), avisos, semPrazo: r.faixas.some((f) => !f.prazo_dias) }
  }, [conversao, abrIdx, cepFaixas, atribuicao, prazoPadrao])
  const pendencias = final ? [...(final.faixas.some((f) => !f.prazo_dias) ? ['PRAZO (dias)'] : []), ...pendenciasIntelipost(params)] : []

  function definirOrigem(campo: CampoFaixa, origem: Origem) {
    setMap((m) => (m ? { ...m, [campo]: origem } : m))
  }

  async function salvar() {
    if (!final?.faixas.length) return
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
        faixas: final.faixas,
      })
      setMsg(`Proposta salva com ${num(final.faixas.length)} faixas.`)
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const passo = !fontes.length ? 1 : !final?.faixas.length ? 2 : 3

  return (
    <div className="card">
      <h2>Importar proposta de transportadora</h2>
      <div className="passos">
        {['1. Arquivos', '2. Conferir tabelas e colunas', '3. Conferir e salvar / exportar Intelipost'].map((p, i) => (
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
      <div className="linha" style={{ marginTop: 12, alignItems: 'stretch' }}>
        <label className="soltar" style={{ flex: 2, minWidth: 260 }}>
          <input
            type="file"
            multiple
            accept=".pdf,.xlsx,.csv,.txt"
            hidden
            onChange={(e) => {
              adicionarArquivos(e.target.files)
              e.target.value = ''
            }}
          />
          <strong>Enviar arquivos da proposta (PDF, Excel ou CSV)</strong>
          <span className="suave">
            Pode escolher vários de uma vez, ou adicionar aos poucos: por exemplo, o PDF com os preços e o Excel com a abrangência de CEPs.
          </span>
        </label>
        <div className="campo">
          <label>Observações</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      {lendo && <p className="suave" style={{ marginTop: 10 }}>{lendo}</p>}
      {erro && <p className="erro" style={{ marginTop: 10 }}>{erro}</p>}
      {arquivos.length > 0 && (
        <div className="linha" style={{ gap: 8, marginTop: 10 }}>
          {arquivos.map((a) => (
            <span key={a} className="etiqueta" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              {a}
              <button className="btn pequeno perigo" style={{ padding: '0 6px' }} title="Remover arquivo" onClick={() => removerArquivo(a)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {fontes.length > 0 && map && (
        <>
          <hr style={{ borderColor: 'var(--borda)', margin: '20px 0' }} />
          <h3>Tabela de preços</h3>
          <div className="linha">
            <div className="campo" style={{ minWidth: 260 }}>
              <label>De qual arquivo vêm os preços</label>
              <select
                value={precoIdx}
                onChange={(e) => {
                  const i = Number(e.target.value)
                  setPrecoIdx(i)
                  prepararPreco(fontes[i].linhas)
                  if (abrIdx === i) setAbrIdx(-1)
                }}
              >
                {fontes.map((f, i) => (
                  <option key={i} value={i}>
                    {rotuloFonte(f)}
                  </option>
                ))}
              </select>
            </div>
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
                      onChange={(e) => setColunasPeso((c) => (e.target.checked ? [...c, i] : c.filter((x) => x !== i)))}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
            </div>
          )}

          {(taxas.length > 0 || observacoes.length > 0) && (
            <div className="aviso" style={{ marginTop: 14 }}>
              <strong>Encontrado no texto do PDF</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {taxas.map((t) => (
                  <li key={t.campo}>
                    {CAMPOS.find((c) => c.campo === t.campo)?.rotulo}: <b>{fmtValor(t.valor)}</b> <span className="suave">({t.trecho.slice(0, 140)})</span>
                  </li>
                ))}
                {observacoes.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              {taxas.length > 0 && <span className="suave">Esses valores já foram preenchidos como “valor fixo” abaixo; confira e ajuste se precisar.</span>}
            </div>
          )}

          <h3 style={{ marginTop: 20 }}>Mapeamento de colunas</h3>
          <p className="suave">
            Sugerimos as colunas pelo nome do cabeçalho. Use “valor fixo” para taxas que a proposta informa uma única vez
            (ex.: GRIS de 0,3% para todo o Brasil). Quando os preços são por região (Capital, Interior…), aponte a região em “Cidade / Região”.
          </p>
          <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {CAMPOS.filter((c) => !(layout === 'matriz' && ['peso_inicial', 'peso_final', 'valor_frete'].includes(c.campo))).map((def) => {
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
                        definirOrigem(def.campo, v === 'nenhum' ? { tipo: 'nenhum' } : v === 'fixo' ? { tipo: 'fixo', valor: '' } : { tipo: 'coluna', indice: Number(v) })
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
            })}
          </div>

          <h3 style={{ marginTop: 22 }}>Abrangência de CEPs</h3>
          <p className="suave">
            Use quando a tabela de preços é por região e as faixas de CEP atendidas vêm em outro arquivo. Cada grupo de CEP recebe os
            preços da região escolhida.
          </p>
          <div className="linha">
            <div className="campo" style={{ minWidth: 260 }}>
              <label>Arquivo da abrangência</label>
              <select value={abrIdx} onChange={(e) => setAbrIdx(Number(e.target.value))}>
                <option value={-1}>— não usar (os CEPs ou a UF estão na própria tabela de preços) —</option>
                {fontes.map((f, i) =>
                  i === precoIdx ? null : (
                    <option key={i} value={i}>
                      {rotuloFonte(f)}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
          {abrIdx >= 0 && (
            <>
              {!cepFaixas.length ? (
                <div className="aviso">Não encontrei faixas de CEP nesse arquivo (ex.: “01000 a 01099” ou colunas CEP inicial / CEP final).</div>
              ) : (
                <>
                  <p className="suave" style={{ marginTop: 10 }}>
                    {num(cepFaixas.length)} faixas de CEP em {num(grupos.length)} grupos.
                    {!regioes.length && ' A tabela de preços ainda não tem regiões: aponte a coluna “Cidade / Região” acima.'}
                  </p>
                  {regiaoAssumida && (
                    <div className="aviso">
                      A abrangência não informa a região tarifária de cada grupo, então todos foram considerados “{regiaoAssumida}”. Ajuste
                      abaixo se algum grupo for de outra região.
                    </div>
                  )}
                  {regioes.length > 0 && (
                    <div className="linha" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
                      <span className="suave">Aplicar a todos os grupos:</span>
                      <select value={regiaoTodos} onChange={(e) => setRegiaoTodos(e.target.value)}>
                        <option value="">— escolha a região —</option>
                        {regioes.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <button
                        className="btn pequeno"
                        disabled={!regiaoTodos}
                        onClick={() => setAtribuicao(Object.fromEntries(grupos.map((g) => [g.grupo, regiaoTodos])))}
                      >
                        Aplicar
                      </button>
                    </div>
                  )}
                  <div className="tabela-wrap" style={{ maxHeight: 360 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Grupo de CEP</th>
                          <th>Faixas</th>
                          <th className="num">Qtde</th>
                          <th>Região de preço</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupos.map((g) => {
                          const fx = cepFaixas.filter((c) => c.grupo === g.grupo)
                          return (
                            <tr key={g.grupo}>
                              <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{g.grupo}</td>
                              <td className="suave" style={{ whiteSpace: 'normal', maxWidth: 360 }}>
                                {fx.slice(0, 3).map((c) => `${fmtCep(c.cep_inicial)} a ${fmtCep(c.cep_final)}`).join(' · ')}
                                {fx.length > 3 && ` · +${fx.length - 3}`}
                              </td>
                              <td className="num">{num(g.qtd)}</td>
                              <td>
                                <select
                                  value={atribuicao[g.grupo] ?? ''}
                                  onChange={(e) => setAtribuicao((a) => ({ ...a, [g.grupo]: e.target.value }))}
                                >
                                  <option value="">— não atendido / escolher —</option>
                                  {regioes.map((r) => (
                                    <option key={r}>{r}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {final && (
            <>
              <h3 style={{ marginTop: 22 }}>Prévia no modelo Intelipost · {num(final.faixas.length)} faixas</h3>
              {final.avisos.map((a) => (
                <div key={a} className="aviso">
                  {a}
                </div>
              ))}
              <PreviaIntelipost faixas={final.faixas} grisMinimo={valorBr(params.grisMinimo)} />
              <h3 style={{ marginTop: 22 }}>Dados da tabela Intelipost</h3>
              <p className="suave">Vão na coluna A do modelo oficial. ICMS e CEP de origem são obrigatórios e ficam lembrados para as próximas propostas.</p>
              <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
                {final.semPrazo && (
                  <label style={CAMPO}>
                    Prazo (dias) sem prazo na proposta
                    <input style={{ width: '100%', boxSizing: 'border-box' }} value={prazoPadrao} placeholder="A proposta não informa" inputMode="numeric" onChange={(e) => setPrazoPadrao(e.target.value.replace(/\D/g, ''))} />
                  </label>
                )}
                <label style={CAMPO}>
                  ICMS já está calculado?
                  <select style={{ width: '100%', boxSizing: 'border-box' }} value={params.icms} onChange={(e) => mudarParam('icms', e.target.value)}>
                    <option value="">Escolha…</option>
                    <option value="S">S · valores já com ICMS</option>
                    <option value="N">N · valores sem ICMS</option>
                  </select>
                </label>
                {(
                  [
                    ['cepOrigemInicial', 'CEP origem inicial', 'Ex.: 89000000'],
                    ['cepOrigemFinal', 'CEP origem final', 'Ex.: 89999999'],
                    ['grisMinimo', 'GRIS mínimo (R$)', 'Ex.: 2,00'],
                    ['cubagem', 'Cubagem (kg/m³)', 'Ex.: 300'],
                    ['isencaoCubagem', 'Isenção de cubagem (kg)', 'Opcional'],
                    ['altura', 'Limite de altura (cm)', 'Opcional'],
                    ['largura', 'Limite de largura (cm)', 'Opcional'],
                    ['comprimento', 'Limite de comprimento (cm)', 'Opcional'],
                    ['somaDimensoes', 'Limite da soma das dimensões (cm)', 'Opcional'],
                    ['nomeTabela', 'Nome da tabela', `${transportadora || 'Transportadora'} - ${nome || arquivoNome}`],
                  ] as [keyof ParametrosIntelipost, string, string][]
                ).map(([k, rot, ph]) => (
                  <label key={k} style={CAMPO}>
                    {rot}
                    <input style={{ width: '100%', boxSizing: 'border-box' }} value={params[k]} placeholder={ph} onChange={(e) => mudarParam(k, e.target.value)} />
                  </label>
                ))}
              </div>
              {pendencias.length > 0 && (
                <div className="aviso" style={{ marginTop: 10 }}>
                  Campos obrigatórios do modelo ainda vazios: {pendencias.join(', ')}. A planilha sai assim mesmo, mas a Intelipost recusa sem eles.
                </div>
              )}
              <div className="linha" style={{ marginTop: 14 }}>
                <button className="btn primario" disabled={!final.faixas.length || salvando} onClick={salvar}>
                  {salvando ? 'Salvando…' : 'Salvar proposta no histórico'}
                </button>
                <button
                  className="btn"
                  disabled={!final.faixas.length}
                  onClick={() => (lembrarParametros(params), exportarIntelipost({ transportadora: transportadora || 'Transportadora', nome: nome || arquivoNome }, final.faixas, params))}
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

const fmtCep = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`

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

/** Prévia das primeiras linhas como sairão na planilha Intelipost (uma linha por faixa de CEP, pesos em colunas). */
function PreviaIntelipost({ faixas, grisMinimo }: { faixas: Parameters<typeof previaIntelipost>[0]; grisMinimo: number | null }) {
  const p = useMemo(() => previaIntelipost(faixas, grisMinimo), [faixas, grisMinimo])
  return (
    <>
      <div className="tabela-wrap" style={{ maxHeight: 340 }}>
        <table>
          <thead>
            <tr>
              {p.cabecalho.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.linhas.map((l, i) => (
              <tr key={i}>
                {l.map((c, j) => (
                  <td key={j} className={typeof c === 'number' ? 'num' : ''}>
                    {typeof c === 'number' && j > 3 ? num(c) : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="suave">
        {num(p.total)} linhas no arquivo{p.total > p.linhas.length ? ` (mostrando ${num(p.linhas.length)})` : ''}. O arquivo baixado segue o modelo oficial PADRÃO INTELIPOST, com todas as colunas, cores e instruções.
      </p>
    </>
  )
}

/** Aplica o prazo padrão às faixas que vieram sem prazo. */
function comPrazo<T extends { prazo_dias: number }>(faixas: T[], prazo: string): T[] {
  const n = Number(prazo)
  return n > 0 ? faixas.map((f) => (f.prazo_dias ? f : { ...f, prazo_dias: n })) : faixas
}

const CAMPO = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 } as const
