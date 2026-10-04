-- PILARK Accounting: atomic payment posting + allocation
-- Applied to production Supabase migration:
-- accounting_payment_atomic_allocation_v1

create or replace function public.post_accounting_payment_with_allocation(
  p_payment_id uuid,
  p_document_id uuid default null,
  p_allocation_amount numeric default null
)
returns public.accounting_payments
language plpgsql
set search_path = ''
as $function$
declare
  p public.accounting_payments;
  d public.accounting_documents;
  v_allocation numeric(18,2);
begin
  select * into p
  from public.accounting_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if p.status <> 'draft' then
    raise exception 'Only draft payments can be posted';
  end if;

  if p_document_id is not null then
    v_allocation := coalesce(p_allocation_amount, p.amount);

    if v_allocation <= 0 then
      raise exception 'Allocation amount must be greater than zero';
    end if;

    if v_allocation > p.amount + 0.005 then
      raise exception 'Allocation cannot exceed payment amount';
    end if;

    select * into d
    from public.accounting_documents
    where id = p_document_id
      and status <> 'draft'
    for update;

    if not found then
      raise exception 'Document not found or not posted';
    end if;

    if p.payment_type = 'receive'
       and d.document_type not in ('customer_invoice','customer_credit_note') then
      raise exception 'Receive payments can only be allocated to customer invoices or credit notes';
    end if;

    if p.payment_type = 'pay'
       and d.document_type not in ('vendor_bill','vendor_credit_note') then
      raise exception 'Vendor payments can only be allocated to vendor bills or credit notes';
    end if;

    if d.partner_id <> p.partner_id then
      raise exception 'Payment partner does not match document partner';
    end if;
  end if;

  p := public.post_accounting_payment(p_payment_id);

  if p_document_id is not null then
    insert into public.accounting_payment_allocations(payment_id, document_id, amount)
    values (p_payment_id, p_document_id, v_allocation);
  end if;

  select * into p
  from public.accounting_payments
  where id = p_payment_id;

  return p;
end;
$function$;

revoke execute on function public.post_accounting_payment_with_allocation(uuid, uuid, numeric) from public, anon;
grant execute on function public.post_accounting_payment_with_allocation(uuid, uuid, numeric) to authenticated;
