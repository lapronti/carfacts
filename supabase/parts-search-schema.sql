-- PartFinder MVP: optionele opgeslagen zoekopdrachten
-- Voer dit script alleen uit in de Supabase SQL Editor van het project dat hiervoor bedoeld is.
-- Dit schema bewaart zoekinstellingen; het haalt geen externe advertenties op.

create table if not exists public.parts_saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  query text not null check (char_length(trim(query)) between 2 and 180),
  country_codes text[] not null default '{}',
  source_keys text[] not null default '{}',
  alerts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parts_saved_searches_user_created_idx
  on public.parts_saved_searches (user_id, created_at desc);

alter table public.parts_saved_searches enable row level security;

drop policy if exists "Users can read own part searches" on public.parts_saved_searches;
create policy "Users can read own part searches"
  on public.parts_saved_searches for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own part searches" on public.parts_saved_searches;
create policy "Users can create own part searches"
  on public.parts_saved_searches for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own part searches" on public.parts_saved_searches;
create policy "Users can update own part searches"
  on public.parts_saved_searches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own part searches" on public.parts_saved_searches;
create policy "Users can delete own part searches"
  on public.parts_saved_searches for delete
  using (auth.uid() = user_id);

comment on table public.parts_saved_searches is
  'PartFinder: saved search preferences only. Does not store third-party listing data.';
