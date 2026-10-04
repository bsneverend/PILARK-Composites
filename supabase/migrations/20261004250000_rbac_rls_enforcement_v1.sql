create schema if not exists private;

create or replace function private.cms_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.cms_user_roles ur
    join public.cms_roles r on r.id=ur.role_id
    join public.cms_role_permissions rp on rp.role_id=r.id
    where ur.user_id=(select auth.uid()) and r.is_active and rp.permission_key=p_permission
  );
$$;

revoke all on function private.cms_has_permission(text) from public, anon, authenticated;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_invoice_from_sales_order' limit 1;
  v_def := replace(v_def,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER');
  v_def := replace(v_def,E'begin\n',E'begin\n  if not (private.cms_has_permission(''sales.manage'') or private.cms_has_permission(''accounting.manage'')) then raise exception ''Sales permission required''; end if;\n');
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_vendor_bill_from_purchase_order' limit 1;
  v_def := replace(v_def,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER');
  v_def := replace(v_def,E'begin\n',E'begin\n  if not (private.cms_has_permission(''purchase.manage'') or private.cms_has_permission(''accounting.manage'')) then raise exception ''Purchase permission required''; end if;\n');
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='receive_purchase_order_inventory' limit 1;
  v_def := replace(v_def,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER');
  v_def := replace(v_def,E'begin\n',E'begin\n  if not (private.cms_has_permission(''inventory.manage'') or private.cms_has_permission(''accounting.manage'')) then raise exception ''Inventory permission required''; end if;\n');
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='deliver_sales_order_inventory' limit 1;
  v_def := replace(v_def,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER');
  v_def := replace(v_def,E'begin\n',E'begin\n  if not (private.cms_has_permission(''inventory.manage'') or private.cms_has_permission(''accounting.manage'')) then raise exception ''Inventory permission required''; end if;\n');
  execute v_def;
end $$;

do $$
declare t text;
begin
  foreach t in array array['accounting_accounts','accounting_document_lines','accounting_documents','accounting_entries','accounting_journals','accounting_lines','accounting_partners','accounting_payment_allocations','accounting_payments','accounting_periods','accounting_document_sends','bank_transactions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "rbac_read" on public.%I',t);
    execute format('drop policy if exists "rbac_write" on public.%I',t);
    execute format('create policy "rbac_read" on public.%I as restrictive for select to authenticated using ((select private.cms_has_permission(''accounting.manage'')) or (select private.cms_has_permission(''erp.overview'')))',t);
    execute format('create policy "rbac_write" on public.%I as restrictive for all to authenticated using ((select private.cms_has_permission(''accounting.manage''))) with check ((select private.cms_has_permission(''accounting.manage'')))',t);
  end loop;

  foreach t in array array['sales_orders','sales_order_lines'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "rbac_read" on public.%I',t);
    execute format('drop policy if exists "rbac_write" on public.%I',t);
    execute format('create policy "rbac_read" on public.%I as restrictive for select to authenticated using ((select private.cms_has_permission(''sales.manage'')) or (select private.cms_has_permission(''accounting.manage'')) or (select private.cms_has_permission(''erp.overview'')))',t);
    execute format('create policy "rbac_write" on public.%I as restrictive for all to authenticated using ((select private.cms_has_permission(''sales.manage'')) or (select private.cms_has_permission(''accounting.manage''))) with check ((select private.cms_has_permission(''sales.manage'')) or (select private.cms_has_permission(''accounting.manage'')))',t);
  end loop;

  foreach t in array array['purchase_orders','purchase_order_lines'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "rbac_read" on public.%I',t);
    execute format('drop policy if exists "rbac_write" on public.%I',t);
    execute format('create policy "rbac_read" on public.%I as restrictive for select to authenticated using ((select private.cms_has_permission(''purchase.manage'')) or (select private.cms_has_permission(''inventory.manage'')) or (select private.cms_has_permission(''accounting.manage'')) or (select private.cms_has_permission(''erp.overview'')))',t);
    execute format('create policy "rbac_write" on public.%I as restrictive for all to authenticated using ((select private.cms_has_permission(''purchase.manage'')) or (select private.cms_has_permission(''accounting.manage''))) with check ((select private.cms_has_permission(''purchase.manage'')) or (select private.cms_has_permission(''accounting.manage'')))',t);
  end loop;

  foreach t in array array['inventory_products','inventory_locations','inventory_balances','inventory_stock_moves','inventory_receipts','inventory_receipt_lines','inventory_deliveries','inventory_delivery_lines'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "rbac_read" on public.%I',t);
    execute format('drop policy if exists "rbac_write" on public.%I',t);
    execute format('create policy "rbac_read" on public.%I as restrictive for select to authenticated using ((select private.cms_has_permission(''inventory.manage'')) or (select private.cms_has_permission(''purchase.manage'')) or (select private.cms_has_permission(''sales.manage'')) or (select private.cms_has_permission(''accounting.manage'')) or (select private.cms_has_permission(''erp.overview'')))',t);
    execute format('create policy "rbac_write" on public.%I as restrictive for all to authenticated using ((select private.cms_has_permission(''inventory.manage'')) or (select private.cms_has_permission(''accounting.manage''))) with check ((select private.cms_has_permission(''inventory.manage'')) or (select private.cms_has_permission(''accounting.manage'')))',t);
  end loop;

  foreach t in array array['chat_conversations','chat_messages'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "rbac_read" on public.%I',t);
    execute format('drop policy if exists "rbac_write" on public.%I',t);
    execute format('create policy "rbac_read" on public.%I as restrictive for select to authenticated using ((select private.cms_has_permission(''chat.manage'')))',t);
    execute format('create policy "rbac_write" on public.%I as restrictive for all to authenticated using ((select private.cms_has_permission(''chat.manage''))) with check ((select private.cms_has_permission(''chat.manage'')))',t);
  end loop;

  foreach t in array array['site_media','site_products','site_content'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "rbac_write" on public.%I',t);
    execute format('create policy "rbac_write" on public.%I as restrictive for all to authenticated using ((select private.cms_has_permission(''cms.media'')) or (select private.cms_has_permission(''cms.products'')) or (select private.cms_has_permission(''cms.content'')) or (select private.cms_has_permission(''cms.overview''))) with check ((select private.cms_has_permission(''cms.media'')) or (select private.cms_has_permission(''cms.products'')) or (select private.cms_has_permission(''cms.content'')) or (select private.cms_has_permission(''cms.overview'')))',t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['accounting_accounts','accounting_document_lines','accounting_documents','accounting_entries','accounting_journals','accounting_lines','accounting_partners','accounting_payment_allocations','accounting_payments','accounting_periods','accounting_document_sends','bank_transactions','sales_orders','sales_order_lines','purchase_orders','purchase_order_lines','inventory_products','inventory_locations','inventory_balances','inventory_stock_moves','inventory_receipts','inventory_receipt_lines','inventory_deliveries','inventory_delivery_lines','chat_conversations','chat_messages'] loop
    execute format('revoke all on table public.%I from anon',t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated',t);
  end loop;
end $$;

revoke all on table public.sales_order_sequences from anon, authenticated;
