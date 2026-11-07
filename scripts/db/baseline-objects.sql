-- Lists every object the app owns in the live database as DDL, one row per object, for
-- scripts/db/build-baseline.mjs. Read-only. Run with search_path = '' so every name in view
-- definitions, defaults and policies comes out schema-qualified.
--
-- Columns: kind, oid, name, ddl, deps (oids this object needs first; used to order functions
-- and views, which can depend on each other).
set search_path = '';
with
rels as (
  select c.*
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
     and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
),
funcs as (
  select p.*
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p', 'w')
     and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
),
objs(kind, oid, name, ddl, deps) as (
  select 'extension', e.oid, e.extname::text,
         format('create extension if not exists %I with schema %I;', e.extname, n.nspname),
         '{}'::oid[]
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname <> 'plpgsql'

  union all
  select 'table', c.oid, c.relname::text,
         format(E'create %stable public.%I (%s\n)%s;',
           case when c.relpersistence = 'u' then 'unlogged ' else '' end, c.relname,
           coalesce((select string_agg(format(E'\n  %I %s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                                              case when a.attnotnull then ' not null' else '' end), ',' order by a.attnum)
                       from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), ''),
           case when c.reloptions is not null then ' with (' || array_to_string(c.reloptions, ', ') || ')' else '' end),
         '{}'
    from rels c where c.relkind in ('r', 'p')

  union all
  select 'function', p.oid, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         pg_get_functiondef(p.oid) || ';',
         array(select t.typrelid from pg_depend d join pg_type t on t.oid = d.refobjid
                where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                  and d.refclassid = 'pg_type'::regclass and t.typrelid <> 0
               union
               select et.typrelid from pg_depend d join pg_type t on t.oid = d.refobjid join pg_type et on et.oid = t.typelem
                where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                  and d.refclassid = 'pg_type'::regclass and et.typrelid <> 0)
    from funcs p

  union all
  select 'view', c.oid, c.relname::text,
         format(E'create or replace view public.%I%s as\n%s', c.relname,
           case when c.reloptions is not null then ' with (' || array_to_string(c.reloptions, ', ') || ')' else '' end,
           pg_get_viewdef(c.oid)),
         array(select distinct d.refobjid from pg_depend d join pg_rewrite r on r.oid = d.objid
                where d.classid = 'pg_rewrite'::regclass and r.ev_class = c.oid and d.refobjid <> c.oid
                  and d.refclassid in ('pg_class'::regclass, 'pg_proc'::regclass))
    from rels c where c.relkind = 'v'

  union all
  select 'default', d.oid, c.relname || '.' || a.attname,
         format('alter table public.%I alter column %I set default %s;', c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid)),
         '{}'
    from rels c join pg_attrdef d on d.adrelid = c.oid
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum and not a.attisdropped

  union all
  select case con.contype when 'f' then 'fkey' when 'c' then 'check' else 'key' end, con.oid,
         c.relname || '.' || con.conname,
         format('alter table public.%I add constraint %I %s;', c.relname, con.conname, pg_get_constraintdef(con.oid)),
         '{}'
    from pg_constraint con join rels c on c.oid = con.conrelid
   where con.contype in ('p', 'u', 'c', 'f', 'x') and con.conislocal

  union all
  select 'index', i.indexrelid, ic.relname::text, pg_get_indexdef(i.indexrelid) || ';', '{}'
    from pg_index i join rels c on c.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid
   where not exists (select 1 from pg_constraint con
                      where con.conindid = i.indexrelid and con.conrelid = i.indrelid and con.contype in ('p', 'u', 'x'))

  union all
  select 'replica_identity', c.oid, c.relname::text,
         format('alter table public.%I replica identity %s;', c.relname,
                case c.relreplident when 'f' then 'full' when 'n' then 'nothing' end),
         '{}'
    from rels c where c.relkind = 'r' and c.relreplident in ('f', 'n')

  union all
  select 'trigger', t.oid, t.tgrelid::regclass || '.' || t.tgname,
         pg_get_triggerdef(t.oid) || ';'
           || case t.tgenabled when 'D' then format(E'\nalter table %s disable trigger %I;', t.tgrelid::regclass, t.tgname) else '' end,
         '{}'
    from pg_trigger t join funcs p on p.oid = t.tgfoid
   where not t.tgisinternal

  union all
  select 'rls', c.oid, c.relname::text,
         format('alter table public.%I enable row level security;', c.relname)
           || case when c.relforcerowsecurity then format(' alter table public.%I force row level security;', c.relname) else '' end,
         '{}'
    from rels c where c.relrowsecurity

  union all
  select 'policy', pol.oid, pol.polrelid::regclass || '.' || pol.polname,
         format('create policy %I on %s as %s for %s to %s%s%s;', pol.polname, pol.polrelid::regclass,
           case when pol.polpermissive then 'permissive' else 'restrictive' end,
           case pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,
           case when pol.polroles = '{0}' then 'public'
                else (select string_agg(quote_ident(r.rolname), ', ' order by r.rolname) from pg_roles r where r.oid = any (pol.polroles)) end,
           case when pol.polqual is not null then E'\n  using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')' else '' end,
           case when pol.polwithcheck is not null then E'\n  with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')' else '' end),
         '{}'
    from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'storage')

  union all
  -- Supabase's default privileges grant everything to anon, authenticated and service_role on
  -- every new table, so reset to exactly what the live table has.
  select 'grant', c.oid, c.relname::text,
         format('revoke all on table public.%I from anon, authenticated, service_role;', c.relname)
           || coalesce((select string_agg(format(E'\ngrant %s on table public.%I to %s;', x.privs, c.relname, x.grantee), '' order by x.grantee)
                          from (select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee,
                                       string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
                                  from aclexplode(c.relacl) a where a.grantee <> c.relowner group by 1) x), ''),
         '{}'
    from rels c

  union all
  select 'grant', c.oid, c.relname || '.' || att.attname,
         format('grant %s (%I) on table public.%I to %s;', a.privilege_type, att.attname, c.relname,
                case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end),
         '{}'
    from rels c join pg_attribute att on att.attrelid = c.oid and att.attacl is not null and not att.attisdropped
    cross join lateral aclexplode(att.attacl) a
   where a.grantee <> c.relowner

  union all
  select 'grant', p.oid, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role;',
                p.proname, pg_get_function_identity_arguments(p.oid))
           || case when p.proacl is null
                then format(E'\ngrant execute on function public.%I(%s) to public;', p.proname, pg_get_function_identity_arguments(p.oid))
                else coalesce((select string_agg(format(E'\ngrant execute on function public.%I(%s) to %s;', p.proname,
                                       pg_get_function_identity_arguments(p.oid),
                                       case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end),
                                       '' order by a.grantee)
                                 from aclexplode(p.proacl) a where a.grantee <> p.proowner), '') end,
         '{}'
    from funcs p

  union all
  select 'comment', c.oid, c.relname::text,
         format('comment on %s public.%I is %L;', case c.relkind when 'v' then 'view' else 'table' end, c.relname, d.description),
         '{}'
    from rels c join pg_description d on d.objoid = c.oid and d.classoid = 'pg_class'::regclass and d.objsubid = 0

  union all
  select 'comment', c.oid, c.relname || '.' || a.attname,
         format('comment on column public.%I.%I is %L;', c.relname, a.attname, d.description),
         '{}'
    from rels c join pg_description d on d.objoid = c.oid and d.classoid = 'pg_class'::regclass and d.objsubid > 0
    join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid

  union all
  select 'comment', p.oid, p.proname::text,
         format('comment on function public.%I(%s) is %L;', p.proname, pg_get_function_identity_arguments(p.oid), d.description),
         '{}'
    from funcs p join pg_description d on d.objoid = p.oid and d.classoid = 'pg_proc'::regclass

  union all
  select 'publication', 0, pt.tablename::text,
         format('alter publication supabase_realtime add table public.%I;', pt.tablename),
         '{}'
    from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'

  union all
  select 'bucket', 0, b.id,
         format('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %L) on conflict (id) do nothing;',
                b.id, b.name, b.public, coalesce(b.file_size_limit::text, 'null'), b.allowed_mime_types),
         '{}'
    from storage.buckets b
)
select kind, oid::bigint as oid, name, ddl, deps::bigint[] as deps
  from objs
 order by kind, name;
