-- Uploads are writable by the same active workspace roles that may post team updates.
-- Viewers can read private attachments but cannot create new storage objects.
drop policy if exists quorlyth_chat_media_insert on storage.objects;
create policy quorlyth_chat_media_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quorlyth-chat-attachments'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    (select public.is_chat_member((storage.foldername(name))[1]))
    or (select private.is_standalone_project_member((storage.foldername(name))[1], array['owner','manager','contributor']::text[]))
    or exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (storage.foldername(name))[1]
        and (select private.can_access_work_idea((storage.foldername(name))[1]))
    )
  )
);

notify pgrst, 'reload schema';
