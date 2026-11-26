-- Run once in Supabase: SQL Editor > New query > paste > Run
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
