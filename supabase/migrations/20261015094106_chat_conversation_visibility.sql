-- Conversations were insertable by their participants but excluded from the scoped
-- read policy. This member-only policy lets clients reload and open their own chats
-- without exposing other users' conversation records.
create or replace function private.can_read_conversation_doc(p_path text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
  select (select auth.uid()) is not null
    and p_path ~ '^conversations/[^/]+$'
    and jsonb_typeof(p_data->'members') = 'array'
    and (p_data->'members') ? (select auth.uid())::text;
$function$;

revoke all on function private.can_read_conversation_doc(text, jsonb) from public, anon;
grant execute on function private.can_read_conversation_doc(text, jsonb) to authenticated;

drop policy if exists conversations_read_scoped on public.docs;
create policy conversations_read_scoped
  on public.docs
  for select
  to authenticated
  using ((select private.can_read_conversation_doc(path, data)));
