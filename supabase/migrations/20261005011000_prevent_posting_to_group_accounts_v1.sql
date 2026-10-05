create or replace function public.validate_accounting_line_account()
returns trigger language plpgsql set search_path=''
as $$ begin
if exists(select 1 from public.accounting_accounts where id=new.account_id and is_group) then raise exception 'Account is a group account and cannot be posted to directly'; end if;
return new; end; $$;
drop trigger if exists trg_validate_accounting_line_account on public.accounting_lines;
create trigger trg_validate_accounting_line_account before insert or update of account_id on public.accounting_lines for each row execute function public.validate_accounting_line_account();
revoke all on function public.validate_accounting_line_account() from public, anon, authenticated;