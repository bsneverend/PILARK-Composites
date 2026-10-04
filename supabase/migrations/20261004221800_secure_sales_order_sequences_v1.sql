-- PILARK ERP migration
-- Secure Sales Order number sequence access.
--
-- The sequence table is internal implementation detail. Browser clients must
-- call public.next_sales_order_no() rather than read/write the table directly.

alter table public.sales_order_sequences enable row level security;

revoke all on table public.sales_order_sequences from anon, authenticated;

create or replace function public.next_sales_order_no()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_year integer := extract(year from current_date)::integer;
  v_no integer;
begin
  insert into public.sales_order_sequences(year,next_number)
  values(v_year,2)
  on conflict (year) do update
    set next_number=public.sales_order_sequences.next_number+1,
        updated_at=now()
  returning next_number-1 into v_no;

  return 'SO-'||v_year::text||'-'||lpad(v_no::text,5,'0');
end;
$function$;

revoke execute on function public.next_sales_order_no() from public, anon;
grant execute on function public.next_sales_order_no() to authenticated;
