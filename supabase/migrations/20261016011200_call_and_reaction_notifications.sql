-- Call-state and chat-reaction alerts share the durable private notification emitter.
create or replace function private.notify_quorlyth_call_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_call_id text;
  v_conversation_id text;
  v_actor text;
  v_recipient text;
  v_actor_name text;
  v_mode text;
  v_state text;
  v_old_state text;
  v_at bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_created bigint;
  v_ended bigint;
  v_message_id text;
  v_message jsonb;
  v_reaction text;
begin
  if new.path ~ '^calls/[^/]+$' then
    v_call_id := split_part(new.path, '/', 2);
    v_conversation_id := new.data->>'conversationId';
    v_mode := case new.data->>'mode' when 'video' then 'video' else 'voice' end;
    v_actor := new.data->>'callerId';
    v_state := new.data->>'state';
    if tg_op = 'UPDATE' then v_old_state := old.data->>'state'; end if;

    if v_state = 'ringing' and (tg_op = 'INSERT' or v_old_state is distinct from 'ringing') then
      v_recipient := new.data->>'calleeId';
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      perform private.emit_quorlyth_notification(
        v_recipient, 'incoming-call:' || new.path || ':' || txid_current(),
        'call', case v_mode when 'video' then 'video' else 'phone' end,
        'Incoming ' || v_mode || ' call from ' || v_actor_name,
        v_call_id, v_conversation_id, v_at
      );
    elsif tg_op = 'UPDATE' and v_old_state = 'ringing' and v_state = 'declined' then
      v_recipient := new.data->>'callerId';
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || (new.data->>'calleeId');
      v_actor_name := coalesce(v_actor_name, 'The other person');
      perform private.emit_quorlyth_notification(
        v_recipient, 'call-declined:' || new.path || ':' || txid_current(),
        'call', 'phone-off',
        v_actor_name || ' declined your ' || v_mode || ' call',
        v_call_id, v_conversation_id, v_at
      );
    elsif tg_op = 'UPDATE' and v_old_state = 'ringing' and v_state = 'ended' then
      v_created := case when coalesce(new.data->>'createdAt', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'createdAt')::bigint else 0 end;
      v_ended := case when coalesce(new.data->>'endedAt', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'endedAt')::bigint else v_at end;
      if v_ended - v_created >= 15000 then
        select coalesce(p.data->>'name', p.data->>'authName', 'A member')
          into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
        v_actor_name := coalesce(v_actor_name, 'A member');
        perform private.emit_quorlyth_notification(
          new.data->>'calleeId', 'missed-call:' || new.path || ':' || txid_current(),
          'call', 'phone-off', 'Missed ' || v_mode || ' call from ' || v_actor_name,
          v_call_id, v_conversation_id, v_ended
        );
      end if;
    end if;
    return new;
  end if;

  -- A reaction is relevant to the author of the message being reacted to.
  elsif new.path ~ '^chatMessageReactions/[^/]+$'
    and (tg_op = 'INSERT' or old.data->>'reaction' is distinct from new.data->>'reaction') then
    v_reaction := nullif(trim(new.data->>'reaction'), '');
    if v_reaction is null then return new; end if;
    v_message_id := new.data->>'messageId';
    select m.data into v_message from public.docs m where m.path = 'messages/' || v_message_id;
    if v_message is null then return new; end if;
    v_actor := new.data->>'userId';
    select coalesce(p.data->>'name', p.data->>'authName', 'A member')
      into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
    v_actor_name := coalesce(v_actor_name, 'A member');
    perform private.emit_quorlyth_notification(
      v_message->>'senderId', 'message-reaction:' || new.path || ':' || txid_current(),
      'message', 'message', v_actor_name || ' reacted to your message ' || v_reaction,
      split_part(new.path, '/', 2), coalesce(new.data->>'conversationId', v_message->>'conversationId'), v_at
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.notify_quorlyth_call_reaction() from public, anon, authenticated, service_role;

drop trigger if exists docs_notify_quorlyth_call_reaction on public.docs;
create trigger docs_notify_quorlyth_call_reaction
after insert or update on public.docs
for each row execute function private.notify_quorlyth_call_reaction();
