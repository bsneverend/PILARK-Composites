create schema if not exists private;

create table if not exists public.cms_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cms_role_permissions (
  role_id uuid not null references public.cms_roles(id) on delete cascade,
  permission_key text not null,
  primary key (role_id, permission_key)
);

create table if not exists public.cms_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.cms_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists idx_cms_user_roles_user_id on public.cms_user_roles(user_id);
create index if not exists idx_cms_user_roles_role_id on public.cms_user_roles(role_id);

alter table public.cms_roles enable row level security;
alter table public.cms_role_permissions enable row level security;
alter table public.cms_user_roles enable row level security;

revoke all on table public.cms_roles, public.cms_role_permissions, public.cms_user_roles from anon, authenticated;
revoke all on table public.cms_roles, public.cms_role_permissions, public.cms_user_roles from public;

insert into public.cms_roles(role_key,name,description)
values
 ('administrator','Administrator','Full access to all PILARK CMS and ERP modules.'),
 ('finance','Finance','Accounting, sales, purchase, inventory and ERP overview.'),
 ('sales','Sales','Sales workflow and ERP overview.'),
 ('purchase','Purchase','Purchase workflow, inventory and ERP overview.'),
 ('inventory','Inventory','Inventory operations, purchase receiving and ERP overview.'),
 ('content_manager','Content Manager','Website overview, media, products and website content.'),
 ('support','Support','Customer Live Chat.')
on conflict(role_key) do update set name=excluded.name,description=excluded.description,is_active=true;

with role_permissions(role_key, permission_key) as (
  values
    ('administrator','cms.overview'),('administrator','cms.media'),('administrator','cms.products'),
    ('administrator','cms.content'),('administrator','chat.manage'),('administrator','erp.overview'),
    ('administrator','sales.manage'),('administrator','purchase.manage'),('administrator','inventory.manage'),
    ('administrator','accounting.manage'),('administrator','settings.manage'),
    ('finance','erp.overview'),('finance','sales.manage'),('finance','purchase.manage'),
    ('finance','inventory.manage'),('finance','accounting.manage'),
    ('sales','erp.overview'),('sales','sales.manage'),
    ('purchase','erp.overview'),('purchase','purchase.manage'),('purchase','inventory.manage'),
    ('inventory','erp.overview'),('inventory','purchase.manage'),('inventory','inventory.manage'),
    ('content_manager','cms.overview'),('content_manager','cms.media'),('content_manager','cms.products'),
    ('content_manager','cms.content'),('support','chat.manage')
)
insert into public.cms_role_permissions(role_id,permission_key)
select r.id,rp.permission_key from role_permissions rp join public.cms_roles r on r.role_key=rp.role_key
on conflict do nothing;

create or replace function private.cms_has_permission(p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists (
  select 1 from public.cms_user_roles ur
  join public.cms_roles r on r.id=ur.role_id
  join public.cms_role_permissions rp on rp.role_id=r.id
  where ur.user_id=(select auth.uid()) and r.is_active and rp.permission_key=p_permission
); $$;

revoke all on function private.cms_has_permission(text) from public, anon, authenticated;

create or replace function public.cms_get_my_access()
returns jsonb language sql stable security definer set search_path=''
as $$ select jsonb_build_object(
  'user_id',(select auth.uid()),
  'roles',coalesce((select jsonb_agg(jsonb_build_object('key',r.role_key,'name',r.name) order by r.name)
    from public.cms_user_roles ur join public.cms_roles r on r.id=ur.role_id
    where ur.user_id=(select auth.uid()) and r.is_active),'[]'::jsonb),
  'permissions',coalesce((select jsonb_agg(distinct rp.permission_key order by rp.permission_key)
    from public.cms_user_roles ur join public.cms_roles r on r.id=ur.role_id
    join public.cms_role_permissions rp on rp.role_id=r.id
    where ur.user_id=(select auth.uid()) and r.is_active),'[]'::jsonb)
); $$;

create or replace function public.cms_bootstrap_admin()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_role_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.cms_user_roles) then raise exception 'Administrator bootstrap is already completed'; end if;
  select id into v_role_id from public.cms_roles where role_key='administrator' and is_active;
  if v_role_id is null then raise exception 'Administrator role is not configured'; end if;
  insert into public.cms_user_roles(user_id,role_id) values(v_user,v_role_id);
  return public.cms_get_my_access();
end; $$;

create or replace function public.cms_list_users()
returns table(user_id uuid,email text,created_at timestamptz,roles text[])
language plpgsql security definer set search_path=''
as $$
begin
  if not private.cms_has_permission('settings.manage') then raise exception 'Administrator permission required'; end if;
  return query select u.id,u.email::text,u.created_at,
    coalesce(array_agg(r.role_key order by r.role_key) filter(where r.role_key is not null),'{}'::text[])
  from auth.users u left join public.cms_user_roles ur on ur.user_id=u.id
  left join public.cms_roles r on r.id=ur.role_id and r.is_active
  group by u.id,u.email,u.created_at order by u.created_at;
end; $$;

create or replace function public.cms_assign_role(p_email text,p_role_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid; v_role uuid;
begin
  if not private.cms_has_permission('settings.manage') then raise exception 'Administrator permission required'; end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'User not found: %',p_email; end if;
  select id into v_role from public.cms_roles where role_key=p_role_key and is_active;
  if v_role is null then raise exception 'Role not found: %',p_role_key; end if;
  insert into public.cms_user_roles(user_id,role_id) values(v_user,v_role) on conflict do nothing;
  return jsonb_build_object('success',true,'email',p_email,'role',p_role_key);
end; $$;

create or replace function public.cms_remove_role(p_email text,p_role_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid; v_role uuid; v_admin_count integer;
begin
  if not private.cms_has_permission('settings.manage') then raise exception 'Administrator permission required'; end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'User not found: %',p_email; end if;
  select id into v_role from public.cms_roles where role_key=p_role_key;
  if v_role is null then raise exception 'Role not found: %',p_role_key; end if;
  if p_role_key='administrator' then
    select count(*) into v_admin_count from public.cms_user_roles ur
    join public.cms_roles r on r.id=ur.role_id where r.role_key='administrator' and r.is_active;
    if v_admin_count <= 1 then raise exception 'Cannot remove the last Administrator'; end if;
  end if;
  delete from public.cms_user_roles where user_id=v_user and role_id=v_role;
  return jsonb_build_object('success',true,'email',p_email,'role',p_role_key);
end; $$;

revoke all on function public.cms_get_my_access() from public, anon;
revoke all on function public.cms_bootstrap_admin() from public, anon;
revoke all on function public.cms_list_users() from public, anon;
revoke all on function public.cms_assign_role(text,text) from public, anon;
revoke all on function public.cms_remove_role(text,text) from public, anon;

grant execute on function public.cms_get_my_access() to authenticated;
grant execute on function public.cms_bootstrap_admin() to authenticated;
grant execute on function public.cms_list_users() to authenticated;
grant execute on function public.cms_assign_role(text,text) to authenticated;
grant execute on function public.cms_remove_role(text,text) to authenticated;
