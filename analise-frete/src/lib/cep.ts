// Faixas de CEP por UF (Correios) e um CEP representativo de cada capital.
const FAIXAS_UF: [string, number, number][] = [
  ['SP', 1000, 19999],
  ['RJ', 20000, 28999],
  ['ES', 29000, 29999],
  ['MG', 30000, 39999],
  ['BA', 40000, 48999],
  ['SE', 49000, 49999],
  ['PE', 50000, 56999],
  ['AL', 57000, 57999],
  ['PB', 58000, 58999],
  ['RN', 59000, 59999],
  ['CE', 60000, 63999],
  ['PI', 64000, 64999],
  ['MA', 65000, 65999],
  ['PA', 66000, 68899],
  ['AP', 68900, 68999],
  ['AM', 69000, 69299],
  ['RR', 69300, 69399],
  ['AM', 69400, 69899],
  ['AC', 69900, 69999],
  ['DF', 70000, 72799],
  ['GO', 72800, 72999],
  ['DF', 73000, 73699],
  ['GO', 73700, 76799],
  ['RO', 76800, 76999],
  ['TO', 77000, 77999],
  ['MT', 78000, 78899],
  ['MS', 79000, 79999],
  ['PR', 80000, 87999],
  ['SC', 88000, 89999],
  ['RS', 90000, 99999],
]

export const CAPITAIS: { uf: string; cidade: string; cep: string }[] = [
  { uf: 'AC', cidade: 'Rio Branco', cep: '69900100' },
  { uf: 'AL', cidade: 'Maceió', cep: '57020100' },
  { uf: 'AM', cidade: 'Manaus', cep: '69005100' },
  { uf: 'AP', cidade: 'Macapá', cep: '68900100' },
  { uf: 'BA', cidade: 'Salvador', cep: '40020100' },
  { uf: 'CE', cidade: 'Fortaleza', cep: '60060100' },
  { uf: 'DF', cidade: 'Brasília', cep: '70040100' },
  { uf: 'ES', cidade: 'Vitória', cep: '29010100' },
  { uf: 'GO', cidade: 'Goiânia', cep: '74003100' },
  { uf: 'MA', cidade: 'São Luís', cep: '65010100' },
  { uf: 'MG', cidade: 'Belo Horizonte', cep: '30110100' },
  { uf: 'MS', cidade: 'Campo Grande', cep: '79002100' },
  { uf: 'MT', cidade: 'Cuiabá', cep: '78005100' },
  { uf: 'PA', cidade: 'Belém', cep: '66010100' },
  { uf: 'PB', cidade: 'João Pessoa', cep: '58010100' },
  { uf: 'PE', cidade: 'Recife', cep: '50010100' },
  { uf: 'PI', cidade: 'Teresina', cep: '64000100' },
  { uf: 'PR', cidade: 'Curitiba', cep: '80010100' },
  { uf: 'RJ', cidade: 'Rio de Janeiro', cep: '20010100' },
  { uf: 'RN', cidade: 'Natal', cep: '59010100' },
  { uf: 'RO', cidade: 'Porto Velho', cep: '76801100' },
  { uf: 'RR', cidade: 'Boa Vista', cep: '69301100' },
  { uf: 'RS', cidade: 'Porto Alegre', cep: '90010100' },
  { uf: 'SC', cidade: 'Florianópolis', cep: '88010100' },
  { uf: 'SE', cidade: 'Aracaju', cep: '49010100' },
  { uf: 'SP', cidade: 'São Paulo', cep: '01310100' },
  { uf: 'TO', cidade: 'Palmas', cep: '77001100' },
]

export const UFS = CAPITAIS.map((c) => c.uf)

/** Mantém só os dígitos e completa com zeros à esquerda até 8 posições. */
export function normalizarCep(valor: unknown): string {
  const digitos = String(valor ?? '').replace(/\D/g, '')
  if (!digitos) return ''
  return digitos.padStart(8, '0').slice(0, 8)
}

export function ufDoCep(cep: string): string {
  const prefixo = parseInt(normalizarCep(cep).slice(0, 5), 10)
  if (!prefixo) return ''
  const faixa = FAIXAS_UF.find(([, ini, fim]) => prefixo >= ini && prefixo <= fim)
  return faixa ? faixa[0] : ''
}

export function formatarCep(cep: string): string {
  const c = normalizarCep(cep)
  return c ? `${c.slice(0, 5)}-${c.slice(5)}` : ''
}
