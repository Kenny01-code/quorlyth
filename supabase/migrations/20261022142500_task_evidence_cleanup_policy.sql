-- Storage RLS evaluates helper execution as the authenticated caller.
-- Encapsulate manager checks in a narrowly scoped SECURITY DEFINER function
-- so private.idea_community_id need not be exposed to signed-in clients.

create or replace function private.can_delete_managed_work_upload(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  parts text[] := storage.foldername(p_name);
begin
  if (select auth.uid()) is null or p_name is null or coalesce(cardinality(parts), 0) <> 3 then
    return false;
  end if;

  return private.can_manage_standalone_project(parts[1])
    or private.can_manage_community(private.idea_community_id(parts[1]));
end;
$function$;

revoke all on function private.can_delete_managed_work_upload(text) from public, anon;
grant execute on function private.can_delete_managed_work_upload(text) to authenticated;

drop policy if exists quorlyth_work_uploads_delete_for_project_managers on storage.objects;
create policy quorlyth_work_uploads_delete_for_project_managers
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'quorlyth-work-submissions'
  and cardinality(storage.foldername(name)) = 3
  and private.can_delete_managed_work_upload(name)
);

notify pgrst, 'reload schema';
