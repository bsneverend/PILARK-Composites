create table if not exists public.purchase_payment_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  partner_id uuid not null references public.accounting_partners(id) on delete restrict,
  payment_stage text not null default 'DP' check (payment_stage in ('DP','PELUNASAN','OTHER')),
  percentage numeric(7,3),
  requested_amount numeric(18,2) not null default 0,
  payment_condition text,
  requested_date date not null default current_date,
  bank_account text,
  attachment_url text,
  notes text,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','paid','cancelled')),
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  odoo_payment_id bigint,
  odoo_payment_name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_purchase_payment_requests_po on public.purchase_payment_requests(purchase_order_id);
create index if not exists idx_purchase_payment_requests_status on public.purchase_payment_requests(status);
create index if not exists idx_purchase_payment_requests_partner on public.purchase_payment_requests(partner_id);
alter table public.purchase_payment_requests enable row level security;
create policy "authenticated read purchase payment requests" on public.purchase_payment_requests for select to authenticated using (true);
create policy "authenticated insert purchase payment requests" on public.purchase_payment_requests for insert to authenticated with check (true);
create policy "authenticated update purchase payment requests" on public.purchase_payment_requests for update to authenticated using (true) with check (true);

create or replace function public.next_purchase_payment_request_no(p_date date default current_date)
returns text language plpgsql as $$
declare n integer;
begin
 select coalesce(max((regexp_match(request_no,'PPR\\.(\\d+)'))[1]::integer),0)+1 into n
 from public.purchase_payment_requests
 where request_no ~ '^PPR\\.[0-9]+$';
 return 'PPR.'||lpad(n::text,5,'0');
end $$;