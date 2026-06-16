-- ════════════════════════════════════════════════════════════
-- ZW CLIPPER — Esquema mínimo para colaboración
-- Correr esto en: Supabase Dashboard → SQL Editor → New query → Run
-- ════════════════════════════════════════════════════════════

-- Perfil de usuario (datos extra además de auth.users)
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz default now()
);

-- Proyectos: el estado COMPLETO del proyecto va en la columna data (JSON).
-- Esto refleja exactamente el objeto Project de store.ts, sin reescribir nada.
create table if not exists projects (
  id         text primary key,            -- el id corto actual (ej "yxwg9GGO")
  owner_id   uuid references profiles(id),-- quién lo creó (para el futuro SaaS)
  data       jsonb not null,              -- el objeto Project completo
  updated_at timestamptz default now()
);

create index if not exists projects_updated_idx on projects(updated_at desc);

-- ── Seguridad (RLS): los 2 socios ven y editan todo ──
alter table profiles enable row level security;
alter table projects enable row level security;

-- Cualquier usuario logueado puede leer/escribir (equipo de 2)
drop policy if exists "team_all_projects" on projects;
create policy "team_all_projects" on projects
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "team_read_profiles" on profiles;
create policy "team_read_profiles" on profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "own_profile" on profiles;
create policy "own_profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Crear perfil automáticamente cuando se registra un usuario
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
