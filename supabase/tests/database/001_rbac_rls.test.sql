-- PILARK RBAC / RLS integration test suite.
-- Run with: supabase test db

begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

select has_table('public','accounting_accounts','accounting_accounts exists');
select has_table('public','accounting_documents','accounting_documents exists');
select has_table('public','sales_orders','sales_orders exists');
select has_table('public','purchase_orders','purchase_orders exists');
select has_table('public','inventory_products','inventory_products exists');
select has_table('public','inventory_stock_moves','inventory_stock_moves exists');
select has_table('public','chat_conversations','chat_conversations exists');
select has_table('public','chat_messages','chat_messages exists');

select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (
  'accounting_accounts','accounting_journals','accounting_partners','accounting_entries','accounting_lines','accounting_documents','accounting_document_lines','accounting_payments','accounting_payment_allocations','bank_transactions',
  'sales_orders','sales_order_lines','purchase_orders','purchase_order_lines','inventory_products','inventory_locations','inventory_balances','inventory_stock_moves','inventory_receipts','inventory_receipt_lines','inventory_deliveries','inventory_delivery_lines','chat_conversations','chat_messages'
) and c.relrowsecurity),24::bigint,'all protected ERP/chat tables have RLS enabled');
select is((select count(*) from pg_policies where schemaname='public' and tablename in (
  'accounting_accounts','accounting_journals','accounting_partners','accounting_entries','accounting_lines','accounting_documents','accounting_document_lines','accounting_payments','accounting_payment_allocations','bank_transactions',
  'sales_orders','sales_order_lines','purchase_orders','purchase_order_lines','inventory_products','inventory_locations','inventory_balances','inventory_stock_moves','inventory_receipts','inventory_receipt_lines','inventory_deliveries','inventory_delivery_lines','chat_conversations','chat_messages'
) and policyname in ('Authenticated can manage accounting accounts','Authenticated can manage accounting entries','Authenticated can manage accounting journals','Authenticated can manage accounting lines','Authenticated can manage accounting partners','authenticated accounting documents all','authenticated accounting document lines all','authenticated accounting payments all','authenticated accounting payment allocations all','bank_transactions_authenticated_all','authenticated sales orders all','authenticated sales order lines all','purchase_orders_authenticated_all','purchase_order_lines_authenticated_all','inventory_products_authenticated_all','inventory_locations_authenticated_all','inventory_balances_authenticated_all','inventory_stock_moves_authenticated_all','inventory_receipts_authenticated_all','inventory_receipt_lines_authenticated_all','inventory_deliveries_authenticated_all','inventory_delivery_lines_authenticated_all','authenticated admin manages conversations','authenticated admin manages messages')),0::bigint,'legacy permissive authenticated policies are removed');

insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000001','rbac-test-norole@invalid.local','authenticated','authenticated',now(),now(),now()),
('00000000-0000-0000-0000-000000000002','rbac-test-admin@invalid.local','authenticated','authenticated',now(),now(),now()),
('00000000-0000-0000-0000-000000000003','rbac-test-finance@invalid.local','authenticated','authenticated',now(),now(),now()),
('00000000-0000-0000-0000-000000000004','rbac-test-sales@invalid.local','authenticated','authenticated',now(),now(),now()),
('00000000-0000-0000-0000-000000000005','rbac-test-purchase@invalid.local','authenticated','authenticated',now(),now(),now()),
('00000000-0000-0000-0000-000000000006','rbac-test-inventory@invalid.local','authenticated','authenticated',now(),now(),now()),
('00000000-0000-0000-0000-000000000007','rbac-test-content@invalid.local','authenticated','authenticated',now(),now(),now()),
('00000000-0000-0000-0000-000000000008','rbac-test-support@invalid.local','authenticated','authenticated',now(),now(),now());

insert into public.cms_user_roles(user_id,role_id)
select v.user_id, r.id
from (values
  ('00000000-0000-0000-0000-000000000002','administrator'),
  ('00000000-0000-0000-0000-000000000003','finance'),
  ('00000000-0000-0000-0000-000000000004','sales'),
  ('00000000-0000-0000-0000-000000000005','purchase'),
  ('00000000-0000-0000-0000-000000000006','inventory'),
  ('00000000-0000-0000-0000-000000000007','content_manager'),
  ('00000000-0000-0000-0000-000000000008','support')
) v(user_id,role_key)
join public.cms_roles r on r.role_key=v.role_key;

insert into public.chat_conversations(id,visitor_name,current_page)
values ('00000000-0000-0000-0000-000000000099','RBAC Test Visitor','/rbac-test');

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select is((select count(*) from public.accounting_accounts),0::bigint,'unassigned user cannot read accounting');
select is((select count(*) from public.inventory_products),0::bigint,'unassigned user cannot read inventory');
select is((select count(*) from public.chat_conversations),0::bigint,'unassigned user cannot read chat');

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
select is((select count(*) from public.accounting_accounts),17::bigint,'Sales can read ERP accounting data');
select is((select count(*) from public.inventory_products),18::bigint,'Sales can read inventory data');
select is((select count(*) from public.chat_conversations),0::bigint,'Sales cannot read support chat');
select is((with updated as (update public.accounting_accounts set name=name where id=(select id from public.accounting_accounts order by code limit 1) returning id) select count(*) from updated),0::bigint,'Sales cannot update accounting');

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select is((select count(*) from public.accounting_accounts),17::bigint,'Finance can read accounting');
select is((with updated as (update public.accounting_accounts set name=name where id=(select id from public.accounting_accounts order by code limit 1) returning id) select count(*) from updated),1::bigint,'Finance can update accounting');

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
select is((select count(*) from public.inventory_products),18::bigint,'Inventory can read inventory');
select is((with updated as (update public.accounting_accounts set name=name where id=(select id from public.accounting_accounts order by code limit 1) returning id) select count(*) from updated),0::bigint,'Inventory cannot update accounting');

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
select is((select count(*) from public.purchase_orders),0::bigint,'Purchase can read purchase orders');
select is((with updated as (update public.accounting_accounts set name=name where id=(select id from public.accounting_accounts order by code limit 1) returning id) select count(*) from updated),0::bigint,'Purchase cannot update accounting');

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000007';
select is((select count(*) from public.accounting_accounts),0::bigint,'Content Manager cannot read accounting');
select is((select count(*) from public.inventory_products),0::bigint,'Content Manager cannot read inventory');

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000008';
select is((select count(*) from public.chat_conversations),1::bigint,'Support can read chat');

set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select is((select count(*) from public.accounting_accounts),17::bigint,'Administrator can read accounting');
select is((select count(*) from public.inventory_products),18::bigint,'Administrator can read inventory');
select is((with updated as (update public.accounting_accounts set name=name where id=(select id from public.accounting_accounts order by code limit 1) returning id) select count(*) from updated),1::bigint,'Administrator can update accounting');

select * from finish();
rollback;
