-- Accounting Period Entry Guard v1
create or replace function public.enforce_accounting_period_on_entry_post()
returns trigger language plpgsql security invoker set search_path=''
as $function$
begin
  if new.status='posted' and (tg_op='INSERT' or old.status is distinct from 'posted') then
    perform public.assert_accounting_period_open(new.entry_date);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_accounting_period_on_entry_post on public.accounting_entries;
create trigger trg_enforce_accounting_period_on_entry_post
before insert or update of status,entry_date on public.accounting_entries
for each row when (new.status='posted')
execute function public.enforce_accounting_period_on_entry_post();

revoke execute on function public.enforce_accounting_period_on_entry_post() from public,anon;
grant execute on function public.enforce_accounting_period_on_entry_post() to authenticated;
