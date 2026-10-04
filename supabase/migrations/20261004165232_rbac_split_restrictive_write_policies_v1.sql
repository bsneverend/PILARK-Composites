do $$
declare
  r record;
  q text;
  w text;
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
