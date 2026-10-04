do $$
declare
  r record;
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
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename = any(target_tables)
      and policyname not in ('rbac_read','rbac_write')
  loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
