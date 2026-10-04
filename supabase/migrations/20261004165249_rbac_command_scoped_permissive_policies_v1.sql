do $$
declare
  r record;
  read_q text;
  ins_w text;
  upd_q text;
  upd_w text;
  del_q text;
  target_tables text[] := array[
    'accounting_accounts','accounting_journals','accounting_partners',
    'accounting_entries','accounting_lines','accounting_documents',
    'accounting_document_lines','accounting_payments',
    'accounting_payment_allocations','bank_transactions',
    'sales_orders','sales_order_lines',
    'purchase_orders','purchase_order_lines',
    'inventory_products','inventory_locations','inventory_balances',
    'inventory_stock_moves','inventory_receipts','inventory_receipt_lines',
    'inventory_deliveries','inventory_delivery_lines',
    'chat_conversations','chat_messages'
  ];
begin
  for r in
    select t.tablename,
      max(case when p.policyname='rbac_read' then p.qual end) as read_q,
      max(case when p.policyname='rbac_insert' then p.with_check end) as ins_w,
      max(case when p.policyname='rbac_update' then p.qual end) as upd_q,
      max(case when p.policyname='rbac_update' then p.with_check end) as upd_w,
      max(case when p.policyname='rbac_delete' then p.qual end) as del_q
    from unnest(target_tables) as t(tablename)
    left join pg_policies p
      on p.schemaname='public' and p.tablename=t.tablename
     and p.policyname in ('rbac_read','rbac_insert','rbac_update','rbac_delete')
    group by t.tablename
  loop
    read_q := r.read_q;
    ins_w := r.ins_w;
    upd_q := r.upd_q;
    upd_w := r.upd_w;
    del_q := r.del_q;
    execute format('drop policy if exists %I on public.%I','rbac_read',r.tablename);
    execute format('drop policy if exists %I on public.%I','rbac_insert',r.tablename);
    execute format('drop policy if exists %I on public.%I','rbac_update',r.tablename);
    execute format('drop policy if exists %I on public.%I','rbac_delete',r.tablename);
    if read_q is not null then
      execute format('create policy %I on public.%I as permissive for select to authenticated using (%s)','rbac_read',r.tablename,read_q);
    end if;
    if ins_w is not null then
      execute format('create policy %I on public.%I as permissive for insert to authenticated with check (%s)','rbac_insert',r.tablename,ins_w);
    end if;
    if upd_q is not null and upd_w is not null then
      execute format('create policy %I on public.%I as permissive for update to authenticated using (%s) with check (%s)','rbac_update',r.tablename,upd_q,upd_w);
    end if;
    if del_q is not null then
      execute format('create policy %I on public.%I as permissive for delete to authenticated using (%s)','rbac_delete',r.tablename,del_q);
    end if;
  end loop;
end $$;
