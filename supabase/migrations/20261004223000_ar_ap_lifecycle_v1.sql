alter table public.accounting_documents
  add column if not exists payment_terms_days integer not null default 0,
  add column if not exists payment_terms text;

alter table public.accounting_documents
  drop constraint if exists accounting_documents_payment_terms_days_check;

alter table public.accounting_documents
  add constraint accounting_documents_payment_terms_days_check
  check (payment_terms_days >= 0 and payment_terms_days <= 3650);

create index if not exists idx_accounting_documents_due_status
  on public.accounting_documents(due_date, status)
  where status in ('posted','partially_paid');

create or replace function public.post_accounting_payment_with_allocation(
  p_payment_id uuid,
  p_document_id uuid default null,
  p_allocation_amount numeric default null
)
returns public.accounting_payments
language plpgsql security invoker set search_path=''
as $function$
declare p public.accounting_payments; d public.accounting_documents; v_allocation numeric(18,2); v_outstanding numeric(18,2);
begin
  select * into p from public.accounting_payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status<>'draft' then raise exception 'Only draft payments can be posted'; end if;
  if p_document_id is not null then
    v_allocation:=coalesce(p_allocation_amount,p.amount);
    if v_allocation<=0 then raise exception 'Allocation amount must be greater than zero'; end if;
    if v_allocation>p.amount+0.005 then raise exception 'Allocation cannot exceed payment amount'; end if;
    select * into d from public.accounting_documents where id=p_document_id and status in ('posted','partially_paid') for update;
    if not found then raise exception 'Document not found or not open for payment'; end if;
    if p.payment_type='receive' and d.document_type not in ('customer_invoice','customer_credit_note') then raise exception 'Receive payments can only be allocated to customer invoices or credit notes'; end if;
    if p.payment_type='pay' and d.document_type not in ('vendor_bill','vendor_credit_note') then raise exception 'Vendor payments can only be allocated to vendor bills or credit notes'; end if;
    if d.partner_id<>p.partner_id then raise exception 'Payment partner does not match document partner'; end if;
    v_outstanding:=greatest(0,d.total_amount-d.amount_paid);
    if v_allocation>v_outstanding+0.005 then raise exception 'Allocation exceeds document outstanding amount of %',v_outstanding; end if;
  end if;
  p:=public.post_accounting_payment(p_payment_id);
  if p_document_id is not null then
    insert into public.accounting_payment_allocations(payment_id,document_id,amount) values(p_payment_id,p_document_id,v_allocation);
  end if;
  select * into p from public.accounting_payments where id=p_payment_id;
  return p;
end;
$function$;

create or replace function public.cancel_accounting_document(p_document_id uuid)
returns public.accounting_documents
language plpgsql security invoker set search_path=''
as $function$
declare d public.accounting_documents; src public.accounting_entries; rev public.accounting_entries; l record; v_entry_no text;
begin
  select * into d from public.accounting_documents where id=p_document_id for update;
  if not found then raise exception 'Accounting document not found'; end if;
  if d.status='cancelled' then return d; end if;
  if d.status='draft' then update public.accounting_documents set status='cancelled' where id=p_document_id returning * into d; return d; end if;
  if d.status<>'posted' then raise exception 'Only posted documents with no payment can be cancelled'; end if;
  if d.amount_paid>0.005 then raise exception 'Paid or partially paid documents cannot be cancelled'; end if;
  if d.posted_entry_id is null then raise exception 'Posted document has no accounting entry to reverse'; end if;
  select * into src from public.accounting_entries where id=d.posted_entry_id and status='posted' for update;
  if not found then raise exception 'Posted accounting entry not found'; end if;
  v_entry_no:='REV-'||d.document_no;
  if exists(select 1 from public.accounting_entries where entry_no=v_entry_no) then raise exception 'Reversal entry already exists for this document'; end if;
  insert into public.accounting_entries(entry_no,entry_date,journal_id,partner_id,reference,memo,status,created_by)
  values(v_entry_no,current_date,src.journal_id,src.partner_id,d.document_no,'Reversal of cancelled document '||d.document_no,'draft',auth.uid()) returning * into rev;
  for l in select account_id,partner_id,description,debit,credit from public.accounting_lines where entry_id=src.id order by id loop
    insert into public.accounting_lines(entry_id,account_id,partner_id,description,debit,credit) values(rev.id,l.account_id,l.partner_id,'Reversal: '||l.description,l.credit,l.debit);
  end loop;
  perform public.post_accounting_entry(rev.id);
  update public.accounting_documents set status='cancelled' where id=p_document_id returning * into d;
  return d;
exception when others then
  if rev.id is not null then delete from public.accounting_entries where id=rev.id and status='draft'; end if;
  raise;
end;
$function$;

revoke execute on function public.cancel_accounting_document(uuid) from public,anon;
grant execute on function public.cancel_accounting_document(uuid) to authenticated;
revoke execute on function public.post_accounting_payment_with_allocation(uuid,uuid,numeric) from public,anon;
grant execute on function public.post_accounting_payment_with_allocation(uuid,uuid,numeric) to authenticated;
