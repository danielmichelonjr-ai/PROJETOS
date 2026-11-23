import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // exceljs é carregado sob demanda (só ao ler/gerar planilhas) e passa de 500 kB.
  build: { chunkSizeWarningLimit: 1200 },
})
