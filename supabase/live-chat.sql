-- PILARK Live Chat — Supabase setup
-- Run this file in Supabase SQL Editor.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_token uuid not null unique default gen_random_uuid(),
  visitor_name text,
  visitor_email text,
  current_page text,
  status text not null default 'open' check (status in ('open','pending','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('visitor','admin','system')),
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_updated_at_idx on public.chat_conversations(updated_at desc);
create index if not exists chat_messages_conversation_created_idx on public.chat_messages(conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "authenticated admin manages conversations" on public.chat_conversations;
create policy "authenticated admin manages conversations"
on public.chat_conversations for all to authenticated
using (true) with check (true);

drop policy if exists "authenticated admin manages messages" on public.chat_messages;
create policy "authenticated admin manages messages"
on public.chat_messages for all to authenticated
using (true) with check (true);

create or replace function public.chat_start_conversation(
  p_name text,
  p_email text,
  p_page text default null
)
returns table(id uuid, visitor_token uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_token uuid;
  v_created timestamptz;
begin
  insert into public.chat_conversations(visitor_name, visitor_email, current_page)
  values (nullif(trim(p_name),''), nullif(trim(p_email),''), nullif(trim(p_page),''))
  returning chat_conversations.id, chat_conversations.visitor_token, chat_conversations.created_at
  into v_id, v_token, v_created;

  id := v_id;
  visitor_token := v_token;
  created_at := v_created;
  return next;
end;
$$;

create or replace function public.chat_send_visitor_message(
  p_conversation_id uuid,
  p_visitor_token uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
begin
  if not exists (
    select 1 from public.chat_conversations
    where id = p_conversation_id and visitor_token = p_visitor_token
  ) then
    raise exception 'Invalid chat session';
  end if;

  insert into public.chat_messages(conversation_id, sender_type, message)
  values (p_conversation_id, 'visitor', trim(p_message))
  returning id into v_message_id;

  update public.chat_conversations
  set status='open', updated_at=now()
  where id=p_conversation_id;

  return v_message_id;
end;
$$;

create or replace function public.chat_get_visitor_messages(
  p_conversation_id uuid,
  p_visitor_token uuid
)
returns table(id uuid, sender_type text, message text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select m.id, m.sender_type, m.message, m.created_at
  from public.chat_messages m
  join public.chat_conversations c on c.id=m.conversation_id
  where c.id=p_conversation_id and c.visitor_token=p_visitor_token
  order by m.created_at asc;
$$;

revoke all on function public.chat_start_conversation(text,text,text) from public;
revoke all on function public.chat_send_visitor_message(uuid,uuid,text) from public;
revoke all on function public.chat_get_visitor_messages(uuid,uuid) from public;

grant execute on function public.chat_start_conversation(text,text,text) to anon, authenticated;
grant execute on function public.chat_send_visitor_message(uuid,uuid,text) to anon, authenticated;
grant execute on function public.chat_get_visitor_messages(uuid,uuid) to anon, authenticated;
