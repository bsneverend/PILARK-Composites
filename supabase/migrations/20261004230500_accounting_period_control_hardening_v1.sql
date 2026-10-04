-- Accounting Period Control hardening v1
create or replace function public.validate_accounting_period_overlap()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
  if exists(
    select 1 from public.accounting_periods p
    where p.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(p.date_start,p.date_end,'[]') && daterange(new.date_start,new.date_end,'[]')
  ) then raise exception 'Accounting period overlaps an existing period'; end if;
  return new;
end;
$function$;

drop trigger if exists trg_validate_accounting_period_overlap on public.accounting_periods;
create trigger trg_validate_accounting_period_overlap
before insert or update of date_start,date_end on public.accounting_periods
for each row execute function public.validate_accounting_period_overlap();

create or replace function public.close_accounting_period(p_period_id uuid)
returns public.accounting_periods language plpgsql security invoker set search_path=''
as $function$
declare p public.accounting_periods;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.accounting_periods where id=p_period_id for update;
  if not found then raise exception 'Accounting period not found'; end if;
  if p.status='closed' then return p; end if;
  update public.accounting_periods set status='closed',closed_at=now(),closed_by=auth.uid(),updated_at=now()
  where id=p_period_id returning * into p;
  return p;
end;
$function$;

create or replace function public.reopen_accounting_period(p_period_id uuid)
returns public.accounting_periods language plpgsql security invoker set search_path=''
as $function$
declare p public.accounting_periods;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.accounting_periods where id=p_period_id for update;
  if not found then raise exception 'Accounting period not found'; end if;
  update public.accounting_periods set status='open',reopened_at=now(),reopened_by=auth.uid(),updated_at=now()
  where id=p_period_id returning * into p;
  return p;
end;
$function$;

revoke execute on function public.close_accounting_period(uuid) from public,anon;
grant execute on function public.close_accounting_period(uuid) to authenticated;
revoke execute on function public.reopen_accounting_period(uuid) from public,anon;
grant execute on function public.reopen_accounting_period(uuid) to authenticated;
revoke update,delete on table public.accounting_periods from authenticated;
