do $$
declare
  r record;
  q text;
  w text;
  target_tables text[] := array[
    'accounting_document_sends','accounting_periods',
    'site_content','site_media','site_products'
  ];
begin
  for r in
    select schemaname, tablename, qual, with_check
    from pg_policies
    where schemaname='public'
      and tablename = any(target_tables)
      and policyname='rbac_write'
  loop
    q := r.qual;
    w := r.with_check;
    execute format('drop policy if exists %I on %I.%I','rbac_write',r.schemaname,r.tablename);
    execute format('drop policy if exists %I on %I.%I','rbac_insert',r.schemaname,r.tablename);
    execute format('drop policy if exists %I on %I.%I','rbac_update',r.schemaname,r.tablename);
    execute format('drop policy if exists %I on %I.%I','rbac_delete',r.schemaname,r.tablename);
    execute format('create policy %I on %I.%I as restrictive for insert to authenticated with check (%s)','rbac_insert',r.schemaname,r.tablename,w);
    execute format('create policy %I on %I.%I as restrictive for update to authenticated using (%s) with check (%s)','rbac_update',r.schemaname,r.tablename,q,w);
    execute format('create policy %I on %I.%I as restrictive for delete to authenticated using (%s)','rbac_delete',r.schemaname,r.tablename,q);
  end loop;
end $$;