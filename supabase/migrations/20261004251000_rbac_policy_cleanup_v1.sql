grant usage on schema private to authenticated;
grant execute on function private.cms_has_permission(text) to authenticated;

alter policy "Public can read content" on public.site_content to anon;
alter policy "Public can read media" on public.site_media to anon;
alter policy "Public can read products" on public.site_products to anon;
