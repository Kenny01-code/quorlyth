-- Repair private chat-media authorization. The original storage policies called
-- public.is_chat_member, whose EXECUTE privilege is intentionally revoked. Use the
-- hardened private helper and grant only authenticated sessions permission to invoke it.
revoke all on function private.is_chat_member(text) from public, anon;
grant execute on function private.is_chat_member(text) to authenticated;

drop policy if exists quorlyth_chat_media_insert on storage.objects;
create policy quorlyth_chat_media_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quorlyth-chat-attachments'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    (select private.is_chat_member((storage.foldername(name))[1]))
    or (select private.is_standalone_project_member((storage.foldername(name))[1], array['owner','manager','contributor']::text[]))
    or exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (storage.foldername(name))[1]
        and (select private.can_access_work_idea((storage.foldername(name))[1]))
    )
  )
);

drop policy if exists quorlyth_chat_media_read on storage.objects;
create policy quorlyth_chat_media_read
on storage.objects for select to authenticated
using (
  bucket_id = 'quorlyth-chat-attachments'
  and (
    (select private.is_chat_member((storage.foldername(name))[1]))
    or (select private.is_standalone_project_member((storage.foldername(name))[1], array['owner','manager','contributor','viewer']::text[]))
    or exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (storage.foldername(name))[1]
        and (select private.can_access_work_idea((storage.foldername(name))[1]))
    )
  )
);

drop policy if exists quorlyth_chat_media_delete on storage.objects;
create policy quorlyth_chat_media_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'quorlyth-chat-attachments'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    (select private.is_chat_member((storage.foldername(name))[1]))
    or (select private.is_standalone_project_member((storage.foldername(name))[1], array['owner','manager','contributor','viewer']::text[]))
    or exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (storage.foldername(name))[1]
        and (select private.can_access_work_idea((storage.foldername(name))[1]))
    )
  )
);

notify pgrst, 'reload schema';
