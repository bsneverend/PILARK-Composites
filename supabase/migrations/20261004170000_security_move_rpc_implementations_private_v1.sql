begin;

alter function public.cms_assign_role(text,text) set schema private;
alter function public.cms_bootstrap_admin() set schema private;
alter function public.cms_get_my_access() set schema private;
alter function public.cms_list_users() set schema private;
alter function public.cms_remove_role(text,text) set schema private;
alter function public.create_invoice_from_sales_order(uuid) set schema private;
alter function public.create_vendor_bill_from_purchase_order(uuid) set schema private;
alter function public.deliver_sales_order_inventory(uuid) set schema private;
alter function public.next_sales_order_no() set schema private;
alter function public.receive_purchase_order_inventory(uuid) set schema private;

create or replace function public.cms_assign_role(p_email text,p_role_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.cms_assign_role(p_email,p_role_key); $$;
create or replace function public.cms_bootstrap_admin()
returns jsonb language sql security invoker set search_path=''
as $$ select private.cms_bootstrap_admin(); $$;
create or replace function public.cms_get_my_access()
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.cms_get_my_access(); $$;
create or replace function public.cms_list_users()
returns table(user_id uuid,email text,created_at timestamptz,roles text[])
language sql security invoker set search_path=''
as $$ select * from private.cms_list_users(); $$;
create or replace function public.cms_remove_role(p_email text,p_role_key text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.cms_remove_role(p_email,p_role_key); $$;
create or replace function public.create_invoice_from_sales_order(p_sales_order_id uuid)
returns public.accounting_documents language sql security invoker set search_path=''
as $$ select private.create_invoice_from_sales_order(p_sales_order_id); $$;
create or replace function public.create_vendor_bill_from_purchase_order(p_purchase_order_id uuid)
returns public.accounting_documents language sql security invoker set search_path=''
as $$ select private.create_vendor_bill_from_purchase_order(p_purchase_order_id); $$;
create or replace function public.deliver_sales_order_inventory(p_sales_order_id uuid)
returns public.inventory_deliveries language sql security invoker set search_path=''
as $$ select private.deliver_sales_order_inventory(p_sales_order_id); $$;
create or replace function public.next_sales_order_no()
returns text language sql security invoker set search_path=''
as $$ select private.next_sales_order_no(); $$;
create or replace function public.receive_purchase_order_inventory(p_purchase_order_id uuid)
returns public.inventory_receipts language sql security invoker set search_path=''
as $$ select private.receive_purchase_order_inventory(p_purchase_order_id); $$;

revoke execute on function public.cms_assign_role(text,text) from public,anon;
revoke execute on function public.cms_bootstrap_admin() from public,anon;
revoke execute on function public.cms_get_my_access() from public,anon;
revoke execute on function public.cms_list_users() from public,anon;
revoke execute on function public.cms_remove_role(text,text) from public,anon;
revoke execute on function public.create_invoice_from_sales_order(uuid) from public,anon;
revoke execute on function public.create_vendor_bill_from_purchase_order(uuid) from public,anon;
revoke execute on function public.deliver_sales_order_inventory(uuid) from public,anon;
revoke execute on function public.next_sales_order_no() from public,anon;
revoke execute on function public.receive_purchase_order_inventory(uuid) from public,anon;

grant execute on function public.cms_assign_role(text,text) to authenticated;
grant execute on function public.cms_bootstrap_admin() to authenticated;
grant execute on function public.cms_get_my_access() to authenticated;
grant execute on function public.cms_list_users() to authenticated;
grant execute on function public.cms_remove_role(text,text) to authenticated;
grant execute on function public.create_invoice_from_sales_order(uuid) to authenticated;
grant execute on function public.create_vendor_bill_from_purchase_order(uuid) to authenticated;
grant execute on function public.deliver_sales_order_inventory(uuid) to authenticated;
grant execute on function public.next_sales_order_no() to authenticated;
grant execute on function public.receive_purchase_order_inventory(uuid) to authenticated;

commit;