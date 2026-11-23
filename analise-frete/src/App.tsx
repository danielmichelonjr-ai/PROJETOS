import { useEffect, useState } from 'react'
import AbaCompetitividade from './components/AbaCompetitividade'
import AbaImportacao from './components/AbaImportacao'
import AbaJadlog from './components/AbaJadlog'
import Login from './components/Login'
import { aoMudarSessao, definirSenha, modoDemo, sair, usuarioAtual, type Usuario } from './lib/dados'

type Aba = 'competitividade' | 'importacao' | 'jadlog'

const MENU: { id: Aba; rotulo: string }[] = [
  { id: 'competitividade', rotulo: 'Competitividade de frete' },
  { id: 'importacao', rotulo: 'Importar propostas · Intelipost' },
  { id: 'jadlog', rotulo: "Validação SKU's Jadlog" },
]

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('competitividade')
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    usuarioAtual().then((u) => {
      setUsuario(u)
      setCarregando(false)
    })
    return aoMudarSessao((u, recuperandoSenha) => {
      setUsuario(u)
      if (recuperandoSenha) setRecuperando(true)
    })
  }, [])

  if (carregando) return null
  if (!usuario) return <Login aoEntrar={setUsuario} />
  if (recuperando) return <NovaSenha aoConcluir={() => setRecuperando(false)} />

  return (
    <>
      {modoDemo && (
        <div className="faixa-demo">
          Modo demonstração: Supabase não configurado, os dados ficam salvos só neste navegador.
        </div>
      )}
      <header className="topo">
        <img src="/logo-multimoveis.png" alt="Multimóveis 30 anos" />
        <div className="usuario">
          {usuario.email}
          <button
            className="btn pequeno"
            onClick={async () => {
              await sair()
              setUsuario(null)
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <div className="layout">
        <nav className="menu" aria-label="Menu principal">
          {MENU.map((m) => (
            <button key={m.id} className={`menu-item ${aba === m.id ? 'ativo' : ''}`} onClick={() => setAba(m.id)}>
              {m.rotulo}
            </button>
          ))}
        </nav>
        <main>
          {aba === 'competitividade' && <AbaCompetitividade irParaImportacao={() => setAba('importacao')} />}
          {aba === 'importacao' && <AbaImportacao />}
          {aba === 'jadlog' && <AbaJadlog />}
        </main>
      </div>
    </>
  )
}

function NovaSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  return (
    <div className="login">
      <div className="card">
        <img src="/logo-multimoveis.png" alt="Multimóveis 30 anos" />
        <h2>Definir nova senha</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (senha.length < 8) return setErro('Use ao menos 8 caracteres.')
            try {
              await definirSenha(senha)
              aoConcluir()
            } catch (err) {
              setErro((err as Error).message)
            }
          }}
        >
          <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha" />
          {erro && <p className="erro">{erro}</p>}
          <button className="btn primario">Salvar senha</button>
        </form>
      </div>
    </div>
  )
}
