import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import { salvarBaseCotacao, ultimaBaseCotacao, type InfoBaseCotacao } from '../lib/dados'
import { dataHora } from '../lib/formato'
import type { BaseCotacao } from '../lib/cotacao'
import '../lib/cotacaoRelatorio.js'
import template from '../lib/cotacaoTemplate.html?raw'
import './cotacao.css'

type Janela = Window & {
  d3?: typeof d3
  montarRelatorio?: (dados: BaseCotacao, opc: object) => void
  montarComMeses?: (dados: BaseCotacao, opc: object, alvo: HTMLElement, template: string) => void
  __vpResize?: () => void
}
const janela = window as Janela
janela.d3 = d3

/** Lê a planilha num Web Worker para não travar a página com bases grandes. */
function lerPedidosEmSegundoPlano(arquivo: File): Promise<BaseCotacao> {
  return arquivo.arrayBuffer().then(
    (buffer) =>
      new Promise((ok, falha) => {
        const w = new Worker(new URL('../lib/cotacao.worker.ts', import.meta.url), { type: 'module' })
        w.onmessage = (e: MessageEvent<{ base?: BaseCotacao; erro?: string }>) => {
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

const n0 = (n: number) => n.toLocaleString('pt-BR')
const ddmm = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

/** Monta um HTML único (dados + d3 + relatório) que abre no navegador sem login. */
async function gerarHtml(dados: BaseCotacao, mes: string) {
  const [{ default: d3txt }, { default: js }, { default: css }] = await Promise.all([
    import('../../node_modules/d3/dist/d3.min.js?raw'),
    import('../lib/cotacaoRelatorio.js?raw'),
    import('./cotacao.css?raw'),
  ])
  const agora = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const gerado = `${p(agora.getDate())}/${p(agora.getMonth() + 1)}/${agora.getFullYear()} ${p(agora.getHours())}:${p(agora.getMinutes())}`
  const { meta, dic, pedidos } = dados
  const json = JSON.stringify({ meta, dic, pedidos }).replace(/<\//g, '<\\/')
  const html =
    '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Cotação x Faturamento</title>\n<style>\nbody{margin:0;background:#222;color:#f5f5f5}\n' +
    css +
    '\n</style>\n<script>' +
    d3txt.replace(/<\/script/gi, '<\\/script') +
    '<\/script>\n</head>\n<body>\n<div class="cxf" id="cxf-raiz" style="max-width:1320px;margin:0 auto;padding:28px 16px 48px"></div>\n<script>\nconst DATA = ' +
    json +
    ';\nconst TEMPLATE = ' +
    JSON.stringify(template).replace(/<\//g, '<\\/') +
    ';\n' +
    js +
    '\nmontarComMeses(DATA, { arquivo: true, geradoEm: ' +
    JSON.stringify(gerado) +
    ', mesInicial: ' +
    JSON.stringify(mes) +
    ' }, document.getElementById("cxf-raiz"), TEMPLATE);\n<\/script>\n</body>\n</html>\n'
  const nome = 'Cotacao_x_Faturamento_' + String(meta.fonte || 'pedidos').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_') + '.html'
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return nome
}

/** Mês escolhido nos botões; fica guardado ao trocar de aba. */
const memoria = { mes: '' }

type Msg = { tipo: '' | 'info' | 'previa' | 'ok' | 'erro'; texto: string }

export default function AbaCotacao({ email }: { email: string }) {
  const [atual, setAtual] = useState<{ base: BaseCotacao; info: InfoBaseCotacao } | null>(null)
  const [previa, setPrevia] = useState<BaseCotacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [msg, setMsg] = useState<Msg>({ tipo: '', texto: '' })
  const [msgHtml, setMsgHtml] = useState<Msg>({ tipo: '', texto: '' })
  const [ocupado, setOcupado] = useState(false)
  const relatorio = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ultimaBaseCotacao()
      .then(setAtual)
      .catch((e) => setErroCarga(e.message))
      .finally(() => setCarregando(false))
  }, [])

  const dados = previa ?? atual?.base ?? null

  // O relatório é montado direto no DOM (d3), fora do controle do React.
  useEffect(() => {
    const el = relatorio.current
    if (!el || !dados) return
    try {
      janela.montarComMeses!(dados, { mesInicial: memoria.mes, aoMudarMes: (m: string) => (memoria.mes = m) }, el, template)
    } catch (e) {
      el.textContent = 'Não foi possível montar o relatório: ' + (e as Error).message
    }
    return () => {
      if (janela.__vpResize) removeEventListener('resize', janela.__vpResize)
      el.innerHTML = ''
    }
  }, [dados])

  async function escolherArquivo(f: File | undefined) {
    if (!f) return
    setMsg({ tipo: 'info', texto: `Processando ${f.name} em segundo plano…` })
    setPrevia(null)
    setOcupado(true)
    try {
      const b = await lerPedidosEmSegundoPlano(f)
      const m = b.meta
      setPrevia(b)
      setMsg({
        tipo: 'previa',
        texto: `Prévia de ${f.name}: ${n0(m.pedidos)} pedidos (${n0(m.cancelados)} cancelados fora da contagem), de ${ddmm(m.primeiro)} a ${ddmm(m.ultimoDia)}, dados até ${m.ultimo}. Confira abaixo e clique em "Atualizar relatório" para publicar para a equipe.`,
      })
    } catch (e) {
      setMsg({ tipo: 'erro', texto: 'Não deu para usar essa planilha: ' + (e as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  async function publicar() {
    if (!previa) return
    setOcupado(true)
    setMsg({ tipo: 'info', texto: 'Salvando a base nova para a equipe…' })
    try {
      await salvarBaseCotacao(previa, email)
      setAtual({ base: previa, info: { arquivo: previa.meta.fonte, enviada_em: new Date().toISOString(), enviada_por: email } })
      setPrevia(null)
      setMsg({ tipo: 'ok', texto: 'Relatório atualizado. Todos que abrirem o sistema já veem a base nova.' })
    } catch (e) {
      setMsg({ tipo: 'erro', texto: 'Não foi possível salvar a base nova (' + (e as Error).message + '). Tente de novo.' })
    } finally {
      setOcupado(false)
    }
  }

  function cancelar() {
    setPrevia(null)
    setMsg({ tipo: '', texto: '' })
  }

  async function baixarHtml() {
    if (!dados) return
    setMsgHtml({ tipo: 'info', texto: 'Gerando o arquivo…' })
    try {
      const nome = await gerarHtml(dados, memoria.mes)
      setMsgHtml({ tipo: 'ok', texto: `Arquivo ${nome} gerado.` })
    } catch (e) {
      setMsgHtml({ tipo: 'erro', texto: 'Não foi possível gerar o arquivo (' + (e as Error).message + ').' })
    }
  }

  const info = atual?.info
  const meta = atual?.base.meta
  return (
    <>
      <h2>Cotação x Faturamento</h2>
      <div className="card cxf-barra">
        <div className="linha" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Base de pedidos</div>
            <div className="suave">
              {carregando
                ? 'Carregando a base…'
                : erroCarga
                  ? <span className="erro">{erroCarga}</span>
                  : info && meta
                    ? `Base atual: ${info.arquivo} · ${n0(meta.pedidos)} pedidos · dados até ${meta.ultimo} · atualizada em ${dataHora(info.enviada_em)}${info.enviada_por ? ' por ' + info.enviada_por : ''}`
                    : 'Nenhuma base carregada ainda.'}
            </div>
          </div>
          <div className="linha" style={{ alignItems: 'center' }}>
            <label className="btn" aria-disabled={ocupado}>
              Enviar planilha (.xlsx)
              <input
                type="file"
                accept=".xlsx,.xls"
                hidden
                disabled={ocupado}
                onChange={(e) => {
                  escolherArquivo(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            {previa && (
              <>
                <button className="btn primario" onClick={publicar} disabled={ocupado}>
                  Atualizar relatório
                </button>
                <button className="btn" onClick={cancelar} disabled={ocupado}>
                  Cancelar
                </button>
              </>
            )}
            <button className="btn" onClick={baixarHtml} disabled={!dados}>
              Gerar arquivo HTML
            </button>
          </div>
        </div>
        {msg.texto && <p className={`bmsg ${msg.tipo}`}>{msg.texto}</p>}
        {previa?.avisos && previa.avisos.length > 0 && (
          <ul className="avisos">
            {previa.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        {msgHtml.texto && <p className={`bmsg ${msgHtml.tipo}`}>{msgHtml.texto}</p>}
        <p className="suave" style={{ margin: 0 }}>
          A planilha é a exportação de pedidos (aba Export). "Gerar arquivo HTML" baixa o relatório como está na tela, num arquivo único que abre
          no navegador sem login, para enviar por e-mail ou Teams.
        </p>
      </div>
      {!dados && !carregando && !erroCarga && <div className="card suave">Envie a planilha de pedidos no campo acima para montar o relatório.</div>}
      <div ref={relatorio} className={`cxf ${previa ? 'em-previa' : ''}`} />
    </>
  )
}
