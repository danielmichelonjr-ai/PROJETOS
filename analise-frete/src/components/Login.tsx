import { useState, type FormEvent } from 'react'
import { entrar, modoDemo, recuperarSenha, type Usuario } from '../lib/dados'

export default function Login({ aoEntrar }: { aoEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      aoEntrar(await entrar(email.trim(), senha))
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function esqueci() {
    if (!email.trim()) return setErro('Informe o e-mail para receber o link de redefinição.')
    try {
      await recuperarSenha(email.trim())
      setInfo('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.')
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  return (
    <div className="login">
      <div className="card">
        <img src="/logo-multimoveis.png" alt="Multimóveis 30 anos" />
        <h2>Análise de Frete</h2>
        <p className="suave">Acesso restrito à equipe Multimóveis.</p>
        <form onSubmit={enviar}>
          <div className="campo">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required={!modoDemo} />
          </div>
          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required={!modoDemo} />
          </div>
          {erro && <p className="erro">{erro}</p>}
          {info && <p className="suave">{info}</p>}
          <button className="btn primario" disabled={enviando}>
            {enviando ? 'Entrando…' : modoDemo ? 'Entrar (demonstração)' : 'Entrar'}
          </button>
          {!modoDemo && (
            <button type="button" className="btn pequeno" onClick={esqueci}>
              Esqueci minha senha
            </button>
          )}
          {modoDemo && <p className="aviso">Supabase ainda não configurado: qualquer e-mail entra em modo demonstração.</p>}
        </form>
      </div>
    </div>
  )
}
