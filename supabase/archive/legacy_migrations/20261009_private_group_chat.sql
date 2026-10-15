-- Quorlyth private messaging: participant-scoped conversations, messages and read state.
-- Run in Supabase SQL Editor after the existing Quorlyth migrations.
-- This is standard private messaging, NOT end-to-end encryption.

create or replace function public.is_chat_member(p_conversation_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select exists (
    select 1
    from public.docs d
    where d.path = 'conversations/' || p_conversation_id
      and jsonb_typeof(d.data->'members') = 'array'
      and d.data->'members' ? (select auth.uid())::text
  )
$$;
revoke all on function public.is_chat_member(text) from public, anon;
grant execute on function public.is_chat_member(text) to authenticated;

-- Restrict conversation visibility to participants (and the existing platform owner policy).
drop policy if exists "chat participants read conversations" on public.docs;
create policy "chat participants read conversations" on public.docs
for select to authenticated
using (
  path like 'conversations/%'
  and public.is_chat_member(split_part(path, '/', 2))
);

-- Users can only create a conversation that includes themselves as creator and participant.
-- Direct chats have exactly two members; groups have at least three.
drop policy if exists "users create their conversations" on public.docs;
create policy "users create their conversations" on public.docs
for insert to authenticated
with check (
  path like 'conversations/%'
  and path !~ '^conversations/[^/]+/.+'
  and data->>'createdBy' = (select auth.uid())::text
  and jsonb_typeof(data->'members') = 'array'
  and data->'members' ? (select auth.uid())::text
  and (
    (data->>'type' = 'direct' and jsonb_array_length(data->'members') = 2)
    or
    (data->>'type' = 'group' and jsonb_array_length(data->'members') >= 3 and length(trim(coalesce(data->>'title',''))) > 0)
  )
);

-- Messages can only be read by people in the referenced conversation.
drop policy if exists "chat participants read messages" on public.docs;
create policy "chat participants read messages" on public.docs
for select to authenticated
using (
  path like 'messages/%'
  and public.is_chat_member(data->>'conversationId')
);

-- Messages are append-only in this first release: no client-side editing or deletion.
drop policy if exists "chat participants send messages" on public.docs;
create policy "chat participants send messages" on public.docs
for insert to authenticated
with check (
  path like 'messages/%'
  and path !~ '^messages/[^/]+/.+'
  and data->>'senderId' = (select auth.uid())::text
  and length(trim(coalesce(data->>'text',''))) between 1 and 4000
  and public.is_chat_member(data->>'conversationId')
);

-- Each user controls only their own read-state rows.
drop policy if exists "users manage their chat read state" on public.docs;
create policy "users manage their chat read state" on public.docs
for all to authenticated
using (
  path like 'chatReads/%'
  and data->>'userId' = (select auth.uid())::text
)
with check (
  path like 'chatReads/%'
  and data->>'userId' = (select auth.uid())::text
);

-- Add participant-aware conditions to the existing shared read policy so the
-- broad "signed-in" rule cannot expose chat records to unrelated users.
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
);

notify pgrst, 'reload schema';
