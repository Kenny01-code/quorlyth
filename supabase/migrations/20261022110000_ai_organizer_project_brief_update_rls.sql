-- Let approved AI organizers update an existing project brief on the UPDATE path.
-- The strict WITH CHECK helper validates the new document; the USING helper validates
-- that the signed-in user is allowed to target this project's brief for an update.
create or replace function private.can_access_ai_organizer_project_brief(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  idea_id text;
begin
  if p_path is null
    or p_path !~ '^projects/[A-Za-z0-9_-]{1,120}$'
    or p_data is null
    or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;

  idea_id := split_part(p_path, '/', 2);
  if p_data->>'ideaId' is distinct from idea_id then
    return false;
  end if;

  return private.can_organize_idea_with_ai(idea_id);
end;
$function$;

revoke all on function private.can_access_ai_organizer_project_brief(text, jsonb) from public, anon;
grant execute on function private.can_access_ai_organizer_project_brief(text, jsonb) to authenticated;

drop policy if exists docs_update_scoped on public.docs;
create policy docs_update_scoped on public.docs
for update to authenticated
using (
  (select private.can_update_doc(path, data))
  or (select private.can_access_ai_organizer_project_brief(path, data))
  or (select private.can_update_ai_organizer_request(path, data))
  or (select private.can_review_pending_collaboration_application(path, data))
  or (select private.can_review_work_submission(path, data))
  or (select private.can_update_ai_organizer_project_brief(path, data))
  or (select private.can_update_standalone_doc(path, data))
)
with check (
  (select private.can_update_doc(path, data))
  or (select private.can_save_ai_organizer_request(path, data))
  or (select private.can_decide_collaboration_application(path, data))
  or (select private.can_save_work_review(path, data))
  or (select private.can_update_ai_organizer_project_brief(path, data))
  or (select private.can_update_standalone_doc(path, data))
);

notify pgrst, 'reload schema';
