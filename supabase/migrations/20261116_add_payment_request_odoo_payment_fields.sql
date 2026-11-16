alter table public.purchase_payment_requests
  add column if not exists odoo_journal_id bigint,
  add column if not exists odoo_journal_name text,
  add column if not exists odoo_payment_id bigint,
  add column if not exists odoo_payment_name text,
  add column if not exists paid_date date,
  add column if not exists payment_reference text;
