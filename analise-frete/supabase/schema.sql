-- Sistema de Análise de Frete · Multimóveis
-- Rode este script uma vez no Supabase: SQL Editor > New query > colar > Run.

create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  transportadora text not null,
  nome text not null,
  vigencia_inicio date,
  vigencia_fim date,
  arquivo_nome text,
  observacoes text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.proposta_faixas (
  id bigint generated always as identity primary key,
  proposta_id uuid not null references public.propostas (id) on delete cascade,
  uf_destino text not null default '',
  cidade text not null default '',
  cep_inicial text not null default '',
  cep_final text not null default '',
  peso_inicial numeric not null default 0,
  peso_final numeric not null default 0,
  valor_frete numeric not null default 0,
  valor_kg_excedente numeric not null default 0,
  frete_minimo numeric not null default 0,
  ad_valorem_pct numeric not null default 0,
  gris_pct numeric not null default 0,
  pedagio numeric not null default 0,
  taxa_fixa numeric not null default 0,
  prazo_dias numeric not null default 0
);
create index if not exists proposta_faixas_proposta_idx on public.proposta_faixas (proposta_id);

create table if not exists public.analises (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  parametros jsonb,
  resultado jsonb,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- Segurança: só usuários logados acessam. Toda a equipe enxerga os mesmos dados.
alter table public.propostas enable row level security;
alter table public.proposta_faixas enable row level security;
alter table public.analises enable row level security;

drop policy if exists "equipe" on public.propostas;
create policy "equipe" on public.propostas for all to authenticated using (true) with check (true);
drop policy if exists "equipe" on public.proposta_faixas;
create policy "equipe" on public.proposta_faixas for all to authenticated using (true) with check (true);
drop policy if exists "equipe" on public.analises;
create policy "equipe" on public.analises for all to authenticated using (true) with check (true);

-- Projetos novos do Supabase não concedem acesso às tabelas automaticamente.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.propostas, public.proposta_faixas, public.analises to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Validação de SKUs JADLOG: guarda as bases de cadastro enviadas (a mais recente é a usada).
create table if not exists public.jadlog_bases (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  total_skus integer,
  total_volumes integer,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create table if not exists public.jadlog_base_lotes (
  id bigint generated always as identity primary key,
  base_id uuid not null references public.jadlog_bases (id) on delete cascade,
  parte integer not null,
  skus jsonb not null
);
create index if not exists jadlog_base_lotes_base_idx on public.jadlog_base_lotes (base_id);

alter table public.jadlog_bases enable row level security;
alter table public.jadlog_base_lotes enable row level security;
drop policy if exists "equipe" on public.jadlog_bases;
create policy "equipe" on public.jadlog_bases for all to authenticated using (true) with check (true);
drop policy if exists "equipe" on public.jadlog_base_lotes;
create policy "equipe" on public.jadlog_base_lotes for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.jadlog_bases, public.jadlog_base_lotes to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Cotação x Faturamento: guarda a última base de pedidos enviada (aba Export), em lotes.
create table if not exists public.cotacao_bases (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  total_pedidos integer,
  cancelados integer,
  meta jsonb not null,
  dic jsonb not null,
  enviado_por text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create table if not exists public.cotacao_base_lotes (
  id bigint generated always as identity primary key,
  base_id uuid not null references public.cotacao_bases (id) on delete cascade,
  parte integer not null,
  pedidos jsonb not null
);
create index if not exists cotacao_base_lotes_base_idx on public.cotacao_base_lotes (base_id);

alter table public.cotacao_bases enable row level security;
alter table public.cotacao_base_lotes enable row level security;
drop policy if exists "equipe" on public.cotacao_bases;
create policy "equipe" on public.cotacao_bases for all to authenticated using (true) with check (true);
drop policy if exists "equipe" on public.cotacao_base_lotes;
create policy "equipe" on public.cotacao_base_lotes for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.cotacao_bases, public.cotacao_base_lotes to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Base de cidades por faixa de CEP (nomes da coluna CIDADE na tabela Intelipost). Só a mais recente é mantida.
create table if not exists public.cidades_bases (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  linhas jsonb not null,
  enviado_por text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.cidades_bases enable row level security;
drop policy if exists "equipe" on public.cidades_bases;
create policy "equipe" on public.cidades_bases for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.cidades_bases to authenticated;

-- Competitividade de frete: base de pedidos (60–90 dias) usada para recotar pela tabela em análise. Só a mais recente é mantida.
create table if not exists public.pedidos_bases (
  id uuid primary key default gen_random_uuid(),
  arquivo text not null,
  total_pedidos integer,
  meta jsonb not null,
  dic jsonb not null,
  enviado_por text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create table if not exists public.pedidos_base_lotes (
  id bigint generated always as identity primary key,
  base_id uuid not null references public.pedidos_bases (id) on delete cascade,
  parte integer not null,
  pedidos jsonb not null
);
create index if not exists pedidos_base_lotes_base_idx on public.pedidos_base_lotes (base_id);
alter table public.pedidos_bases enable row level security;
alter table public.pedidos_base_lotes enable row level security;
drop policy if exists "equipe" on public.pedidos_bases;
create policy "equipe" on public.pedidos_bases for all to authenticated using (true) with check (true);
drop policy if exists "equipe" on public.pedidos_base_lotes;
create policy "equipe" on public.pedidos_base_lotes for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.pedidos_bases, public.pedidos_base_lotes to authenticated;
grant usage, select on all sequences in schema public to authenticated;
