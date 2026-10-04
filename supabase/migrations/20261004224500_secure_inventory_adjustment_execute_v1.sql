-- Restrict inventory adjustment to authenticated CMS users.
revoke execute on function public.adjust_inventory_stock(uuid,uuid,numeric,numeric,text) from public, anon;
grant execute on function public.adjust_inventory_stock(uuid,uuid,numeric,numeric,text) to authenticated;
