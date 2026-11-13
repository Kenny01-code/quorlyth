-- Keep the conversation visibility exception inside the main scoped read policy
-- so docs does not acquire another permissive SELECT policy.
grant execute on function private.can_read_conversation_doc(text, jsonb) to anon;

drop policy if exists conversations_read_scoped on public.docs;
drop policy if exists docs_read_scoped on public.docs;
create policy docs_read_scoped
  on public.docs
  for select
  to anon, authenticated
  using (
    (select private.can_read_doc(docs.path, docs.data))
    or
    (select private.can_read_conversation_doc(docs.path, docs.data))
  );
