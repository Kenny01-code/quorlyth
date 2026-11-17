-- Keep community idea media in a private bucket and grant only scoped access.
-- The application stores objects as: communityId/userId/ideaId/randomObjectId.
-- Idea records are created before uploads, so policies can verify authorship
-- against the canonical idea document without granting broad bucket access.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quorlyth-idea-media',
  'quorlyth-idea-media',
  false,
  26214400,
  array[
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists quorlyth_idea_media_upload on storage.objects;
create policy quorlyth_idea_media_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quorlyth-idea-media'
  and pg_catalog.cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.docs idea
    where idea.path = 'ideas/' || (storage.foldername(name))[3]
      and idea.data->>'cid' = (storage.foldername(name))[1]
      and idea.data->>'authorId' = (select auth.uid())::text
  )
);

drop policy if exists quorlyth_idea_media_read on storage.objects;
create policy quorlyth_idea_media_read
on storage.objects for select to authenticated
using (
  bucket_id = 'quorlyth-idea-media'
  and pg_catalog.cardinality(storage.foldername(name)) = 3
  and exists (
    select 1
    from public.docs idea
    where idea.path = 'ideas/' || (storage.foldername(name))[3]
      and idea.data->>'cid' = (storage.foldername(name))[1]
      and private.can_read_doc(idea.path, idea.data)
  )
);

drop policy if exists quorlyth_idea_media_delete_unlinked on storage.objects;
create policy quorlyth_idea_media_delete_unlinked
on storage.objects for delete to authenticated
using (
  bucket_id = 'quorlyth-idea-media'
  and pg_catalog.cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and not exists (
    select 1
    from public.docs idea
    where idea.path = 'ideas/' || (storage.foldername(name))[3]
      and pg_catalog.jsonb_typeof(idea.data->'attachments') = 'array'
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements(idea.data->'attachments') attachment
        where attachment.value->>'path' = storage.objects.name
      )
  )
);

notify pgrst, 'reload schema';
