// Lê a planilha de cadastro fora da thread principal: arquivos com dezenas de
// milhares de linhas travavam a página ("Página sem resposta").
import { read, utils } from 'xlsx'
import { ERRO_SEM_CADASTRO, acharCabecalho, montarBase, ordenarAbas } from './jadlog'
import type { Celula } from './planilha'

self.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer; nome: string }>) => {
  try {
    const wb = read(new Uint8Array(e.data.buffer), { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellStyles: false })
    for (const nomeAba of ordenarAbas(wb.SheetNames)) {
      const linhas = utils.sheet_to_json<Celula[]>(wb.Sheets[nomeAba], { header: 1, raw: true, defval: null, blankrows: false })
      const cab = acharCabecalho(linhas)
      if (cab >= 0) {
        self.postMessage({ base: montarBase(linhas, cab, e.data.nome, nomeAba) })
        return
      }
    }
    throw new Error(ERRO_SEM_CADASTRO)
  } catch (err) {
    self.postMessage({ erro: (err as Error).message || 'Erro ao processar a planilha.' })
  }
}
