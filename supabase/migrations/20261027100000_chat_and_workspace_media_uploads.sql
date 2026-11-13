-- Private media storage for messages and standalone workspace discussion.
-- Storage keys are <conversation-or-workspace-id>/<uploader-uid>/<unique-filename>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quorlyth-chat-attachments', 'quorlyth-chat-attachments', false, 26214400, null)
on conflict (id) do update
  set public = false, file_size_limit = 26214400, allowed_mime_types = null;

drop policy if exists quorlyth_chat_media_insert on storage.objects;
create policy quorlyth_chat_media_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'quorlyth-chat-attachments'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    (select public.is_chat_member((storage.foldername(name))[1]))
    or (select private.is_standalone_project_member((storage.foldername(name))[1], array['owner','manager','contributor','viewer']::text[]))
    or exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (storage.foldername(name))[1]
        and (select private.can_access_work_idea((storage.foldername(name))[1]))
    )
  )
);

drop policy if exists quorlyth_chat_media_read on storage.objects;
create policy quorlyth_chat_media_read
on storage.objects for select to authenticated
using (
  bucket_id = 'quorlyth-chat-attachments'
  and (
    (select public.is_chat_member((storage.foldername(name))[1]))
    or (select private.is_standalone_project_member((storage.foldername(name))[1], array['owner','manager','contributor','viewer']::text[]))
    or exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (storage.foldername(name))[1]
        and (select private.can_access_work_idea((storage.foldername(name))[1]))
    )
  )
);

drop policy if exists quorlyth_chat_media_delete on storage.objects;
create policy quorlyth_chat_media_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'quorlyth-chat-attachments'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    (select public.is_chat_member((storage.foldername(name))[1]))
    or (select private.is_standalone_project_member((storage.foldername(name))[1], array['owner','manager','contributor','viewer']::text[]))
    or exists (
      select 1 from public.docs project
      where project.path = 'projects/' || (storage.foldername(name))[1]
        and (select private.can_access_work_idea((storage.foldername(name))[1]))
    )
  )
);

-- Notify participants about standalone workspace invitations, assignments, reviews and discussion.
create or replace function private.notify_standalone_workspace_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_actor text;
  v_project_id text;
  v_project jsonb;
  v_project_title text;
  v_task_title text;
  v_recipient text;
  v_submitter text;
  v_at bigint;
begin
  if tg_op = 'DELETE' then return old; end if;

  v_actor := coalesce(
    (select auth.uid())::text,
    nullif(new.data->>'createdBy',''),
    nullif(new.data->>'authorId',''),
    nullif(new.data->>'submittedBy',''),
    nullif(new.data->>'invitedBy','')
  );
  v_at := coalesce(
    nullif(new.data->>'updatedAt','')::bigint,
    nullif(new.data->>'submittedAt','')::bigint,
    nullif(new.data->>'at','')::bigint,
    (extract(epoch from clock_timestamp()) * 1000)::bigint
  );

  if new.path ~ '^standaloneProjects/[^/]+$' then
    v_project_id := split_part(new.path, '/', 2);
    v_project_title := coalesce(new.data->>'title', 'a project workspace');

    if tg_op = 'UPDATE'
      and (old.data - 'updatedAt') is distinct from (new.data - 'updatedAt') then
      for v_recipient in
        select member.data->>'userId'
        from public.docs member
        where member.path like 'standaloneProjectMembers/' || v_project_id || '__%'
          and member.data->>'projectId' = v_project_id
          and member.data->>'status' = 'active'
          and member.data->>'userId' <> coalesce(v_actor, '')
        union
        select project.data->>'createdBy'
        from public.docs project
        where project.path = new.path
          and project.data->>'createdBy' <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient,
          'workspace-updated:' || new.path || ':' || txid_current(),
          'workspace',
          'workspace',
          'Workspace "' || v_project_title || '" was updated',
          v_project_id,
          v_project_id,
          v_at
        );
      end loop;
    end if;
    return new;
  end if;

  if new.path ~ '^standaloneProjectMembers/[^/]+$' then
    v_project_id := coalesce(
      new.data->>'projectId',
      split_part(split_part(new.path, '/', 2), '__', 1)
    );
    select project.data into v_project
    from public.docs project
    where project.path = 'standaloneProjects/' || v_project_id;
    v_project_title := coalesce(v_project->>'title', 'a project workspace');

    if new.data->>'status' = 'invited'
      and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'invited') then
      v_recipient := new.data->>'userId';
      if v_recipient is not null and v_recipient <> coalesce(v_actor, '') then
        perform private.emit_quorlyth_notification(
          v_recipient,
          'workspace-invite:' || new.path || ':' || txid_current(),
          'workspace',
          'invite',
          'You were invited to "' || v_project_title || '" as a ' || coalesce(new.data->>'role','contributor'),
          v_project_id,
          v_project_id,
          v_at
        );
      end if;
    elsif tg_op = 'UPDATE'
      and old.data->>'status' = 'invited'
      and new.data->>'status' = 'active' then
      v_recipient := coalesce(new.data->>'invitedBy', v_project->>'createdBy');
      if v_recipient is not null and v_recipient <> coalesce(v_actor, '') then
        perform private.emit_quorlyth_notification(
          v_recipient,
          'workspace-invite-accepted:' || new.path || ':' || txid_current(),
          'workspace',
          'member',
          coalesce(new.data->>'userId','A teammate') || ' accepted the invitation to "' || v_project_title || '"',
          v_project_id,
          v_project_id,
          v_at
        );
      end if;
    elsif tg_op = 'UPDATE' and old.data->>'role' is distinct from new.data->>'role' then
      v_recipient := new.data->>'userId';
      if v_recipient is not null and v_recipient <> coalesce(v_actor, '') then
        perform private.emit_quorlyth_notification(
          v_recipient,
          'workspace-role:' || new.path || ':' || txid_current(),
          'workspace',
          'settings',
          'Your role in "' || v_project_title || '" is now ' || coalesce(new.data->>'role','member'),
          v_project_id,
          v_project_id,
          v_at
        );
      end if;
    end if;
    return new;
  end if;

  if new.path ~ '^standaloneTasks/[^/]+$' then
    v_project_id := new.data->>'projectId';
    select project.data into v_project
    from public.docs project
    where project.path = 'standaloneProjects/' || v_project_id;
    v_project_title := coalesce(v_project->>'title', 'your workspace');
    v_task_title := coalesce(new.data->>'title', 'a task');

    if tg_op = 'INSERT'
      or old.data->'assigneeIds' is distinct from new.data->'assigneeIds'
      or old.data->>'assigneeId' is distinct from new.data->>'assigneeId' then
      for v_recipient in
        select distinct assigned.assignee
        from (
          select jsonb_array_elements_text(
            case
              when jsonb_typeof(new.data->'assigneeIds') = 'array' then new.data->'assigneeIds'
              else '[]'::jsonb
            end
          ) as assignee
          union all
          select nullif(new.data->>'assigneeId','') as assignee
        ) assigned
        where assigned.assignee is not null
          and assigned.assignee <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient,
          'workspace-task-assigned:' || new.path || ':' || txid_current(),
          'task',
          'collab',
          'You were assigned to "' || v_task_title || '" in "' || v_project_title || '"',
          split_part(new.path, '/', 2),
          v_project_id,
          v_at
        );
      end loop;
    end if;

    if tg_op = 'UPDATE'
      and old.data->>'status' is distinct from 'done'
      and new.data->>'status' = 'done' then
      for v_recipient in
        select member.data->>'userId'
        from public.docs member
        where member.path like 'standaloneProjectMembers/' || v_project_id || '__%'
          and member.data->>'projectId' = v_project_id
          and member.data->>'status' = 'active'
          and member.data->>'userId' <> coalesce(v_actor, '')
        union
        select v_project->>'createdBy'
        where v_project->>'createdBy' is not null
          and v_project->>'createdBy' <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient,
          'workspace-task-completed:' || new.path || ':' || txid_current(),
          'task',
          'complete',
          'Task "' || v_task_title || '" was marked complete',
          split_part(new.path, '/', 2),
          v_project_id,
          v_at
        );
      end loop;
    end if;
    return new;
  end if;

  if new.path ~ '^standaloneArtifacts/[^/]+$' then
    v_project_id := new.data->>'projectId';
    select project.data into v_project
    from public.docs project
    where project.path = 'standaloneProjects/' || v_project_id;
    v_project_title := coalesce(v_project->>'title', 'your workspace');
    v_task_title := coalesce(
      (select task.data->>'title'
       from public.docs task
       where task.path = 'standaloneTasks/' || (new.data->>'taskId')),
      'the task'
    );

    if tg_op = 'INSERT' and new.data->>'status' = 'submitted' then
      for v_recipient in
        select v_project->>'createdBy'
        where v_project->>'createdBy' is not null
          and v_project->>'createdBy' <> coalesce(v_actor, '')
        union
        select member.data->>'userId'
        from public.docs member
        where member.path like 'standaloneProjectMembers/' || v_project_id || '__%'
          and member.data->>'projectId' = v_project_id
          and member.data->>'status' = 'active'
          and member.data->>'role' in ('owner','manager')
          and member.data->>'userId' <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient,
          'workspace-evidence-submitted:' || new.path || ':' || txid_current(),
          'task',
          'review',
          coalesce(
            (select profile.data->>'name'
             from public.docs profile
             where profile.path = 'profiles/' || v_actor),
            'A teammate'
          ) || ' submitted evidence for "' || v_task_title || '"',
          v_project_id,
          v_project_id,
          v_at
        );
      end loop;
    elsif tg_op = 'UPDATE'
      and old.data->>'status' is distinct from new.data->>'status'
      and new.data->>'status' in ('approved','changes_requested') then
      v_submitter := new.data->>'submittedBy';
      if v_submitter is not null and v_submitter <> coalesce(v_actor, '') then
        perform private.emit_quorlyth_notification(
          v_submitter,
          'workspace-evidence-review:' || new.path || ':' || txid_current(),
          'task',
          case when new.data->>'status' = 'approved' then 'approve' else 'alert' end,
          'Your evidence for "' || v_task_title || '" was ' ||
            case when new.data->>'status' = 'approved' then 'approved' else 'returned for changes' end,
          v_project_id,
          v_project_id,
          v_at
        );
      end if;
    end if;
    return new;
  end if;

  if new.path ~ '^standaloneComments/[^/]+$' and tg_op = 'INSERT' then
    v_project_id := new.data->>'projectId';
    select project.data into v_project
    from public.docs project
    where project.path = 'standaloneProjects/' || v_project_id;
    v_project_title := coalesce(v_project->>'title', 'your workspace');
    for v_recipient in
      select member.data->>'userId'
      from public.docs member
      where member.path like 'standaloneProjectMembers/' || v_project_id || '__%'
        and member.data->>'projectId' = v_project_id
        and member.data->>'status' = 'active'
        and member.data->>'userId' <> coalesce(v_actor, '')
      union
      select v_project->>'createdBy'
      where v_project->>'createdBy' is not null
        and v_project->>'createdBy' <> coalesce(v_actor, '')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient,
        'workspace-discussion:' || new.path || ':' || txid_current(),
        'workspace',
        'message',
        coalesce(
          (select profile.data->>'name'
           from public.docs profile
           where profile.path = 'profiles/' || v_actor),
          'A teammate'
        ) || ' posted in "' || v_project_title || '"',
        v_project_id,
        v_project_id,
        v_at
      );
    end loop;
  end if;

  return new;
end;
$function$;

revoke all on function private.notify_standalone_workspace_activity() from public, anon, authenticated, service_role;
drop trigger if exists docs_notify_standalone_workspace_activity on public.docs;
create trigger docs_notify_standalone_workspace_activity
after insert or update on public.docs
for each row
when (new.path ~ '^standalone(Project|Tasks|ProjectMembers|Artifacts|Comments)/[^/]+$')
execute function private.notify_standalone_workspace_activity();

notify pgrst, 'reload schema';
