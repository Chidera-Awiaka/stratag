-- Run once in Supabase: SQL Editor > New query > paste > Run
create table if not exists public.plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.plans enable row level security;
drop policy if exists "own plan" on public.plans;
create policy "own plan" on public.plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
