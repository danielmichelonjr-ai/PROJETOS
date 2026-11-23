const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export const moeda = (n: number) => moedaFmt.format(n || 0)
export const num = (n: number) => numFmt.format(n || 0)
export const pct = (n: number) => `${numFmt.format(n || 0)}%`
export const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')
export const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR')
