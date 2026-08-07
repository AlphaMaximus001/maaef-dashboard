-- ============================================================
-- THE WALL — schema, storage and row level security
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run: it drops and recreates its own objects.
-- ============================================================

-- ---------- tables ----------

create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'pending'
             check (role in ('pending','member','admin','owner')),
  banned     boolean not null default false,
  created_at timestamptz not null default now()
);

-- one pinned link. the unfurled metadata is copied in at pin time so the card
-- keeps reading correctly even after the far end changes or dies.
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  title       text,
  description text,
  site_name   text,
  image_url   text,
  favicon_url text,
  created_by  uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists links_created_idx on public.links(created_at desc);
create index if not exists links_author_idx  on public.links(created_by);

-- anything said about a link: typed note, voice note, or screenshot.
-- media_path points into the private 'wall' storage bucket.
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  link_id     uuid not null references public.links(id) on delete cascade,
  kind        text not null check (kind in ('text','voice','shot')),
  body        text,
  media_path  text,
  duration_ms int,
  created_by  uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists notes_link_idx on public.notes(link_id, created_at);

-- ---------- helper functions ----------
-- security definer so they can read profiles without tripping over the
-- policies that are themselves defined in terms of these functions.

create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending');
$$;

create or replace function public.am_banned()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned from public.profiles where id = auth.uid()), false);
$$;

-- let in: approved and not banned. everything on the wall keys off this.
create or replace function public.is_active()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('member','admin','owner') and not public.am_banned();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin','owner') and not public.am_banned();
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'owner' and not public.am_banned();
$$;

-- ---------- signup trigger ----------
-- The very first account created becomes owner. Everyone after that lands as
-- 'pending' and sees a holding screen until an admin lets them in.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when (select count(*) from public.profiles) = 0 then 'owner' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- guard rails on the user panel ----------
-- Policies decide who may touch the profiles table at all. This trigger
-- decides what a permitted caller is allowed to change, so an admin cannot
-- quietly promote themselves or unseat the owner.

create or replace function public.guard_profile_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- the owner's row is only editable by the owner
  if old.role = 'owner' and auth.uid() <> old.id then
    raise exception 'The owner account cannot be changed by anyone else.';
  end if;

  -- only the owner can hand out the owner role
  if new.role = 'owner' and old.role <> 'owner' and not public.is_owner() then
    raise exception 'Only the owner can make someone else an owner.';
  end if;

  -- nobody locks themselves out by accident
  if new.banned and auth.uid() = old.id then
    raise exception 'You cannot ban yourself.';
  end if;

  -- role and ban state are the only fields the panel may move
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'Identity fields are not editable.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_change on public.profiles;
create trigger on_profile_change
  before update on public.profiles
  for each row execute function public.guard_profile_change();

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.links    enable row level security;
alter table public.notes    enable row level security;

-- profiles: you always see yourself. Everyone let in sees the roster, because
-- every card and note is credited to a person by name.
drop policy if exists profiles_self   on public.profiles;
drop policy if exists profiles_roster on public.profiles;
drop policy if exists profiles_admin  on public.profiles;
create policy profiles_self   on public.profiles for select using (id = auth.uid());
create policy profiles_roster on public.profiles for select using (public.is_active() or public.is_admin());
create policy profiles_admin  on public.profiles for update using (public.is_admin())
                                                  with check (public.is_admin());

-- links: everyone let in reads the whole wall and may pin to it.
-- You may only delete or edit what you pinned. Admins may delete anything.
drop policy if exists links_read   on public.links;
drop policy if exists links_insert on public.links;
drop policy if exists links_update on public.links;
drop policy if exists links_delete on public.links;
create policy links_read   on public.links for select using (public.is_active());
create policy links_insert on public.links for insert
  with check (public.is_active() and created_by = auth.uid());
create policy links_update on public.links for update
  using (public.is_active() and created_by = auth.uid())
  with check (created_by = auth.uid());
create policy links_delete on public.links for delete
  using (public.is_active() and (created_by = auth.uid() or public.is_admin()));

-- notes: same shape. A note lives or dies with its link.
drop policy if exists notes_read   on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;
create policy notes_read   on public.notes for select using (public.is_active());
create policy notes_insert on public.notes for insert
  with check (public.is_active() and created_by = auth.uid());
create policy notes_update on public.notes for update
  using (public.is_active() and created_by = auth.uid())
  with check (created_by = auth.uid());
create policy notes_delete on public.notes for delete
  using (public.is_active() and (created_by = auth.uid() or public.is_admin()));

-- ---------- storage ----------
-- Voice notes and screenshots. Private bucket: files are only ever reachable
-- through short-lived signed URLs handed out to people who are let in.
-- Every object is filed under the uploader's user id, which is what makes
-- "delete your own, not other people's" enforceable on the file side too.

insert into storage.buckets (id, name, public, file_size_limit)
values ('wall', 'wall', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists wall_read   on storage.objects;
drop policy if exists wall_insert on storage.objects;
drop policy if exists wall_delete on storage.objects;
create policy wall_read on storage.objects for select
  using (bucket_id = 'wall' and public.is_active());
create policy wall_insert on storage.objects for insert
  with check (
    bucket_id = 'wall'
    and public.is_active()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy wall_delete on storage.objects for delete
  using (
    bucket_id = 'wall'
    and public.is_active()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ---------- live updates ----------
-- So a card someone else pins appears on your wall without a refresh.
-- Wrapped because re-running the file would otherwise error on "already there".

do $$
begin
  begin
    alter publication supabase_realtime add table public.links;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notes;
  exception when duplicate_object then null;
  end;
end $$;
