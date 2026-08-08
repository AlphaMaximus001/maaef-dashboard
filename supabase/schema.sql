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

-- ============================================================
-- posting operations
--
-- Posting somebody, benching them, moving a card and deleting things each need
-- several writes that only make sense together: close the old term, move the
-- person, open the new term. Done from the browser as separate calls, a dropped
-- connection half way leaves a person on a post with no open posting, or an
-- office deleted with its people still attached to cards that no longer exist.
-- Each operation is one function, so it is one transaction: all of it happens or
-- none of it does. It also means the change log sees one action rather than
-- three unrelated rows, so a whole transfer can be reverted in a single click.
--
-- These are security INVOKER on purpose. Row level security still applies to
-- every statement inside them, so they can never become a way round it; the
-- is_editor() check on top is there to fail loudly rather than silently write
-- nothing.
-- ============================================================

-- The office path exactly as the UI writes it, for the copy kept on a posting.
create or replace function public.office_path(oid uuid)
returns text
language sql stable set search_path = public as $$
  with recursive up as (
    select id, parent_id, name, type, 1 as depth
      from public.offices where id = oid
    union all
    select o.id, o.parent_id, o.name, o.type, up.depth + 1
      from public.offices o join up on o.id = up.parent_id
  )
  select string_agg(
           coalesce(nullif(btrim(up.name), ''), 'Untitled ' || lower(l.label)),
           ' › ' order by up.depth desc)
    from up
    join (values ('head','Head Office'), ('zone','Zone'), ('circle','Circle'),
                 ('district','District'), ('subdistrict','Sub-district office'))
      as l(t, label) on l.t = up.type;
$$;

-- An officer holds one post at a time, so at most one term is ever open. Close
-- every open one anyway: if older data ever left two behind, this tidies it.
create or replace function public.close_open_term(emp uuid, on_date date)
returns void
language plpgsql set search_path = public as $$
begin
  update public.postings set to_date = on_date
   where employee_id = emp and to_date is null;
end;
$$;

create or replace function public.bench_employee(emp uuid, on_date date default current_date)
returns void
language plpgsql set search_path = public as $$
begin
  if not public.is_editor() then
    raise exception 'Only an admin or superadmin can change postings';
  end if;
  perform public.close_open_term(emp, on_date);
  update public.employees set post_id = null where id = emp;
end;
$$;

create or replace function public.assign_employee(emp uuid, post uuid, on_date date default current_date)
returns void
language plpgsql set search_path = public as $$
declare p public.posts;
begin
  if not public.is_editor() then
    raise exception 'Only an admin or superadmin can change postings';
  end if;

  select * into p from public.posts where id = post;
  if not found then raise exception 'That department card no longer exists'; end if;
  if not exists (select 1 from public.employees where id = emp) then
    raise exception 'That person no longer exists';
  end if;

  -- already sitting there: nothing happened, so record nothing
  if exists (select 1 from public.employees where id = emp and post_id = post) then
    return;
  end if;

  -- one named post, one holder. Skipped when the card has no title, since
  -- there is then nothing to say two people are duplicating.
  if btrim(coalesce(p.title, '')) <> ''
     and exists (select 1 from public.employees where post_id = post and id <> emp) then
    raise exception 'Blocked: somebody already holds that card';
  end if;

  perform public.close_open_term(emp, on_date);
  update public.employees set post_id = post where id = emp;
  insert into public.postings (employee_id, post_id, post_title, office_path, from_date)
  values (emp, post, p.title, public.office_path(p.office_id), on_date);
end;
$$;

-- corrected = true  : the card was only ever filed in the wrong office, so the
--                     open term is repointed and closed terms are left alone.
-- corrected = false : the post genuinely moved, so the open term is closed at
--                     the old office and a new one opened at the new office.
create or replace function public.move_post(
  post uuid, dest uuid, corrected boolean default true, on_date date default current_date)
returns void
language plpgsql set search_path = public as $$
declare p public.posts; path text; e record;
begin
  if not public.is_editor() then
    raise exception 'Only an admin or superadmin can move a card';
  end if;

  select * into p from public.posts where id = post;
  if not found then raise exception 'That department card no longer exists'; end if;
  if not exists (select 1 from public.offices where id = dest) then
    raise exception 'That office no longer exists';
  end if;
  if p.office_id = dest then return; end if;

  update public.posts set office_id = dest where id = post;
  path := public.office_path(dest);

  -- people are attached to the post, so they travel with it
  for e in select id from public.employees where post_id = post loop
    if corrected then
      update public.postings set office_path = path
       where employee_id = e.id and to_date is null;
    else
      perform public.close_open_term(e.id, on_date);
      insert into public.postings (employee_id, post_id, post_title, office_path, from_date)
      values (e.id, post, p.title, path, on_date);
    end if;
  end loop;
end;
$$;

create or replace function public.delete_post(post uuid, on_date date default current_date)
returns void
language plpgsql set search_path = public as $$
declare e record;
begin
  if not public.is_editor() then
    raise exception 'Only an admin or superadmin can delete a card';
  end if;
  for e in select id from public.employees where post_id = post loop
    perform public.bench_employee(e.id, on_date);
  end loop;
  delete from public.posts where id = post;
end;
$$;

-- Deleting an office cascades to everything below it. Bench the people on those
-- cards first so no person record is lost, all inside the one transaction.
create or replace function public.delete_office(office uuid, on_date date default current_date)
returns void
language plpgsql set search_path = public as $$
declare e record;
begin
  if not public.is_editor() then
    raise exception 'Only an admin or superadmin can delete an office';
  end if;
  for e in
    select emp.id from public.employees emp
      join public.posts p on p.id = emp.post_id
     where p.office_id in (
       with recursive down as (
         select id from public.offices where id = office
         union all
         select o.id from public.offices o join down on o.parent_id = down.id
       ) select id from down)
  loop
    perform public.bench_employee(e.id, on_date);
  end loop;
  delete from public.offices where id = office;
end;
$$;

-- ============================================================
-- audit log
--
-- Every write in this app goes straight from the browser to Postgres, so the
-- log is captured by triggers rather than by application code: nothing can
-- write to a table and skip it. Only a superadmin can read it, and nobody can
-- write to it directly — the trigger is security definer, so it is the only
-- thing that can put a row in here.
-- ============================================================

create table if not exists public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  -- changes made by one statement (a cascading delete, say) share a txid, so
  -- the UI can group them and offer to undo the whole thing at once
  txid        bigint not null default txid_current(),
  actor_id    uuid,
  actor_email text,
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('insert','update','delete')),
  old_data    jsonb,
  new_data    jsonb,
  reverted_at timestamptz,
  reverted_by uuid
);
create index if not exists audit_at_idx    on public.audit_log(id desc);
create index if not exists audit_txid_idx  on public.audit_log(txid);
create index if not exists audit_table_idx on public.audit_log(table_name);

create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who  uuid := auth.uid();
  mail text;
  rid  uuid;
begin
  select email into mail from public.profiles where id = who;
  if tg_op = 'DELETE'
    then rid := (to_jsonb(old)->>'id')::uuid;
    else rid := (to_jsonb(new)->>'id')::uuid;
  end if;

  insert into public.audit_log (actor_id, actor_email, table_name, record_id, action, old_data, new_data)
  values (
    who, mail, tg_table_name, rid, lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['wings','offices','posts','employees','postings','profiles','user_scopes'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row()', t);
  end loop;
end $$;

alter table public.audit_log enable row level security;
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select using (public.is_superadmin());
-- deliberately no insert/update/delete policy: the trigger writes, nobody edits

-- ---------- revert ----------

-- Restoring a cascading delete means putting rows back that point at each other,
-- and no single ordering satisfies every foreign key at once: the person has to
-- be re-attached to a card that is itself still being restored. So make the keys
-- deferrable and let Postgres check them once, at commit, when everything is
-- back. "Initially immediate" means ordinary writes behave exactly as before —
-- only revert_audit_tx asks for the deferral.
do $$
declare c record;
begin
  for c in
    select conname, conrelid::regclass as tbl, pg_get_constraintdef(oid) as def
      from pg_constraint
     where contype = 'f'
       and connamespace = 'public'::regnamespace
       and not condeferrable
       and conrelid::regclass::text in
           ('offices','posts','employees','postings','user_scopes','profiles')
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I %s deferrable initially immediate',
                   c.tbl, c.conname, c.def);
  end loop;
end $$;

-- Puts one logged change back the way it was. Reverting is itself a change to
-- the underlying table, so it gets logged too — the trail never loses a step.

create or replace function public.revert_audit(entry_id bigint)
returns text
language plpgsql security definer set search_path = public as $$
declare
  e       public.audit_log;
  cols    text;
  hit     integer;
  allowed text[] := array['wings','offices','posts','employees','postings','profiles','user_scopes'];
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can revert a change';
  end if;

  select * into e from public.audit_log where id = entry_id;
  if not found then raise exception 'That change is not in the log'; end if;
  if e.reverted_at is not null then raise exception 'That change has already been reverted'; end if;
  if not (e.table_name = any(allowed)) then
    raise exception 'Changes to % cannot be reverted', e.table_name;
  end if;

  if e.action = 'insert' then
    -- undo a creation by removing the row again
    execute format('delete from public.%I where id = $1', e.table_name) using e.record_id;

  elsif e.action = 'delete' then
    -- put the row back exactly as it was, original id and all
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
      e.table_name, e.table_name) using e.old_data;

  else
    select string_agg(format('%I = r.%I', column_name, column_name), ', ')
      into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = e.table_name and column_name <> 'id';

    execute format(
      'update public.%I as t set %s from jsonb_populate_record(null::public.%I, $1) as r where t.id = $2',
      e.table_name, cols, e.table_name) using e.old_data, e.record_id;

    get diagnostics hit = row_count;
    if hit = 0 then
      raise exception 'That record has since been deleted — restore it before undoing this edit';
    end if;
  end if;

  update public.audit_log
     set reverted_at = now(), reverted_by = auth.uid()
   where id = entry_id;

  return 'ok';
end;
$$;

-- Undo every change that happened in one action, newest first so that parents
-- come back before the children that point at them.
create or replace function public.revert_audit_tx(tx bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can revert a change';
  end if;
  -- rows restored here reference each other; check the keys once, at commit
  set constraints all deferred;
  for r in select id from public.audit_log
            where txid = tx and reverted_at is null
            order by id desc loop
    perform public.revert_audit(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

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
