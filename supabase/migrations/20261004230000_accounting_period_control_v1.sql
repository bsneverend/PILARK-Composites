-- Accounting Period Control v1
create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date_start date not null,
  date_end date not null,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_periods_date_check check (date_start <= date_end),
  constraint accounting_periods_name_unique unique (name)
);

create index if not exists idx_accounting_periods_dates on public.accounting_periods(date_start,date_end,status);

alter table public.accounting_periods enable row level security;
revoke all on table public.accounting_periods from anon, public;
grant select, insert, update on table public.accounting_periods to authenticated;

drop policy if exists accounting_periods_authenticated_all on public.accounting_periods;
create policy accounting_periods_authenticated_all on public.accounting_periods for all to authenticated using (true) with check (true);

create or replace function public.accounting_period_is_open(p_date date)
returns boolean language sql security invoker set search_path=''
as $function$
  select exists(select 1 from public.accounting_periods where p_date between date_start and date_end and status='open');
$function$;

create or replace function public.assert_accounting_period_open(p_date date)
returns void language plpgsql security invoker set search_path=''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.accounting_period_is_open(p_date) then
    raise exception 'Accounting period is closed or not configured for date %', p_date;
  end if;
end;
$function$;

revoke execute on function public.accounting_period_is_open(date) from public,anon;
grant execute on function public.accounting_period_is_open(date) to authenticated;
revoke execute on function public.assert_accounting_period_open(date) from public,anon;
grant execute on function public.assert_accounting_period_open(date) to authenticated;

insert into public.accounting_periods(name,date_start,date_end,status,created_by)
select '2026-10','2026-10-01','2026-10-31','open',auth.uid()
where not exists(select 1 from public.accounting_periods where name='2026-10');

create or replace function public.post_accounting_entry(p_entry_id uuid)
returns public.accounting_entries language plpgsql security invoker set search_path=''
as $function$
declare v_entry public.accounting_entries; v_debit numeric(18,2); v_credit numeric(18,2);
begin
  select * into v_entry from public.accounting_entries where id=p_entry_id for update;
  if not found then raise exception 'Accounting entry not found'; end if;
  if v_entry.status<>'draft' then raise exception 'Only draft entries can be posted'; end if;
  perform public.assert_accounting_period_open(v_entry.entry_date);
  select coalesce(sum(debit),0),coalesce(sum(credit),0) into v_debit,v_credit from public.accounting_lines where entry_id=p_entry_id;
  if v_debit<=0 or v_credit<=0 then raise exception 'A journal entry must contain debit and credit lines'; end if;
  if round(v_debit,2)<>round(v_credit,2) then raise exception 'Journal entry is not balanced: debit % != credit %',v_debit,v_credit; end if;
  update public.accounting_entries set status='posted',posted_at=now() where id=p_entry_id returning * into v_entry;
  return v_entry;
end;
$function$;

-- The full definitions below intentionally preserve the existing posting behavior while adding the period check.
-- post_accounting_document(), post_accounting_payment(), and inventory posting functions are replaced
-- in the companion hardening migration so this file remains independently understandable.
