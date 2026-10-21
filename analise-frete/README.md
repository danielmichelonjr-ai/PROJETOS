# Multimóveis · Sistema de Análise de Frete

Aplicação web com login para:

1. **Competitividade de frete**: compara as propostas das transportadoras simulando envios
   (capitais × pesos, uma base real de pedidos em planilha, ou uma cotação única) e mostra ranking,
   custo médio por UF, detalhe por envio e histórico de análises.
2. **Importar propostas · Intelipost**: lê a planilha da transportadora (.xlsx ou .csv, uma faixa por
   linha ou faixas de peso em colunas), mapeia as colunas para o modelo padrão, salva no histórico e
   gera a planilha no modelo Intelipost.

Tecnologia: React + Vite (front-end), Supabase (login e banco de dados), Vercel (hospedagem e link).

## Como colocar no ar (tudo pelo navegador)

### 1. Supabase (banco + login)

1. Crie uma conta em <https://supabase.com> e clique em **New project** (região: São Paulo).
2. No projeto, abra **SQL Editor → New query**, cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**
   (assim só entra quem você cadastrar).
4. Em **Authentication → Users → Add user → Create new user**, cadastre o e-mail e a senha de cada
   pessoa da equipe (marque *Auto Confirm User*).
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.

### 2. Vercel (gera o link de acesso)

1. Entre em <https://vercel.com> com a conta do GitHub.
2. **Add New → Project**, importe o repositório `PROJETOS`.
3. Em **Root Directory**, escolha `analise-frete`. O framework (Vite) é detectado sozinho.
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = chave anon public
5. Clique em **Deploy**. O link fica no formato `https://<nome>.vercel.app`.
6. De volta ao Supabase, em **Authentication → URL Configuration**, coloque esse link em
   **Site URL** (necessário para o "Esqueci minha senha").

Cada alteração enviada ao GitHub publica uma nova versão automaticamente.

Sem as variáveis do Supabase o sistema abre em **modo demonstração**: qualquer e-mail entra e os
dados ficam só no navegador, útil para testar.

## Regras de cálculo do frete

Para cada envio (CEP ou UF, peso, valor da NF) e cada proposta:

- Encontra as faixas do destino pelo intervalo de CEP; se a proposta for só por UF, pela UF do CEP.
- Escolhe a faixa de peso; acima da última faixa soma `kg excedente × (peso − peso final)`.
- `total = máx(frete mínimo, frete peso + excedente + ad valorem% × NF + GRIS% × NF + pedágio × frações de 100 kg + taxa fixa)`

## Modelo Intelipost

As colunas geradas ficam em [`src/lib/intelipost.ts`](src/lib/intelipost.ts). O layout atual é
provisório e deve ser ajustado ao modelo oficial usado pela Multimóveis.

## Desenvolvimento local

```bash
cd analise-frete
npm install
cp .env.example .env.local   # opcional: sem ele roda em modo demonstração
npm run dev
```
