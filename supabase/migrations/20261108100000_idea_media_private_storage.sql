-- Private idea media uses <community>/<uploader>/<idea>/<object-id> paths.
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
on conflict (id) do update
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists quorlyth_idea_media_insert on storage.objects;
create policy quorlyth_idea_media_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quorlyth-idea-media'
  and cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.can_post_to_community((storage.foldername(name))[1]))
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
  and cardinality(storage.foldername(name)) = 3
  and (select private.can_view_community((storage.foldername(name))[1]))
  and (select private.idea_community_id((storage.foldername(name))[3])) = (storage.foldername(name))[1]
);

drop policy if exists quorlyth_idea_media_delete on storage.objects;
create policy quorlyth_idea_media_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'quorlyth-idea-media'
  and cardinality(storage.foldername(name)) = 3
  and (
    (select private.can_manage_community((storage.foldername(name))[1]))
    or (
      (storage.foldername(name))[2] = (select auth.uid())::text
      and exists (
        select 1
        from public.docs idea
        where idea.path = 'ideas/' || (storage.foldername(name))[3]
          and idea.data->>'cid' = (storage.foldername(name))[1]
          and idea.data->>'authorId' = (select auth.uid())::text
      )
    )
  )
);
