// Lê a planilha de pedidos fora da thread principal, para não travar a página com bases grandes.
import { read, utils } from 'xlsx'
import { processarPedidos } from './cotacao'

self.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer; nome: string }>) => {
  try {
    const wb = read(new Uint8Array(e.data.buffer), { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellStyles: false })
    const nomeAba = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'EXPORT') ?? wb.SheetNames[0]
    const linhas = utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[nomeAba], { header: 1, raw: true, defval: null, blankrows: false })
    self.postMessage({ base: processarPedidos(linhas, e.data.nome) })
  } catch (err) {
    self.postMessage({ erro: (err as Error).message || 'Erro ao processar a planilha.' })
  }
}
