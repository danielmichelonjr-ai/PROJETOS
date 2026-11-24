import { useMemo, useState } from 'react'
import { num } from '../lib/formato'
import { MOTIVOS, normalizar, rotuloMotivo, textoMotivos, type RegrasJadlog, type ResultadoSku } from '../lib/jadlog'
import { baixarXlsx, lerArquivo, type Celula } from '../lib/planilha'

// Consulta de uma lista de SKUs (colada ou importada) contra a base de cadastro e as regras JADLOG.

type Situacao = 'apto' | 'nao' | 'ausente'
interface Consulta {
  sku: string
  x: ResultadoSku | null
  situacao: Situacao
}

const ROTULO: Record<Situacao, string> = { apto: 'Apto', nao: 'Não apto', ausente: 'Não encontrado na base' }

/** Chave de comparação: sem acentos, maiúsculas, sem espaços e sem ".0" de número vindo do Excel. */
const chave = (s: string) => normalizar(s).replace(/\s+/g, '').replace(/\.0+$/, '')
const semZeros = (s: string) => s.replace(/^0+(?=.)/, '')

/** Separa por linha, vírgula, ponto e vírgula ou tabulação, sem repetir. */
function separar(texto: string): string[] {
  const vistos = new Set<string>()
  const lista: string[] = []
  for (const t of texto.split(/[\n\r,;\t]+/)) {
    const sku = t.trim()
    if (!sku || vistos.has(chave(sku))) continue
    vistos.add(chave(sku))
    lista.push(sku)
  }
  return lista
}

const celTexto = (c: Celula | undefined) => (c === null || c === undefined ? '' : typeof c === 'number' && Number.isInteger(c) ? c.toFixed(0) : String(c).trim())

/** Da planilha importada, pega a coluna cujo cabeçalho fala de SKU/código; sem cabeçalho, a primeira coluna preenchida. */
function skusDaPlanilha(linhas: Celula[][]): string[] {
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    const col = (linhas[i] ?? []).findIndex((c) => /\bSKU\b|CODIGO|MODELO/.test(normalizar(c)))
    if (col >= 0) return linhas.slice(i + 1).map((l) => celTexto(l?.[col])).filter(Boolean)
  }
  const col = Math.max(0, (linhas.find((l) => l?.some((c) => celTexto(c))) ?? []).findIndex((c) => celTexto(c)))
  return linhas.map((l) => celTexto(l?.[col])).filter(Boolean)
}

export default function ConsultaJadlog({ resultados, regras }: { resultados: ResultadoSku[]; regras: RegrasJadlog }) {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState<string[]>([])
  const [filtro, setFiltro] = useState<Situacao | null>(null)
  const [msg, setMsg] = useState('')

  const indice = useMemo(() => {
    const m = new Map<string, ResultadoSku>()
    for (const x of resultados) {
      const k = chave(x.s.sku)
      m.set(k, x)
      if (!m.has(semZeros(k))) m.set(semZeros(k), x)
    }
    return m
  }, [resultados])

  const consulta: Consulta[] = useMemo(
    () =>
      lista.map((sku) => {
        const x = indice.get(chave(sku)) ?? indice.get(semZeros(chave(sku))) ?? null
        return { sku, x, situacao: !x ? 'ausente' : x.motivos.size ? 'nao' : 'apto' }
      }),
    [lista, indice],
  )
  const conta = (s: Situacao) => consulta.filter((c) => c.situacao === s).length
  const visiveis = filtro ? consulta.filter((c) => c.situacao === filtro) : consulta

  function validar(t = texto) {
    const l = separar(t)
    setLista(l)
    setFiltro(null)
    setMsg(l.length ? '' : 'Nenhum SKU informado.')
  }

  async function importar(arquivo: File | undefined) {
    if (!arquivo) return
    setMsg(`Lendo ${arquivo.name}…`)
    try {
      const abas = await lerArquivo(arquivo)
      const skus = skusDaPlanilha(abas[0]?.linhas ?? [])
      if (!skus.length) throw new Error('Não encontrei SKUs na primeira aba.')
      const t = skus.join('\n')
      setTexto(t)
      validar(t)
      setMsg(`${num(skus.length)} linhas lidas de ${arquivo.name}.`)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  async function copiar(s: Situacao) {
    const skus = consulta.filter((c) => c.situacao === s).map((c) => c.sku)
    try {
      await navigator.clipboard.writeText(skus.join('\n'))
      setMsg(`${num(skus.length)} SKUs copiados (${ROTULO[s].toLowerCase()}).`)
    } catch {
      setMsg('Não foi possível copiar. Use “Baixar Excel”.')
    }
  }

  async function exportar() {
    const d = new Date()
    const carimbo = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
    await baixarXlsx(`CONSULTA_SKUS_JADLOG_${carimbo}.xlsx`, [
      {
        nome: 'Consulta JADLOG',
        cabecalho: ['SKU consultado', 'Situação JADLOG', 'Descrição', 'Peso Bruto (kg)', 'Qtde Volumes', 'Maior lado (mm)', 'Maior soma A+L+P (mm)', 'Motivos'],
        linhas: consulta.map(({ sku, x, situacao }) => [
          sku,
          ROTULO[situacao],
          x?.s.desc ?? null,
          x && Number.isFinite(x.s.peso) ? x.s.peso : null,
          x?.s.vols.length ?? null,
          x?.maiorLado ?? null,
          x?.maiorSoma ?? null,
          x ? textoMotivos(x, regras) : null,
        ]),
      },
    ])
  }

  const cartoes: [Situacao | null, string, number, string][] = [
    [null, 'SKUs consultados', consulta.length, 'var(--texto)'],
    ['apto', 'Aptos JADLOG', conta('apto'), 'var(--verde)'],
    ['nao', 'Não aptos JADLOG', conta('nao'), 'var(--vermelho)'],
    ['ausente', 'Não encontrados na base', conta('ausente'), 'var(--amarelo)'],
  ]

  return (
    <div className="card">
      <h3>Consultar lista de SKUs</h3>
      <p className="suave">
        Cole os SKUs (um por linha, ou separados por vírgula ou ponto e vírgula) ou importe um Excel/CSV com a coluna de SKU. Cada SKU é
        procurado na base de cadastro acima e avaliado pelas regras JADLOG atuais.
      </p>
      <div className="grade" style={{ gridTemplateColumns: 'minmax(260px, 1fr) minmax(220px, 320px)', alignItems: 'stretch' }}>
        <textarea
          rows={6}
          spellCheck={false}
          placeholder={'Ex.:\n12345\n67890\nABC-001'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Lista de SKUs"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="soltar" style={{ flex: 1, justifyContent: 'center' }}>
            <input type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => (importar(e.target.files?.[0]), (e.target.value = ''))} />
            <strong>Importar Excel ou CSV</strong>
            <span className="suave">Usa a coluna com “SKU” ou “Código” no cabeçalho; sem cabeçalho, a primeira coluna.</span>
          </label>
          <div className="linha" style={{ gap: 8 }}>
            <button className="btn primario" style={{ flex: 1 }} onClick={() => validar()}>
              Validar lista
            </button>
            <button className="btn" onClick={() => (setTexto(''), setLista([]), setMsg(''))}>
              Limpar
            </button>
          </div>
        </div>
      </div>
      {msg && <p className="suave" style={{ marginTop: 10 }}>{msg}</p>}

      {consulta.length > 0 && (
        <>
          <div className="kpis" style={{ marginTop: 16 }}>
            {cartoes.map(([s, rot, n, cor]) => (
              <button
                key={rot}
                className="kpi"
                style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', borderLeft: `4px solid ${cor}`, outline: filtro === s ? '2px solid var(--amarelo)' : undefined }}
                aria-pressed={filtro === s}
                onClick={() => setFiltro(s)}
              >
                <div className="rotulo">{rot}</div>
                <div className="valor" style={{ color: cor }}>{num(n)}</div>
                <div className="suave">{s ? `${num((n / consulta.length) * 100)}% da lista` : 'clique num quadro para filtrar'}</div>
              </button>
            ))}
          </div>
          <div className="linha" style={{ gap: 8, marginBottom: 10 }}>
            <button className="btn" disabled={!conta('apto')} onClick={() => copiar('apto')}>
              Copiar aptos
            </button>
            <button className="btn" disabled={!conta('nao')} onClick={() => copiar('nao')}>
              Copiar não aptos
            </button>
            <button className="btn" disabled={!conta('ausente')} onClick={() => copiar('ausente')}>
              Copiar não encontrados
            </button>
            <button className="btn" onClick={exportar}>
              Baixar Excel da consulta
            </button>
          </div>
          <div className="tabela-wrap" style={{ maxHeight: 520 }}>
            <table>
              <thead>
                <tr>
                  <th>SKU consultado</th>
                  <th>Situação</th>
                  <th>Descrição</th>
                  <th className="num">Peso bruto</th>
                  <th className="num">Maior lado</th>
                  <th className="num">Maior soma</th>
                  <th>Motivos</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(({ sku, x, situacao }) => (
                  <tr key={sku}>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{sku}</td>
                    <td>
                      <span className={`chip ${situacao === 'apto' ? 'ok' : situacao === 'ausente' ? 'alerta' : ''}`}>{ROTULO[situacao]}</span>
                    </td>
                    <td style={{ whiteSpace: 'normal', minWidth: 240, maxWidth: 420 }}>{x?.s.desc ?? '—'}</td>
                    <td className={`num ${x?.motivos.has('PESO') ? 'fora' : ''}`}>
                      {x && Number.isFinite(x.s.peso) ? `${x.s.peso.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg` : '—'}
                    </td>
                    <td className={`num ${x && x.maiorLado >= regras.lado ? 'fora' : ''}`}>{x ? num(x.maiorLado) : '—'}</td>
                    <td className={`num ${x && x.maiorSoma > regras.soma ? 'fora' : ''}`}>{x ? num(x.maiorSoma) : '—'}</td>
                    <td>
                      <div className="linha" style={{ gap: 4 }}>
                        {x &&
                          MOTIVOS.filter((m) => x.motivos.has(m)).map((m) => (
                            <span key={m} className={`chip ${m === 'DADOS' ? 'alerta' : ''}`}>
                              {m === 'TERMO' ? `Termo: ${x.termos.join(', ')}` : rotuloMotivo(m, regras)}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visiveis.length && <p className="suave" style={{ padding: 24, textAlign: 'center' }}>Nenhum SKU nesta visão.</p>}
          </div>
        </>
      )}
    </div>
  )
}
