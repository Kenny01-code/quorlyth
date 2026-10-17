-- Prevent review decisions when a project is no longer active. Pending work must
-- be reviewed while the workspace is open, or the manager must reopen it first.
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
    and private.can_manage_community(private.idea_community_id(p_data->>'ideaId'))
    and exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (p_data->>'ideaId')
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
    and p_data->>'reviewedBy' = (select auth.uid())::text
    and coalesce(p_data->>'reviewedAt', '') ~ '^[0-9]{10,16}$'
    and (
      p_data->>'status' <> 'changes_requested'
      or pg_catalog.length(pg_catalog.btrim(coalesce(p_data->>'reviewNote', ''))) >= 4
    )
    and pg_catalog.length(coalesce(p_data->>'reviewNote', '')) <= 1600
    and private.can_manage_community(private.idea_community_id(p_data->>'ideaId'))
    and exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (p_data->>'ideaId')
        and project.data->>'status' = 'active'
    );
$function$;
