import type ExcelJS from 'exceljs'
import Papa from 'papaparse'

export type Celula = string | number | null
export interface Aba {
  nome: string
  linhas: Celula[][]
}

function valorDaCelula(cell: ExcelJS.Cell): Celula {
  const v = cell.value as unknown
  if (v === null || v === undefined) return null
  if (typeof v === 'number') {
    // Célula formatada como porcentagem (ex.: 0,3%) chega como 0.003
    if (cell.numFmt && cell.numFmt.includes('%')) return `${v * 100}%`
    return v
  }
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'boolean') return v ? 'SIM' : 'NÃO'
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('result' in o) {
      const r = o.result
      if (typeof r === 'number' && cell.numFmt?.includes('%')) return `${r * 100}%`
      return (r as Celula) ?? null
    }
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('').trim()
    if ('text' in o) return String(o.text).trim()
  }
  return String(v)
}

export async function lerArquivo(arquivo: File): Promise<Aba[]> {
  const nome = arquivo.name.toLowerCase()
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
    const texto = await arquivo.text()
    const res = Papa.parse<string[]>(texto, { skipEmptyLines: true, delimiter: '' })
    return [{ nome: arquivo.name, linhas: res.data.map((l) => l.map((c) => (c === '' ? null : c.trim()))) }]
  }
  if (nome.endsWith('.xls')) {
    throw new Error('Formato .xls antigo não é suportado. Abra no Excel e salve como .xlsx.')
  }
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook()
  await wb.xlsx.load(await arquivo.arrayBuffer())
  const abas: Aba[] = []
  wb.eachSheet((ws) => {
    const linhas: Celula[][] = []
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const linha: Celula[] = []
      for (let c = 1; c <= ws.columnCount; c++) linha.push(valorDaCelula(row.getCell(c)))
      linhas[n - 1] = linha
    })
    for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = []
    abas.push({ nome: ws.name, linhas })
  })
  return abas
}

/** Primeira linha com pelo menos 3 textos preenchidos: provável cabeçalho. */
export function detectarCabecalho(linhas: Celula[][]): number {
  const idx = linhas.findIndex((l) => l.filter((c) => typeof c === 'string' && c.trim() !== '').length >= 3)
  return idx < 0 ? 0 : idx
}

/** Converte números em formato brasileiro ("R$ 1.234,56", "0,30%") para number. */
export function numero(valor: Celula | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0
  if (typeof valor === 'number') return valor
  let s = String(valor).replace(/[R$\s%]/gi, '').replace(/kg/i, '')
  if (!s || s === '-') return 0
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** Extrai o limite superior de peso de um cabeçalho como "Até 10 kg", "5 a 10", "10kg". */
export function pesoDoCabecalho(cabecalho: Celula): number | null {
  const nums = String(cabecalho ?? '')
    .replace(/\./g, '')
    .match(/\d+(,\d+)?/g)
  if (!nums) return null
  return parseFloat(nums[nums.length - 1].replace(',', '.'))
}

export async function baixarXlsx(nomeArquivo: string, abas: { nome: string; cabecalho: string[]; linhas: Celula[][] }[]) {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook()
  for (const a of abas) {
    const ws = wb.addWorksheet(a.nome.slice(0, 31))
    ws.addRow(a.cabecalho)
    ws.getRow(1).font = { bold: true }
    a.linhas.forEach((l) => ws.addRow(l))
    ws.columns.forEach((col, i) => {
      col.width = Math.max(12, Math.min(40, String(a.cabecalho[i] ?? '').length + 4))
    })
  }
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}
