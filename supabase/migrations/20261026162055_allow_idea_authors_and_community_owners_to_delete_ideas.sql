CREATE OR REPLACE FUNCTION private.can_delete_doc(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
  idea_id text;
  outcome_status text;
  project_id text;
begin
  if uid is null or p_path is null or p_data is null then return false; end if;
  if p_path = 'data/users/' || uid or p_path like 'data/users/' || uid || '/%' then return true; end if;
  if p_path ~ '^data/users/[^/]+(/.*)?$'
     or p_path = 'config/owner' then
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
  elsif p_path ~ '^ideaOutcomes/[^/]+$' then
    idea_id := split_part(p_path,'/',2);
    return private.is_idea_author(idea_id)
      or private.can_manage_community(private.idea_community_id(idea_id));
  elsif p_path ~ '^ideas/[^/]+$' then
    idea_id := split_part(p_path,'/',2);
    return private.is_idea_author(idea_id)
      or private.can_manage_community(private.idea_community_id(idea_id));
  elsif p_path ~ '^ideas/[^/]+/comments/[^/]+$' then
    idea_id := split_part(p_path,'/',2);
    return private.can_manage_community(private.idea_community_id(idea_id))
      or private.is_idea_author(idea_id)
      or p_data->>'authorId' = uid;
  elsif p_path ~ '^reviews/[^/]+$' then
    idea_id := split_part(p_path,'/',2);
    return private.can_manage_community(private.idea_community_id(idea_id))
      or private.is_idea_author(idea_id);
  elsif p_path ~ '^volunteers/[^/]+$' then
    return (p_data->>'applicantId' = uid
      and coalesce(p_data->>'status','pending') = 'pending')
      or private.is_idea_author(p_data->>'ideaId')
      or private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^projects/[^/]+$' then
    idea_id := coalesce(p_data->>'ideaId', split_part(p_path,'/',2));
    return private.can_manage_community(private.idea_community_id(idea_id))
      or private.is_idea_author(idea_id);
  elsif p_path ~ '^milestones/[^/]+$' then
    idea_id := (
      select data->>'ideaId' from public.docs
      where path = 'projects/' || (p_data->>'projectId')
    );
    return private.can_manage_community(private.idea_community_id(idea_id))
      or private.is_idea_author(idea_id);
  elsif p_path ~ '^workSubmissions/[^/]+$' then
    idea_id := p_data->>'ideaId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and (
        private.can_manage_community(private.idea_community_id(idea_id))
        or private.is_idea_author(idea_id)
      )
      and exists (
        select 1 from public.docs milestone
        where milestone.path = 'milestones/' || (p_data->>'milestoneId')
          and milestone.data->>'projectId' = p_data->>'projectId'
      );
  elsif p_path ~ '^standaloneProjects/[^/]+$' then
    project_id := split_part(p_path,'/',2);
    return p_data->>'id' = project_id
      and p_data->>'createdBy' = uid;
  elsif p_path ~ '^standaloneProjectMembers/[^/]+$' then
    project_id := p_data->>'projectId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and (p_data->>'userId' = uid or private.can_manage_standalone_project(project_id));
  elsif p_path ~ '^standaloneComments/[^/]+$'
     or p_path ~ '^standaloneGithubRepos/[^/]+$'
     or p_path ~ '^standaloneActivity/[^/]+$' then
    project_id := p_data->>'projectId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and project_id is not null
      and private.can_manage_standalone_project(project_id);
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
    idea_id := p_data->>'ideaId';
    return private.can_manage_community(private.idea_community_id(idea_id))
      or private.is_idea_author(idea_id);
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

CREATE OR REPLACE FUNCTION private.can_delete_managed_work_upload(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  parts text[] := storage.foldername(p_name);
begin
  if (select auth.uid()) is null or p_name is null or coalesce(cardinality(parts), 0) <> 3 then
    return false;
  end if;

  return private.can_manage_standalone_project(parts[1])
    or private.can_manage_community(private.idea_community_id(parts[1]))
    or (
      exists (
        select 1 from public.docs project
        where project.path = 'projects/' || parts[1]
          and project.data->>'ideaId' = parts[1]
      )
      and private.is_idea_author(parts[1])
    );
end;
$function$;

CREATE OR REPLACE FUNCTION private.cleanup_deleted_idea_votes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  deleted_idea_id text;
begin
  deleted_idea_id := pg_catalog.split_part(OLD.path, '/', 2);
  update public.docs vote_doc
    set data = pg_catalog.jsonb_set(
      vote_doc.data,
      '{ideas}',
      coalesce(vote_doc.data->'ideas', '{}'::jsonb) - deleted_idea_id,
      true
    ),
    updated_at = pg_catalog.now()
  where vote_doc.path ~ '^votes/[^/]+$'
    and pg_catalog.jsonb_typeof(coalesce(vote_doc.data->'ideas', '{}'::jsonb)) = 'object'
    and (vote_doc.data->'ideas') ? deleted_idea_id;
  return OLD;
end;
$function$;

revoke all on function private.cleanup_deleted_idea_votes() from public, anon, authenticated;
drop trigger if exists cleanup_deleted_idea_votes on public.docs;
create trigger cleanup_deleted_idea_votes
after delete on public.docs
for each row
when (OLD.path ~ '^ideas/[^/]+$')
execute function private.cleanup_deleted_idea_votes();
notify pgrst, 'reload schema';
