-- Live Chat security hardening v2
create schema if not exists private;

create or replace function private.chat_start_conversation_impl(p_name text,p_email text,p_page text default null)
returns table(id uuid,visitor_token uuid,created_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare v_id uuid; v_token uuid; v_created timestamptz;
begin
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Name is required'; end if;
  if length(trim(coalesce(p_name,'')))>200 then raise exception 'Name is too long'; end if;
  if length(trim(coalesce(p_email,'')))>320 then raise exception 'Email is too long'; end if;
  if length(trim(coalesce(p_page,'')))>2000 then raise exception 'Page URL is too long'; end if;
  insert into public.chat_conversations(visitor_name,visitor_email,current_page)
  values(nullif(trim(p_name),''),nullif(trim(p_email),''),nullif(trim(p_page),''))
  returning chat_conversations.id,chat_conversations.visitor_token,chat_conversations.created_at
  into v_id,v_token,v_created;
  id:=v_id; visitor_token:=v_token; created_at:=v_created; return next;
end;
$function$;

create or replace function private.chat_send_visitor_message_impl(p_conversation_id uuid,p_visitor_token uuid,p_message text)
returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_message_id uuid; v_message text:=trim(coalesce(p_message,''));
begin
  if p_conversation_id is null or p_visitor_token is null then raise exception 'Invalid chat session'; end if;
  if v_message='' then raise exception 'Message cannot be empty'; end if;
  if length(v_message)>4000 then raise exception 'Message is too long'; end if;
  if not exists(select 1 from public.chat_conversations where id=p_conversation_id and visitor_token=p_visitor_token) then raise exception 'Invalid chat session'; end if;
  insert into public.chat_messages(conversation_id,sender_type,message) values(p_conversation_id,'visitor',v_message) returning id into v_message_id;
  update public.chat_conversations set status='open',updated_at=now() where id=p_conversation_id;
  return v_message_id;
end;
$function$;

create or replace function private.chat_get_visitor_messages_impl(p_conversation_id uuid,p_visitor_token uuid)
returns table(id uuid,sender_type text,message text,created_at timestamptz)
language sql security definer set search_path=''
as $function$
select m.id,m.sender_type,m.message,m.created_at
from public.chat_messages m
join public.chat_conversations c on c.id=m.conversation_id
where c.id=p_conversation_id and c.visitor_token=p_visitor_token
order by m.created_at asc
$function$;

create or replace function public.chat_start_conversation(p_name text,p_email text,p_page text default null)
returns table(id uuid,visitor_token uuid,created_at timestamptz)
language sql security invoker set search_path=''
as $function$ select * from private.chat_start_conversation_impl(p_name,p_email,p_page) $function$;

create or replace function public.chat_send_visitor_message(p_conversation_id uuid,p_visitor_token uuid,p_message text)
returns uuid language sql security invoker set search_path=''
as $function$ select private.chat_send_visitor_message_impl(p_conversation_id,p_visitor_token,p_message) $function$;

create or replace function public.chat_get_visitor_messages(p_conversation_id uuid,p_visitor_token uuid)
returns table(id uuid,sender_type text,message text,created_at timestamptz)
language sql security invoker set search_path=''
as $function$ select * from private.chat_get_visitor_messages_impl(p_conversation_id,p_visitor_token) $function$;

revoke all on schema private from public;
grant usage on schema private to anon;
revoke execute on function private.chat_start_conversation_impl(text,text,text) from public,authenticated;
revoke execute on function private.chat_send_visitor_message_impl(uuid,uuid,text) from public,authenticated;
revoke execute on function private.chat_get_visitor_messages_impl(uuid,uuid) from public,authenticated;
grant execute on function private.chat_start_conversation_impl(text,text,text) to anon;
grant execute on function private.chat_send_visitor_message_impl(uuid,uuid,text) to anon;
grant execute on function private.chat_get_visitor_messages_impl(uuid,uuid) to anon;

revoke execute on function public.chat_start_conversation(text,text,text) from public,authenticated;
revoke execute on function public.chat_send_visitor_message(uuid,uuid,text) from public,authenticated;
revoke execute on function public.chat_get_visitor_messages(uuid,uuid) from public,authenticated;
grant execute on function public.chat_start_conversation(text,text,text) to anon;
grant execute on function public.chat_send_visitor_message(uuid,uuid,text) to anon;
grant execute on function public.chat_get_visitor_messages(uuid,uuid) to anon;

revoke all on table public.chat_conversations from anon;
revoke all on table public.chat_messages from anon;
