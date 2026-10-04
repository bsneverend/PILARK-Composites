create table if not exists public.accounting_document_sends (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.accounting_documents(id) on delete cascade,
 recipient_email text not null,
 subject text not null,
 provider text not null default 'resend',
 provider_message_id text,
 status text not null default 'sent' check(status in ('sent','failed')),
 error_message text,
 sent_by uuid references auth.users(id),
 sent_at timestamptz not null default now()
);
alter table public.accounting_document_sends enable row level security;
revoke all on table public.accounting_document_sends from anon, public;
grant select on table public.accounting_document_sends to authenticated;
drop policy if exists "authenticated users view document sends" on public.accounting_document_sends;
create policy "authenticated users view document sends" on public.accounting_document_sends for select to authenticated using (true);
create index if not exists idx_accounting_document_sends_document on public.accounting_document_sends(document_id,sent_at desc);