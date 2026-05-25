-- 0001_rls.sql
-- Row Level Security policy for the "notes" table.
--
-- Layer 1 of the multi-layer defense pattern.
-- The application layer (server actions) is responsible for Layer 2:
-- it re-checks ownership before issuing any mutation, even though
-- this RLS policy would block cross-tenant access anyway.
--
-- Why both? See app/actions/notes.ts header comment and docs/threat-model.md.

-- The notes table. owner_id references auth.users(id).
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for the most common lookup pattern (list notes by owner).
create index if not exists notes_owner_id_idx on public.notes (owner_id);

-- Enable Row Level Security on the notes table.
alter table public.notes enable row level security;

-- Force RLS even for table owners. This prevents accidental bypass
-- when running queries through privileged roles in development.
alter table public.notes force row level security;

-- SELECT: only the owner can read their own notes.
create policy "notes_select_owner"
  on public.notes
  for select
  to authenticated
  using (auth.uid() = owner_id);

-- INSERT: a user may only insert rows where they are the owner.
-- The WITH CHECK clause is what stops "INSERT with someone else's owner_id".
create policy "notes_insert_owner"
  on public.notes
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

-- UPDATE: the owner may update their own row.
-- USING filters which rows are visible for UPDATE.
-- WITH CHECK prevents owner_id from being rewritten to someone else's id.
create policy "notes_update_owner"
  on public.notes
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- DELETE: the owner may delete their own row.
create policy "notes_delete_owner"
  on public.notes
  for delete
  to authenticated
  using (auth.uid() = owner_id);

-- Note: there is intentionally NO policy for the 'anon' role.
-- Unauthenticated callers cannot SELECT / INSERT / UPDATE / DELETE this table.
