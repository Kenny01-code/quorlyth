-- Advanced, participant-scoped messaging controls for Quorlyth.
-- Apply after 20261009_private_group_chat.sql.
-- Base messages stay append-only: edit/delete-for-everyone behavior is stored as
-- separate overrides/tombstones, while per-user hides and inbox settings remain private.

create or replace function public.is_chat_message_sender(p_message_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select exists (
    select 1 from public.docs d
    where d.path = 'messages/' || p_message_id
      and d.data->>'senderId' = (select auth.uid())::text
  )
$$;
revoke all on function public.is_chat_message_sender(text) from public, anon;
grant execute on function public.is_chat_message_sender(text) to authenticated;

drop policy if exists "users manage their chat preferences" on public.docs;
create policy "users manage their chat preferences" on public.docs
for all to authenticated
using (
  path like 'chatPreferences/%'
  and data->>'userId' = (select auth.uid())::text
  and public.is_chat_member(data->>'conversationId')
)
with check (
  path like 'chatPreferences/%'
  and data->>'userId' = (select auth.uid())::text
  and public.is_chat_member(data->>'conversationId')
);

drop policy if exists "authors manage their chat message edits" on public.docs;
create policy "authors manage their chat message edits" on public.docs
for all to authenticated
using (
  path like 'chatMessageEdits/%'
  and data->>'senderId' = (select auth.uid())::text
  and public.is_chat_message_sender(split_part(path, '/', 2))
  and public.is_chat_member(data->>'conversationId')
)
with check (
  path like 'chatMessageEdits/%'
  and data->>'senderId' = (select auth.uid())::text
  and public.is_chat_message_sender(split_part(path, '/', 2))
  and public.is_chat_member(data->>'conversationId')
);

drop policy if exists "authors manage their chat message tombstones" on public.docs;
create policy "authors manage their chat message tombstones" on public.docs
for all to authenticated
using (
  path like 'chatMessageTombstones/%'
  and data->>'senderId' = (select auth.uid())::text
  and public.is_chat_message_sender(split_part(path, '/', 2))
  and public.is_chat_member(data->>'conversationId')
)
with check (
  path like 'chatMessageTombstones/%'
  and data->>'senderId' = (select auth.uid())::text
  and public.is_chat_message_sender(split_part(path, '/', 2))
  and public.is_chat_member(data->>'conversationId')
);

drop policy if exists "users manage their hidden chat messages" on public.docs;
create policy "users manage their hidden chat messages" on public.docs
for all to authenticated
using (
  path like 'chatMessageHides/%'
  and data->>'userId' = (select auth.uid())::text
  and public.is_chat_member(data->>'conversationId')
)
with check (
  path like 'chatMessageHides/%'
  and data->>'userId' = (select auth.uid())::text
  and public.is_chat_member(data->>'conversationId')
);

drop policy if exists "users manage their chat reactions" on public.docs;
create policy "users manage their chat reactions" on public.docs
for all to authenticated
using (
  path like 'chatMessageReactions/%'
  and data->>'userId' = (select auth.uid())::text
  and public.is_chat_member(data->>'conversationId')
)
with check (
  path like 'chatMessageReactions/%'
  and data->>'userId' = (select auth.uid())::text
  and public.is_chat_member(data->>'conversationId')
);

-- Rebuild the general read policy with the existing restrictions plus the
-- participant/user scope for the new messaging collections.
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
);

notify pgrst, 'reload schema';
