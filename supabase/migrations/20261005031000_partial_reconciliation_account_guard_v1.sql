create or replace function public.reconcile_account_lines_partial(p_allocations jsonb)
returns setof public.accounting_reconciliations language plpgsql security definer set search_path=''
as $$ declare r public.accounting_reconciliations; rec jsonb; lid uuid; requested numeric; avail numeric; total_d numeric:=0; total_c numeric:=0; acc uuid; line_acc uuid; amt numeric;
begin
if auth.uid() is null or not private.cms_has_permission('accounting.manage') then raise exception 'Accounting permission required';end if;
if p_allocations is null or jsonb_array_length(p_allocations)<2 then raise exception 'Select at least two journal lines';end if;
for rec in select * from jsonb_array_elements(p_allocations) loop
lid:=(rec->>'line_id')::uuid;requested:=round((rec->>'amount')::numeric,2);if requested<=0 then raise exception 'Reconciliation amount must be greater than zero';end if;
select l.account_id into line_acc from public.accounting_lines l join public.accounting_entries e on e.id=l.entry_id where l.id=lid and e.status='posted';
if line_acc is null then raise exception 'Journal line is not posted';end if;
if acc is null then acc:=line_acc;elsif acc<>line_acc then raise exception 'All selected lines must use the same account';end if;
select coalesce(l.debit,0)+coalesce(l.credit,0)-coalesce((select sum(rl.amount) from public.accounting_reconciliation_lines rl join public.accounting_reconciliations rr on rr.id=rl.reconciliation_id and rr.status='reconciled' where rl.line_id=l.id),0) into avail from public.accounting_lines l where l.id=lid;
if requested>avail+0.01 then raise exception 'Reconciliation amount exceeds remaining line amount';end if;
if (select debit from public.accounting_lines where id=lid)>0 then total_d:=total_d+requested;else total_c:=total_c+requested;end if;end loop;
if abs(total_d-total_c)>0.01 then raise exception 'Selected reconciliation amounts must balance';end if;if total_d<=0 then raise exception 'Reconciliation amount must be greater than zero';end if;
amt:=round(total_d,2);insert into public.accounting_reconciliations(account_id,amount,created_by) values(acc,amt,auth.uid()) returning * into r;
for rec in select * from jsonb_array_elements(p_allocations) loop insert into public.accounting_reconciliation_lines(reconciliation_id,line_id,amount) values(r.id,(rec->>'line_id')::uuid,round((rec->>'amount')::numeric,2));end loop;
update public.accounting_lines l set reconciled=true where l.id in(select (x->>'line_id')::uuid from jsonb_array_elements(p_allocations) x) and (coalesce(l.debit,0)+coalesce(l.credit,0)-coalesce((select sum(rl.amount) from public.accounting_reconciliation_lines rl join public.accounting_reconciliations rr on rr.id=rl.reconciliation_id and rr.status='reconciled' where rl.line_id=l.id),0))<=0.01;
return next r;end $$;
revoke all on function public.reconcile_account_lines_partial(jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_account_lines_partial(jsonb) to authenticated;