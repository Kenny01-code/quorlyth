-- Quorlyth milestone work submissions and private attachment storage.
-- The docs table remains the collaboration system of record; file bytes are stored
-- in a private Supabase Storage bucket. All authorization is enforced by RLS.

create or replace function private.can_access_work_idea(p_idea_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select (select auth.uid()) is not null
    and p_idea_id is not null
    and (
      private.is_platform_admin()
      or private.is_idea_author(p_idea_id)
      or private.is_accepted_collaborator(p_idea_id)
      or private.can_manage_community(private.idea_community_id(p_idea_id))
    );
$function$;

create or replace function private.can_submit_milestone_work(p_idea_id text, p_milestone_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $function$
declare
  uid text := (select auth.uid())::text;
  project_data jsonb;
  milestone_data jsonb;
begin
  if uid is null or p_idea_id is null or p_milestone_id is null then
    return false;
  end if;

  select d.data into project_data
  from public.docs d
  where d.path = 'projects/' || p_idea_id;

  select d.data into milestone_data
  from public.docs d
  where d.path = 'milestones/' || p_milestone_id;

  if project_data is null or milestone_data is null then
    return false;
  end if;

  return project_data->>'ideaId' = p_idea_id
    and project_data->>'status' = 'active'
    and milestone_data->>'projectId' = p_idea_id
    and coalesce(milestone_data->>'status', 'todo') <> 'done'
    and coalesce(milestone_data->>'blocked', 'false') <> 'true'
    and (
      nullif(milestone_data->>'assigneeId', '') is null
      or milestone_data->>'assigneeId' = uid
    )
    and private.can_access_work_idea(p_idea_id);
end;
$function$;

create or replace function private.can_read_work_submission(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if p_path is null or p_data is null
     or p_path !~ '^workSubmissions/[^/]+$'
     or p_data->>'id' is distinct from pg_catalog.split_part(p_path, '/', 2)
     or p_data->>'ideaId' is null
     or p_data->>'projectId' is distinct from p_data->>'ideaId'
     or p_data->>'milestoneId' is null then
    return false;
  end if;

  return private.can_access_work_idea(p_data->>'ideaId')
    and exists (
      select 1
      from public.docs project
      where project.path = 'projects/' || (p_data->>'ideaId')
        and project.data->>'ideaId' = p_data->>'ideaId'
    )
    and exists (
      select 1
      from public.docs milestone
      where milestone.path = 'milestones/' || (p_data->>'milestoneId')
        and milestone.data->>'projectId' = p_data->>'ideaId'
    );
end;
$function$;

create or replace function private.can_insert_work_submission(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $function$
declare
  uid text := (select auth.uid())::text;
  idea_id text;
  milestone_id text;
  prefix text;
  attachment jsonb;
  attachment_path text;
  attachment_name text;
  attachment_size text;
begin
  if uid is null or p_path is null or p_data is null
     or pg_catalog.jsonb_typeof(p_data) <> 'object'
     or p_path !~ '^workSubmissions/[^/]+$'
     or p_data->>'id' is distinct from pg_catalog.split_part(p_path, '/', 2)
     or p_data->>'submittedBy' is distinct from uid
     or p_data->>'status' is distinct from 'submitted'
     or p_data ? 'reviewedAt'
     or p_data ? 'reviewedBy'
     or p_data->>'projectId' is distinct from p_data->>'ideaId'
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_data->>'summary', ''))) < 8
     or pg_catalog.length(coalesce(p_data->>'summary', '')) > 6000
     or coalesce(p_data->>'revision', '') !~ '^[1-9][0-9]{0,5}$'
     or coalesce(p_data->>'submittedAt', '') !~ '^[0-9]{10,16}$'
     or coalesce(p_data->>'updatedAt', '') !~ '^[0-9]{10,16}$'
     or pg_catalog.jsonb_typeof(p_data->'attachments') <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_data->'attachments', '[]'::jsonb)) > 8 then
    return false;
  end if;

  idea_id := p_data->>'ideaId';
  milestone_id := p_data->>'milestoneId';
  prefix := idea_id || '/' || milestone_id || '/' || uid || '/';

  if not private.can_submit_milestone_work(idea_id, milestone_id) then
    return false;
  end if;

  for attachment in
    select value from pg_catalog.jsonb_array_elements(coalesce(p_data->'attachments', '[]'::jsonb))
  loop
    if pg_catalog.jsonb_typeof(attachment) <> 'object' then return false; end if;
    attachment_path := coalesce(attachment->>'path', '');
    attachment_name := coalesce(attachment->>'name', '');
    attachment_size := coalesce(attachment->>'size', '');

    if pg_catalog.left(attachment_path, pg_catalog.length(prefix)) <> prefix
       or pg_catalog.length(attachment_name) < 1
       or pg_catalog.length(attachment_name) > 180
       or attachment_size !~ '^[0-9]{1,9}$'
       or attachment_size::numeric > 26214400
       or coalesce(attachment->>'mimeType', '') = ''
       or coalesce(attachment->>'uploadedAt', '') !~ '^[0-9]{10,16}$' then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;

create or replace function private.can_review_work_submission(p_path text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select p_path ~ '^workSubmissions/[^/]+$'
    and p_data->>'id' = pg_catalog.split_part(p_path, '/', 2)
    and p_data->>'status' = 'submitted'
    and private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
$function$;

create or replace function private.can_save_work_review(p_path text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select p_path ~ '^workSubmissions/[^/]+$'
    and p_data->>'id' = pg_catalog.split_part(p_path, '/', 2)
    and p_data->>'status' in ('approved', 'changes_requested')
    and p_data->>'reviewedBy' = (select auth.uid())::text
    and coalesce(p_data->>'reviewedAt', '') ~ '^[0-9]{10,16}$'
    and (
      p_data->>'status' <> 'changes_requested'
      or pg_catalog.length(pg_catalog.btrim(coalesce(p_data->>'reviewNote', ''))) >= 4
    )
    and pg_catalog.length(coalesce(p_data->>'reviewNote', '')) <= 1600
    and private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
$function$;

revoke all on function private.can_access_work_idea(text) from public, anon;
revoke all on function private.can_submit_milestone_work(text, text) from public, anon;
revoke all on function private.can_read_work_submission(text, jsonb) from public, anon;
revoke all on function private.can_insert_work_submission(text, jsonb) from public, anon;
revoke all on function private.can_review_work_submission(text, jsonb) from public, anon;
revoke all on function private.can_save_work_review(text, jsonb) from public, anon;
grant execute on function private.can_access_work_idea(text) to authenticated;
grant execute on function private.can_submit_milestone_work(text, text) to authenticated;
grant execute on function private.can_read_work_submission(text, jsonb) to authenticated;
grant execute on function private.can_insert_work_submission(text, jsonb) to authenticated;
grant execute on function private.can_review_work_submission(text, jsonb) to authenticated;
grant execute on function private.can_save_work_review(text, jsonb) to authenticated;

drop policy if exists docs_read_work_submissions on public.docs;
create policy docs_read_work_submissions
on public.docs for select to authenticated
using (private.can_read_work_submission(path, data));

drop policy if exists docs_insert_work_submissions on public.docs;
create policy docs_insert_work_submissions
on public.docs for insert to authenticated
with check (private.can_insert_work_submission(path, data));

drop policy if exists docs_review_work_submissions on public.docs;
create policy docs_review_work_submissions
on public.docs for update to authenticated
using (private.can_review_work_submission(path, data))
with check (private.can_save_work_review(path, data));

-- Keep submitted project files private. Signed URLs are issued for 15 minutes
-- by the client after its authenticated Storage request passes these policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quorlyth-work-submissions',
  'quorlyth-work-submissions',
  false,
  26214400,
  array[
    'image/*', 'video/*', 'audio/*',
    'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json',
    'application/octet-stream', 'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed',
    'application/vnd.rar',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists quorlyth_work_uploads_insert on storage.objects;
create policy quorlyth_work_uploads_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quorlyth-work-submissions'
  and pg_catalog.cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[3] = (select auth.uid())::text
  and private.can_submit_milestone_work((storage.foldername(name))[1], (storage.foldername(name))[2])
);

drop policy if exists quorlyth_work_uploads_read on storage.objects;
create policy quorlyth_work_uploads_read
on storage.objects for select to authenticated
using (
  bucket_id = 'quorlyth-work-submissions'
  and pg_catalog.cardinality(storage.foldername(name)) = 3
  and private.can_access_work_idea((storage.foldername(name))[1])
);

drop policy if exists quorlyth_work_uploads_delete_unsubmitted on storage.objects;
create policy quorlyth_work_uploads_delete_unsubmitted
on storage.objects for delete to authenticated
using (
  bucket_id = 'quorlyth-work-submissions'
  and pg_catalog.cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[3] = (select auth.uid())::text
  and not exists (
    select 1
    from public.docs d
    where d.path ~ '^workSubmissions/[^/]+$'
      and pg_catalog.jsonb_typeof(d.data->'attachments') = 'array'
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements(coalesce(d.data->'attachments', '[]'::jsonb)) attachment
        where attachment.value->>'path' = storage.objects.name
      )
  );
