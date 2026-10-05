create table if not exists public.accounting_reconciliations(
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounting_accounts(id),
 amount numeric(18,2) not null check(amount>0), status text not null default 'reconciled' check(status in ('reconciled','cancelled')),
 created_by uuid references auth.users(id), created_at timestamptz not null default now());
create table if not exists public.accounting_reconciliation_lines(
 id uuid primary key default gen_random_uuid(), reconciliation_id uuid not null references public.accounting_reconciliations(id) on delete cascade,
 line_id uuid not null references public.accounting_lines(id), amount numeric(18,2) not null check(amount>0), created_at timestamptz not null default now(),
 unique(reconciliation_id,line_id));
create index if not exists idx_reconciliation_lines_line on public.accounting_reconciliation_lines(line_id);
create index if not exists idx_reconciliations_account_created on public.accounting_reconciliations(account_id,created_at);
alter table public.accounting_reconciliations enable row level security;
alter table public.accounting_reconciliation_lines enable row level security;
create policy accounting_reconciliations_select_rbac on public.accounting_reconciliations for select to authenticated using (private.cms_has_permission('accounting.manage') or private.cms_has_permission('erp.overview'));
create policy accounting_reconciliations_insert_rbac on public.accounting_reconciliations for insert to authenticated with check (private.cms_has_permission('accounting.manage'));
create policy accounting_reconciliation_lines_select_rbac on public.accounting_reconciliation_lines for select to authenticated using (private.cms_has_permission('accounting.manage') or private.cms_has_permission('erp.overview'));
create policy accounting_reconciliation_lines_insert_rbac on public.accounting_reconciliation_lines for insert to authenticated with check (private.cms_has_permission('accounting.manage'));
create or replace function public.reconcile_account_lines(p_line_ids uuid[])
returns public.accounting_reconciliations language plpgsql security definer set search_path=''
as $$ declare r public.accounting_reconciliations; acc uuid; total_d numeric:=0; total_c numeric:=0; amt numeric:=0; uid uuid:=auth.uid(); lid uuid;
begin
if uid is null or not private.cms_has_permission('accounting.manage') then raise exception 'Accounting permission required'; end if;
if p_line_ids is null or array_length(p_line_ids,1)<2 then raise exception 'Select at least two journal lines'; end if;
select min(l.account_id),sum(l.debit),sum(l.credit) into acc,total_d,total_c from public.accounting_lines l join public.accounting_entries e on e.id=l.entry_id where l.id=any(p_line_ids) and e.status='posted' and l.reconciled=false;
if acc is null then raise exception 'No eligible unreconciled posted lines found'; end if;
if exists(select 1 from public.accounting_lines l join public.accounting_entries e on e.id=l.entry_id where l.id=any(p_line_ids) and (e.status<>'posted' or l.reconciled or l.account_id<>acc)) then raise exception 'All selected lines must be posted, unreconciled, and use the same account'; end if;
if total_d<=0 or total_c<=0 or round(total_d,2)<>round(total_c,2) then raise exception 'Debit and credit selected amounts must match'; end if;
amt:=round(total_d,2); insert into public.accounting_reconciliations(account_id,amount,created_by) values(acc,amt,uid) returning * into r;
foreach lid in array p_line_ids loop insert into public.accounting_reconciliation_lines(reconciliation_id,line_id,amount) select r.id,l.id,case when l.debit>0 then l.debit else l.credit end from public.accounting_lines l where l.id=lid; end loop;
update public.accounting_lines set reconciled=true where id=any(p_line_ids); return r; end $$;
revoke all on function public.reconcile_account_lines(uuid[]) from public,anon,authenticated;
grant execute on function public.reconcile_account_lines(uuid[]) to authenticated;