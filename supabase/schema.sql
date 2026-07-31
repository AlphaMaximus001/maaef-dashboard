-- ============================================================
-- UP Irrigation Posting Directory — schema + row level security
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run: it drops and recreates its own objects.
-- ============================================================

-- ---------- tables ----------

create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'pending'
             check (role in ('pending','viewer','admin','superadmin')),
  created_at timestamptz not null default now()
);

create table if not exists public.wings (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  color      text not null default '#2E5D62',
  sort_order int  not null default 0
);

create table if not exists public.offices (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  type       text not null check (type in ('head','zone','circle','district','subdistrict')),
  parent_id  uuid references public.offices(id) on delete cascade,
  wing_id    uuid references public.wings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists offices_parent_idx on public.offices(parent_id);

create table if not exists public.posts (
  id        uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  title     text,
  phone     text,
  notes     text
);
create index if not exists posts_office_idx on public.posts(office_id);

create table if not exists public.employees (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  designation text,
  phone       text,
  notes       text,
  post_id     uuid references public.posts(id) on delete set null
);
create index if not exists employees_post_idx on public.employees(post_id);

-- posting history. post_title / office_path are denormalised on purpose so a
-- record survives the post or office being deleted later.
create table if not exists public.postings (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete set null,
  post_title  text,
  office_path text,
  from_date   date not null default current_date,
  to_date     date
);
create index if not exists postings_emp_idx on public.postings(employee_id);

-- a grant on one office. it cascades down to every office beneath it.
create table if not exists public.user_scopes (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  unique (user_id, office_id)
);
create index if not exists user_scopes_user_idx on public.user_scopes(user_id);

-- ---------- helper functions ----------

-- current caller's role, or 'pending' if they have no profile yet
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending');
$$;

-- every office from oid up to the root, inclusive
create or replace function public.office_ancestors(oid uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive up as (
    select id, parent_id from public.offices where id = oid
    union all
    select o.id, o.parent_id from public.offices o join up on o.id = up.parent_id
  )
  select id from up;
$$;

-- can the caller see this office?
--   superadmin / admin : everything
--   viewer             : only if one of their scopes is this office or an ancestor of it
--   pending            : nothing
create or replace function public.can_see_office(oid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() in ('admin','superadmin') then true
    when public.my_role() = 'viewer' then exists (
      select 1 from public.user_scopes s
      where s.user_id = auth.uid()
        and s.office_id in (select public.office_ancestors(oid))
    )
    else false
  end;
$$;

create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin','superadmin');
$$;

create or replace function public.is_superadmin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'superadmin';
$$;

-- ---------- signup trigger ----------
-- The very first account created becomes superadmin. Everyone after that
-- lands as 'pending' and sees a holding screen until you approve them.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when (select count(*) from public.profiles) = 0 then 'superadmin' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row level security ----------

alter table public.profiles    enable row level security;
alter table public.wings       enable row level security;
alter table public.offices     enable row level security;
alter table public.posts       enable row level security;
alter table public.employees   enable row level security;
alter table public.postings    enable row level security;
alter table public.user_scopes enable row level security;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_self   on public.profiles;
create policy profiles_self   on public.profiles for select using (id = auth.uid());
create policy profiles_read   on public.profiles for select using (public.is_superadmin());
create policy profiles_update on public.profiles for update using (public.is_superadmin())
                                                    with check (public.is_superadmin());

drop policy if exists wings_read on public.wings;
drop policy if exists wings_write on public.wings;
create policy wings_read  on public.wings for select using (public.my_role() <> 'pending');
create policy wings_write on public.wings for all using (public.is_editor())
                                              with check (public.is_editor());

drop policy if exists offices_read on public.offices;
drop policy if exists offices_write on public.offices;
create policy offices_read  on public.offices for select using (public.can_see_office(id));
create policy offices_write on public.offices for all using (public.is_editor())
                                                with check (public.is_editor());

drop policy if exists posts_read on public.posts;
drop policy if exists posts_write on public.posts;
create policy posts_read  on public.posts for select using (public.can_see_office(office_id));
create policy posts_write on public.posts for all using (public.is_editor())
                                              with check (public.is_editor());

-- Viewers see a person only while that person sits on a post inside their scope.
-- Benched people are visible to editors only.
drop policy if exists employees_read on public.employees;
drop policy if exists employees_write on public.employees;
create policy employees_read on public.employees for select using (
  public.is_editor()
  or (post_id is not null
      and public.can_see_office((select p.office_id from public.posts p where p.id = post_id)))
);
create policy employees_write on public.employees for all using (public.is_editor())
                                                  with check (public.is_editor());

-- history follows whatever the caller can see of the person
drop policy if exists postings_read on public.postings;
drop policy if exists postings_write on public.postings;
create policy postings_read on public.postings for select using (
  exists (select 1 from public.employees e where e.id = employee_id)
);
create policy postings_write on public.postings for all using (public.is_editor())
                                                 with check (public.is_editor());

drop policy if exists scopes_own on public.user_scopes;
drop policy if exists scopes_admin on public.user_scopes;
create policy scopes_own   on public.user_scopes for select using (user_id = auth.uid());
create policy scopes_admin on public.user_scopes for all using (public.is_superadmin())
                                                  with check (public.is_superadmin());

-- ---------- starting data ----------

insert into public.wings (label, color, sort_order)
select * from (values
  ('Civil',   '#2E5D62', 1),
  ('E&M',     '#4A4A8A', 2),
  ('Revenue', '#7C7A4A', 3)
) as v(label, color, sort_order)
where not exists (select 1 from public.wings);

insert into public.offices (name, type, parent_id)
select 'Head Office — Irrigation & Water Resources Dept, Lucknow', 'head', null
where not exists (select 1 from public.offices where type = 'head');
