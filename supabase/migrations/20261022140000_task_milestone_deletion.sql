-- Allow project owners/managers to remove tasks and their linked evidence,
-- and community managers to remove milestones and their work submissions.
-- Storage stays private; managers may only delete objects inside a project/idea
-- namespace they are authorized to manage.

create or replace function private.can_delete_doc(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  uid text := (select auth.uid())::text;
  idea_id text;
  outcome_status text;
  project_id text;
begin
  if uid is null or p_path is null or p_data is null then return false; end if;
  if p_path = 'data/users/' || uid or p_path like 'data/users/' || uid || '/%' then return true; end if;
  if p_path ~ '^data/users/[^/]+(/.*)?$'
     or p_path = 'config/owner'
     or p_path ~ '^ideaOutcomes/[^/]+$' then
    return false;
  end if;
  if p_path ~ '^profiles/[^/]+$'
     or p_path ~ '^members/[^/]+$'
     or p_path ~ '^votes/[^/]+$'
     or p_path ~ '^requests/[^/]+$' then
    return split_part(p_path,'/',2) = uid;
  end if;
  if private.is_platform_admin() then return true; end if;

  if p_path ~ '^communities/[^/]+$' then
    return private.can_manage_community(split_part(p_path,'/',2));
  elsif p_path ~ '^ideas/[^/]+$' then
    idea_id := split_part(p_path,'/',2);
    select data->>'status' into outcome_status
      from public.docs where path = 'ideaOutcomes/' || idea_id;
    return private.is_idea_author(idea_id)
      and coalesce(outcome_status,'review') not in ('selected','promoted')
      and not exists (
        select 1 from public.docs v
        where v.path ~ '^volunteers/[^/]+$'
          and v.data->>'ideaId' = idea_id
      );
  elsif p_path ~ '^ideas/[^/]+/comments/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(split_part(p_path,'/',2)))
      or p_data->>'authorId' = uid;
  elsif p_path ~ '^reviews/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^volunteers/[^/]+$' then
    return p_data->>'applicantId' = uid
      and coalesce(p_data->>'status','pending') = 'pending';
  elsif p_path ~ '^projects/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^milestones/[^/]+$' then
    return private.can_manage_community(
      private.idea_community_id((
        select data->>'ideaId' from public.docs
        where path = 'projects/' || (p_data->>'projectId')
      ))
    );
  elsif p_path ~ '^workSubmissions/[^/]+$' then
    idea_id := p_data->>'ideaId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and private.can_manage_community(private.idea_community_id(idea_id))
      and exists (
        select 1 from public.docs milestone
        where milestone.path = 'milestones/' || (p_data->>'milestoneId')
          and milestone.data->>'projectId' = p_data->>'projectId'
      );
  elsif p_path ~ '^standaloneTasks/[^/]+$' then
    project_id := p_data->>'projectId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and project_id is not null
      and private.can_manage_standalone_project(project_id)
      and exists (
        select 1 from public.docs project
        where project.path = 'standaloneProjects/' || project_id
          and project.data->>'id' = project_id
      );
  elsif p_path ~ '^standaloneArtifacts/[^/]+$' then
    project_id := p_data->>'projectId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and project_id is not null
      and private.can_manage_standalone_project(project_id)
      and exists (
        select 1 from public.docs task
        where task.path = 'standaloneTasks/' || (p_data->>'taskId')
          and task.data->>'projectId' = project_id
      );
  elsif p_path ~ '^promotions/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^chatReads/[^/]+$'
     or p_path ~ '^chatPreferences/[^/]+$'
     or p_path ~ '^chatMessageHides/[^/]+$'
     or p_path ~ '^chatMessageReactions/[^/]+$' then
    return p_data->>'userId' = uid
      and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^conversations/[^/]+$' then
    return private.is_chat_member(split_part(p_path,'/',2));
  end if;
  return false;
end;
$function$;

drop policy if exists quorlyth_work_uploads_delete_for_project_managers on storage.objects;
create policy quorlyth_work_uploads_delete_for_project_managers
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'quorlyth-work-submissions'
  and cardinality(storage.foldername(name)) = 3
  and (
    private.can_manage_standalone_project((storage.foldername(name))[1])
    or private.can_manage_community(
      private.idea_community_id((storage.foldername(name))[1])
    )
  )
);

notify pgrst, 'reload schema';
