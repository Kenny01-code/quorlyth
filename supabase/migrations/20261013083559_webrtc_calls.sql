-- Quorlyth voice/video call signaling.
-- Apply after 20261013_advanced_chat_features.sql.
-- Media travels peer-to-peer; this stores only call state, SDP and ICE signaling.

create or replace function public.is_chat_call_participant(p_call_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select exists (
    select 1
    from public.docs d
    where d.path = 'calls/' || p_call_id
      and (
        d.data->>'callerId' = (select auth.uid())::text
        or d.data->>'calleeId' = (select auth.uid())::text
      )
      and public.is_chat_member(d.data->>'conversationId')
  )
$$;
revoke all on function public.is_chat_call_participant(text) from public, anon;
grant execute on function public.is_chat_call_participant(text) to authenticated;

drop policy if exists "chat participants manage calls" on public.docs;
create policy "chat participants manage calls" on public.docs
for all to authenticated
using (
  path like 'calls/%'
  and path !~ '^calls/[^/]+/.+'
  and (data->>'callerId' = (select auth.uid())::text or data->>'calleeId' = (select auth.uid())::text)
  and public.is_chat_member(data->>'conversationId')
)
with check (
  path like 'calls/%'
  and path !~ '^calls/[^/]+/.+'
  and (data->>'callerId' = (select auth.uid())::text or data->>'calleeId' = (select auth.uid())::text)
  and public.is_chat_member(data->>'conversationId')
);

drop policy if exists "participants send call signals" on public.docs;
create policy "participants send call signals" on public.docs
for all to authenticated
using (
  path like 'callSignals/%'
  and path !~ '^callSignals/[^/]+/.+'
  and data->>'fromId' = (select auth.uid())::text
  and public.is_chat_call_participant(data->>'callId')
  and public.is_chat_member(data->>'conversationId')
)
with check (
  path like 'callSignals/%'
  and path !~ '^callSignals/[^/]+/.+'
  and data->>'fromId' = (select auth.uid())::text
  and public.is_chat_call_participant(data->>'callId')
  and public.is_chat_member(data->>'conversationId')
);

-- Rebuild the signed-in read policy to keep existing private-chat protections
-- and prevent unrelated users from discovering call/ICE metadata.
drop policy if exists "read when signed in" on public.docs;
create policy "read when signed in" on public.docs
for select to authenticated
using (
  (path not like 'data/users/%' or path like 'data/users/' || (select auth.uid())::text || '/%' or public.is_owner())
  and (path not like 'requests/%' or path = 'requests/' || (select auth.uid())::text or public.is_owner())
  and (path not like 'conversations/%' or public.is_chat_member(split_part(path, '/', 2)))
  and (path not like 'messages/%' or public.is_chat_member(data->>'conversationId'))
  and (path not like 'chatReads/%' or data->>'userId' = (select auth.uid())::text)
  and (path not like 'communities/%' or public.can_view_community(split_part(path, '/', 2)))
  and (path not like 'ideas/%' or public.can_view_community(public.idea_community_id(split_part(path, '/', 2))))
  and (path not like 'chatPreferences/%' or (data->>'userId' = (select auth.uid())::text and public.is_chat_member(data->>'conversationId')))
  and (path not like 'chatMessageEdits/%' or public.is_chat_member(data->>'conversationId'))
  and (path not like 'chatMessageTombstones/%' or public.is_chat_member(data->>'conversationId'))
  and (path not like 'chatMessageHides/%' or (data->>'userId' = (select auth.uid())::text and public.is_chat_member(data->>'conversationId')))
  and (path not like 'chatMessageReactions/%' or public.is_chat_member(data->>'conversationId'))
  and (path not like 'calls/%' or public.is_chat_call_participant(split_part(path, '/', 2)))
  and (path not like 'callSignals/%' or public.is_chat_call_participant(data->>'callId'))
);

notify pgrst, 'reload schema';
