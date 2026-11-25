import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Depois de uma publicação nova, uma página que já estava aberta pede arquivos da versão anterior,
// que não existem mais ("Failed to fetch dynamically imported module"). Nesse caso recarrega a página
// uma vez para pegar a versão atual, em vez de mostrar o erro.
const CHAVE_RECARGA = 'recarregou-por-versao-nova'
function recarregarParaVersaoNova(e?: Event) {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE_RECARGA) ?? 0)
    if (Date.now() - ultima < 30_000) return // já recarregou há pouco: deixa o erro aparecer
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()))
  } catch {
    // sem sessionStorage: recarrega mesmo assim
  }
  e?.preventDefault()
  window.location.reload()
}
window.addEventListener('vite:preloadError', recarregarParaVersaoNova)
window.addEventListener('unhandledrejection', (e) => {
  if (/dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(String(e.reason?.message ?? e.reason))) recarregarParaVersaoNova(e)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
