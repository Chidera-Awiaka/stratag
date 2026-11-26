-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  mood text,
  message text not null check (char_length(message) between 1 and 3000),
  page text,
  ua text
);
alter table public.feedback enable row level security;
-- anyone can send feedback, nobody can read it through the app (you read it in the Supabase Table Editor)
drop policy if exists "send feedback" on public.feedback;
create policy "send feedback" on public.feedback for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- ── Feedback dashboard (stratag-dusky.vercel.app/admin) ─────────────────────────────
-- Only people listed in `admins` can read feedback, and mark it handled.
alter table public.feedback add column if not exists handled boolean not null default false;

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;
drop policy if exists "see own admin row" on public.admins;
create policy "see own admin row" on public.admins for select to authenticated using (user_id = auth.uid());

drop policy if exists "admins read feedback" on public.feedback;
create policy "admins read feedback" on public.feedback for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
drop policy if exists "admins update feedback" on public.feedback;
create policy "admins update feedback" on public.feedback for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- Make yourself an admin: put the email you sign in to StratAG with between the quotes.
insert into public.admins (user_id)
  select id from auth.users where email = 'YOUR-EMAIL-HERE'
  on conflict do nothing;
