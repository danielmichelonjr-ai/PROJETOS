import { useEffect, useMemo, useState } from 'react'
import { salvarBaseJadlog, ultimaBaseJadlog } from '../lib/dados'
import { dataHora, num } from '../lib/formato'
import {
  MOTIVOS,
  REGRAS_PADRAO,
  avaliar,
  normalizar,
  rotuloMotivo,
  textoMotivos,
  type BaseJadlog,
  type Motivo,
  type RegrasJadlog,
  type ResultadoSku,
} from '../lib/jadlog'
import { baixarXlsx } from '../lib/planilha'
import ConsultaJadlog from './ConsultaJadlog'

/** Lê a planilha num Web Worker para não travar a página com bases grandes. */
function lerBaseEmSegundoPlano(arquivo: File): Promise<BaseJadlog> {
  return arquivo.arrayBuffer().then(
    (buffer) =>
      new Promise((ok, falha) => {
        const w = new Worker(new URL('../lib/jadlog.worker.ts', import.meta.url), { type: 'module' })
        w.onmessage = (e: MessageEvent<{ base?: BaseJadlog; erro?: string }>) => {
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

const CHAVE_REGRAS = 'jadlog-regras'
const PAGINA = 200

function regrasSalvas(): RegrasJadlog {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE_REGRAS) ?? 'null')
    if (r && Array.isArray(r.termos)) return { ...REGRAS_PADRAO, ...r }
  } catch {
    // Sem armazenamento: usa as regras padrão.
  }
  return REGRAS_PADRAO
}

const kg = (n: number) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '–')
const mm = (n: number) => (Number.isFinite(n) ? num(n) : '–')
const linhasTexto = (s: string) =>
  s
    .split(/\n|;/)
    .map((t) => normalizar(t).trim())
    .filter(Boolean)

export default function AbaJadlog() {
  const [base, setBase] = useState<BaseJadlog | null>(null)
  const [status, setStatus] = useState<{ tipo: 'ok' | 'carregando' | 'erro'; texto: string }>({ tipo: 'carregando', texto: 'Carregando base…' })
  const [regras, setRegras] = useState<RegrasJadlog>(regrasSalvas)
  const [termosTxt, setTermosTxt] = useState(regras.termos.join('\n'))
  const [excTxt, setExcTxt] = useState(regras.excecoes.join('\n'))
  const [aba, setAba] = useState<'nao' | 'aptos'>('nao')
  const [filtroMotivo, setFiltroMotivo] = useState<Motivo | null>(null)
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(PAGINA)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    ultimaBaseJadlog()
      .then((b) => {
        setBase(b)
        setStatus(b ? { tipo: 'ok', texto: '' } : { tipo: 'carregando', texto: 'Nenhuma base carregada. Envie a planilha de cadastro para começar.' })
      })
      .catch((e) => setStatus({ tipo: 'erro', texto: e.message }))
  }, [])

  function atualizarRegras(r: Partial<RegrasJadlog>) {
    const nova = { ...regras, ...r }
    setRegras(nova)
    try {
      localStorage.setItem(CHAVE_REGRAS, JSON.stringify(nova))
    } catch {
      // Ignora: as regras valem só nesta sessão.
    }
  }

  function restaurar() {
    atualizarRegras(REGRAS_PADRAO)
    setTermosTxt(REGRAS_PADRAO.termos.join('\n'))
    setExcTxt(REGRAS_PADRAO.excecoes.join('\n'))
    mostrarAviso('Regras padrão restauradas')
  }

  function mostrarAviso(t: string) {
    setAviso(t)
    window.setTimeout(() => setAviso(''), 2600)
  }

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return
    setStatus({ tipo: 'carregando', texto: `Processando ${arquivo.name} em segundo plano… bases grandes levam alguns segundos.` })
    try {
      const nova = await lerBaseEmSegundoPlano(arquivo)
      setBase(nova)
      setLimite(PAGINA)
      setStatus({ tipo: 'carregando', texto: 'Salvando base para a equipe…' })
      await salvarBaseJadlog(nova)
      setStatus({ tipo: 'ok', texto: '' })
      mostrarAviso(`Base atualizada: ${num(nova.skus.length)} SKUs`)
    } catch (e) {
      setStatus({ tipo: 'erro', texto: (e as Error).message })
    }
  }

  const resultados = useMemo(() => (base ? avaliar(base, regras) : []), [base, regras])
  const naoAptos = resultados.filter((x) => x.motivos.size)
  const aptos = resultados.length - naoAptos.length
  const total = resultados.length || 1
  const nVolumes = base?.skus.reduce((t, s) => t + s.vols.length, 0) ?? 0

  const visiveis = useMemo(() => {
    const q = normalizar(busca).trim()
    return resultados.filter((x) => {
      if (aba === 'nao' ? !x.motivos.size : x.motivos.size) return false
      if (filtroMotivo && !x.motivos.has(filtroMotivo)) return false
      if (q && !normalizar(x.s.sku).includes(q) && !normalizar(x.s.desc).includes(q)) return false
      return true
    })
  }, [resultados, aba, filtroMotivo, busca])

  async function copiar(sep: string) {
    const texto = naoAptos.map((x) => x.s.sku).join(sep)
    try {
      await navigator.clipboard.writeText(texto)
      mostrarAviso(`${num(naoAptos.length)} SKUs copiados`)
    } catch {
      mostrarAviso('Não foi possível copiar. Use “Baixar Excel”.')
    }
  }

  async function exportar() {
    if (!base) return
    const cab = ['SKU Comercial (Código Modelo)', 'Descrição', 'Peso Bruto (kg)', 'Qtde Volumes', 'Maior lado (mm)', 'Maior soma A+L+P (mm)']
    const linha = (x: ResultadoSku) => [x.s.sku, x.s.desc, Number.isFinite(x.s.peso) ? x.s.peso : null, x.s.vols.length, x.maiorLado, x.maiorSoma]
    const d = new Date()
    const carimbo = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
    await baixarXlsx(`SKUS_NAO_APTOS_JADLOG_${carimbo}.xlsx`, [
      {
        nome: 'Nao Aptos JADLOG',
        cabecalho: [...cab, 'Motivos', 'Volumes fora do padrão'],
        linhas: naoAptos.map((x) => [
          ...linha(x),
          textoMotivos(x, regras),
          x.volumesFora.map((i) => `V${String(i + 1).padStart(2, '0')} ${x.s.vols[i].join('x')}`).join('; '),
        ]),
      },
      { nome: 'Aptos JADLOG', cabecalho: cab, linhas: resultados.filter((x) => !x.motivos.size).map(linha) },
      {
        nome: 'Regras',
        cabecalho: ['Regra', 'Valor'],
        linhas: [
          ['Peso bruto máximo (kg, aceita igual)', regras.peso],
          ['Lado de volume: recusa se ≥ (mm)', regras.lado],
          ['Soma A+L+P máxima (mm, aceita igual)', regras.soma],
          ['Termos bloqueados', regras.termos.join(', ')],
          ['Exceções', regras.excecoes.join(', ')],
          ['Zerado = não apto', regras.zero ? 'Sim' : 'Não'],
          ['Base', base.arquivo],
          ['Gerado em', d.toLocaleString('pt-BR')],
        ],
      },
    ])
  }

  const maxMotivo = Math.max(1, ...MOTIVOS.map((m) => naoAptos.filter((x) => x.motivos.has(m)).length))
  const mostrados = visiveis.slice(0, limite)

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <span className="rotulo">Restrições de transportadora</span>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Validação de SKU's · JADLOG</h2>
        </div>
        <div className="linha" style={{ gap: 8 }}>
          <button className="btn primario" disabled={!naoAptos.length} onClick={() => copiar('\n')}>
            Copiar SKUs não aptos
          </button>
          <button className="btn" disabled={!naoAptos.length} onClick={() => copiar(',')}>
            Copiar separados por vírgula
          </button>
          <button className="btn" disabled={!base} onClick={exportar}>
            Baixar Excel
          </button>
        </div>
      </div>

      <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <div className="card">
          <h3>Base de itens</h3>
          <label className="soltar">
            <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => (enviar(e.target.files?.[0]), (e.target.value = ''))} />
            <strong>Enviar planilha de cadastro (.xlsx)</strong>
            <span className="suave">Clique para escolher o arquivo. A base enviada fica salva para toda a equipe.</span>
          </label>
          <p className={status.tipo === 'erro' ? 'erro' : 'suave'} style={{ marginTop: 10 }}>
            {base && status.tipo === 'ok' ? (
              <>
                <strong style={{ color: 'var(--texto)' }}>{base.arquivo}</strong> · {num(base.skus.length)} SKUs · {num(nVolumes)} volumes ·
                enviada em {dataHora(base.enviada_em)}
              </>
            ) : (
              status.texto
            )}
          </p>
          <div className="linha" style={{ gap: 6, marginBottom: 10 }}>
            {[
              ['SKU comercial', 'C'],
              ['Descrição', 'D'],
              ['Qtde embalagem', 'H'],
              ['Peso bruto', 'J'],
              ['Volume A×L×P', 'X Y Z'],
            ].map(([n, c]) => (
              <span key={n} className="etiqueta">
                {n} <b>{c}</b>
              </span>
            ))}
          </div>
          <p className="suave">
            Cada linha da planilha é um volume. As linhas com o mesmo código modelo formam um SKU. Se qualquer volume falhar,
            o SKU inteiro fica não apto.
          </p>
        </div>

        <div className="card">
          <h3>Regras JADLOG</h3>
          {(
            [
              ['R1', 'Peso bruto do SKU', 'Aceita até o limite (≤)', 'peso', 'kg', 0.1],
              ['R2', 'Maior lado de cada volume', 'Recusa se for igual ou maior (≥)', 'lado', 'mm', 1],
              ['R3', 'Soma A + L + P de cada volume', 'Recusa se passar do limite (>)', 'soma', 'mm', 1],
            ] as const
          ).map(([n, rot, dica, campo, un, passo]) => (
            <div key={n} className="regra">
              <span className="suave">{n}</span>
              <span>
                {rot}
                <br />
                <span className="suave">{dica}</span>
              </span>
              <span className="linha" style={{ gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
                <input
                  type="number"
                  step={passo}
                  min={0}
                  style={{ width: 90, textAlign: 'right' }}
                  value={regras[campo]}
                  onChange={(e) => atualizarRegras({ [campo]: Number(e.target.value) })}
                />
                {un}
              </span>
            </div>
          ))}
          <div className="regra" style={{ borderBottom: 0 }}>
            <span className="suave">R4</span>
            <span>
              Tipo de produto
              <br />
              <span className="suave">Termo na descrição (coluna D). Ignora acentos e aceita plural.</span>
            </span>
            <span />
          </div>
          <div className="grade" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="campo">
              <label>Termos bloqueados (um por linha)</label>
              <textarea
                rows={6}
                spellCheck={false}
                value={termosTxt}
                onChange={(e) => (setTermosTxt(e.target.value), atualizarRegras({ termos: linhasTexto(e.target.value) }))}
              />
            </div>
            <div className="campo">
              <label>Exceções que anulam o termo</label>
              <textarea
                rows={6}
                spellCheck={false}
                placeholder={'Ex.: SEM CUBA\nS/ CUBA\nP/ COOKTOP'}
                value={excTxt}
                onChange={(e) => (setExcTxt(e.target.value), atualizarRegras({ excecoes: linhasTexto(e.target.value) }))}
              />
            </div>
          </div>
          <label style={{ display: 'flex', gap: 8, margin: '12px 0', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={regras.zero} onChange={(e) => atualizarRegras({ zero: e.target.checked })} />
            Considerar não apto quando o peso ou alguma dimensão de volume estiver zerada ou vazia no cadastro
          </label>
          <button className="btn pequeno" onClick={restaurar}>
            Restaurar regras padrão
          </button>
        </div>
      </div>

      {base && <ConsultaJadlog resultados={resultados} regras={regras} />}

      {base && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="rotulo">SKUs analisados</div>
              <div className="valor">{num(resultados.length)}</div>
              <div className="suave">{num(nVolumes)} volumes (linhas)</div>
            </div>
            <div className="kpi" style={{ borderLeft: '4px solid var(--vermelho)' }}>
              <div className="rotulo">Não aptos JADLOG</div>
              <div className="valor" style={{ color: 'var(--vermelho)' }}>
                {num(naoAptos.length)}
              </div>
              <div className="suave">{num((naoAptos.length / total) * 100)}% da base</div>
            </div>
            <div className="kpi" style={{ borderLeft: '4px solid var(--verde)' }}>
              <div className="rotulo">Aptos JADLOG</div>
              <div className="valor" style={{ color: 'var(--verde)' }}>
                {num(aptos)}
              </div>
              <div className="suave">{num((aptos / total) * 100)}% da base</div>
            </div>
          </div>

          <div className="card">
            <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Motivos de recusa</h3>
              <span className="suave">Um SKU pode ter mais de um motivo. Clique para filtrar a lista.</span>
            </div>
            {MOTIVOS.map((m) => {
              const c = naoAptos.filter((x) => x.motivos.has(m)).length
              return (
                <button
                  key={m}
                  className={`motivo ${filtroMotivo === m ? 'ativo' : ''}`}
                  aria-pressed={filtroMotivo === m}
                  onClick={() => {
                    setFiltroMotivo(filtroMotivo === m ? null : m)
                    setAba('nao')
                    setLimite(PAGINA)
                  }}
                >
                  <span>{rotuloMotivo(m, regras)}</span>
                  <span className="barra vermelha">
                    <div style={{ width: `${(c / maxMotivo) * 100}%` }} />
                  </span>
                  <span className="num">{num(c)}</span>
                </button>
              )
            })}
          </div>

          <div className="card">
            <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="linha" style={{ gap: 12, alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>SKUs</h3>
                <div className="alternar">
                  <button className={aba === 'nao' ? 'ativo' : ''} onClick={() => (setAba('nao'), setLimite(PAGINA))}>
                    Não aptos
                  </button>
                  <button className={aba === 'aptos' ? 'ativo' : ''} onClick={() => (setAba('aptos'), setFiltroMotivo(null), setLimite(PAGINA))}>
                    Aptos
                  </button>
                </div>
              </div>
              <input
                type="search"
                placeholder="Buscar SKU ou descrição…"
                style={{ minWidth: 260 }}
                value={busca}
                onChange={(e) => (setBusca(e.target.value), setLimite(PAGINA))}
              />
            </div>
            <p className="suave">
              {num(visiveis.length)} SKUs nesta visão
              {visiveis.length > mostrados.length && ` · mostrando ${num(mostrados.length)}`}
              {filtroMotivo && ' · filtro de motivo ativo (clique de novo para remover)'}
            </p>
            <div className="tabela-wrap" style={{ maxHeight: 640 }}>
              <table>
                <thead>
                  <tr>
                    <th>SKU comercial</th>
                    <th>Descrição</th>
                    <th className="num">Peso bruto</th>
                    <th className="num">Vols</th>
                    <th className="num">Maior lado</th>
                    <th className="num">Maior soma</th>
                    <th>Motivos</th>
                  </tr>
                </thead>
                <tbody>
                  {mostrados.map((x) => (
                    <LinhaSku key={x.s.sku} x={x} regras={regras} />
                  ))}
                </tbody>
              </table>
              {!visiveis.length && <p className="suave" style={{ padding: 24, textAlign: 'center' }}>Nenhum SKU nesta visão.</p>}
            </div>
            {visiveis.length > mostrados.length && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button className="btn" onClick={() => setLimite(limite + PAGINA)}>
                  Mostrar mais 200
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {aviso && <div className="toast">{aviso}</div>}
    </>
  )
}

function LinhaSku({ x, regras }: { x: ResultadoSku; regras: RegrasJadlog }) {
  const s = x.s
  return (
    <tr>
      <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{s.sku}</td>
      <td style={{ whiteSpace: 'normal', minWidth: 280, maxWidth: 440 }}>
        {s.desc}
        {(s.vols.length > 1 || x.volumesFora.length > 0) && (
          <details className="vols">
            <summary>
              {s.vols.length} vol.{x.volumesFora.length > 0 && ` · ${x.volumesFora.length} fora`}
            </summary>
            {s.vols.map((v, i) => (
              <div key={i} className={x.volumesFora.includes(i) ? 'fora' : ''}>
                V{String(i + 1).padStart(2, '0')} {v.map(mm).join(' × ')} mm
              </div>
            ))}
          </details>
        )}
      </td>
      <td className={`num ${x.motivos.has('PESO') ? 'fora' : ''}`}>{kg(s.peso)} kg</td>
      <td className="num">{num(s.vols.length)}</td>
      <td className={`num ${x.maiorLado >= regras.lado ? 'fora' : ''}`}>{mm(x.maiorLado)}</td>
      <td className={`num ${x.maiorSoma > regras.soma ? 'fora' : ''}`}>{mm(x.maiorSoma)}</td>
      <td>
        <div className="linha" style={{ gap: 4 }}>
          {MOTIVOS.filter((m) => x.motivos.has(m)).map((m) => (
            <span key={m} className={`chip ${m === 'DADOS' ? 'alerta' : ''}`}>
              {m === 'TERMO' ? `Termo: ${x.termos.join(', ')}` : rotuloMotivo(m, regras)}
            </span>
          ))}
          {x.divergeQtd && (
            <span className="chip alerta">
              {s.vols.length} de {s.qtd} volumes na base
            </span>
          )}
          {!x.motivos.size && !x.divergeQtd && <span className="chip ok">Apto</span>}
        </div>
      </td>
    </tr>
  )
}
