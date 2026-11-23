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
