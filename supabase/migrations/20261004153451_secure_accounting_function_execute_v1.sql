revoke execute on function public.next_accounting_document_no(text) from public, anon;
revoke execute on function public.next_accounting_payment_no() from public, anon;
revoke execute on function public.post_accounting_document(uuid) from public, anon;
revoke execute on function public.post_accounting_entry(uuid) from public, anon;
revoke execute on function public.post_accounting_payment(uuid) from public, anon;
revoke execute on function public.recalc_accounting_document(uuid) from public, anon;

grant execute on function public.next_accounting_document_no(text) to authenticated;
grant execute on function public.next_accounting_payment_no() to authenticated;
grant execute on function public.post_accounting_document(uuid) to authenticated;
grant execute on function public.post_accounting_entry(uuid) to authenticated;
grant execute on function public.post_accounting_payment(uuid) to authenticated;
grant execute on function public.recalc_accounting_document(uuid) to authenticated;
