-- Lock the submitted payload during review. A community manager may write only
-- the review decision/feedback fields; identity, revision, summary, and file paths
-- remain immutable, and the project must still be active at review time.
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
    and coalesce(p_data->>'updatedAt', '') ~ '^[0-9]{10,16}$'
    and (
      p_data->>'status' <> 'changes_requested'
      or pg_catalog.length(pg_catalog.btrim(coalesce(p_data->>'reviewNote', ''))) >= 4
    )
    and pg_catalog.length(coalesce(p_data->>'reviewNote', '')) <= 1600
    and p_data->>'projectId' = p_data->>'ideaId'
    and private.can_manage_community(private.idea_community_id(p_data->>'ideaId'))
    and exists (
      select 1
      from public.docs current
      join public.docs project
        on project.path = 'projects/' || (current.data->>'projectId')
      where current.path = p_path
        and current.data->>'status' = 'submitted'
        and current.data->>'id' = p_data->>'id'
        and current.data->>'ideaId' = p_data->>'ideaId'
        and project.data->>'ideaId' = p_data->>'ideaId'
        and project.data->>'status' = 'active'
        and (p_data - 'status' - 'reviewNote' - 'reviewedAt' - 'reviewedBy' - 'updatedAt')
          is not distinct from
            (current.data - 'status' - 'reviewNote' - 'reviewedAt' - 'reviewedBy' - 'updatedAt')
    );
$function$;

-- Treat a missing attachment array as invalid rather than relying on SQL NULL's
-- three-valued logic. Existing clients always send a JSON array (possibly empty).
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
     or pg_catalog.jsonb_typeof(p_data->'attachments') is distinct from 'array'
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
