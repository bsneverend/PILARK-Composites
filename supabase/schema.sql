-- PILARK Composites CMS schema for Supabase
-- Run this in Supabase Dashboard → SQL Editor.

create table if not exists public.site_media (
  key text primary key,
  src text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_products (
  id text primary key,
  image_url text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_content (
  section text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_media enable row level security;
alter table public.site_products enable row level security;
alter table public.site_content enable row level security;

drop policy if exists "Public can read media" on public.site_media;
create policy "Public can read media" on public.site_media for select using (true);
drop policy if exists "Public can read products" on public.site_products;
create policy "Public can read products" on public.site_products for select using (true);
drop policy if exists "Public can read content" on public.site_content;
create policy "Public can read content" on public.site_content for select using (true);

drop policy if exists "Authenticated can manage media" on public.site_media;
create policy "Authenticated can manage media" on public.site_media for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated can manage products" on public.site_products;
create policy "Authenticated can manage products" on public.site_products for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated can manage content" on public.site_content;
create policy "Authenticated can manage content" on public.site_content for all to authenticated using (true) with check (true);

insert into storage.buckets (id,name,public)
values ('website-media','website-media',true)
on conflict (id) do update set public=true;

drop policy if exists "Public can view website media" on storage.objects;
create policy "Public can view website media"
on storage.objects for select
using (bucket_id='website-media');

drop policy if exists "Authenticated can upload website media" on storage.objects;
create policy "Authenticated can upload website media"
on storage.objects for insert to authenticated
with check (bucket_id='website-media');

drop policy if exists "Authenticated can update website media" on storage.objects;
create policy "Authenticated can update website media"
on storage.objects for update to authenticated
using (bucket_id='website-media')
with check (bucket_id='website-media');

drop policy if exists "Authenticated can delete website media" on storage.objects;
create policy "Authenticated can delete website media"
on storage.objects for delete to authenticated
using (bucket_id='website-media');
