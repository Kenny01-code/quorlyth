-- A reviewer must be a different user from the contributor who submitted the work.
-- Enforce this in database RLS, not only in the client UI.
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
    and p_data->>'submittedBy' is not null
    and p_data->>'submittedBy' <> (select auth.uid())::text
    and private.can_manage_community(private.idea_community_id(p_data->>'ideaId'))
    and exists (
      select 1
      from public.docs project
      where project.path = 'projects/' || (p_data->>'ideaId')
        and project.data->>'ideaId' = p_data->>'ideaId'
        and project.data->>'status' = 'active'
    );
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
    and p_data->>'submittedBy' is not null
    and p_data->>'submittedBy' <> (select auth.uid())::text
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

notify pgrst, 'reload schema';
