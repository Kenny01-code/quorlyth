-- The project collection is named standaloneProjects (plural).
-- Rebuild the trigger with the exact supported standalone collection names.
drop trigger if exists docs_notify_standalone_workspace_activity on public.docs;
create trigger docs_notify_standalone_workspace_activity
after insert or update on public.docs
for each row
when (new.path ~ '^standalone(Projects|Tasks|ProjectMembers|Artifacts|Comments)/[^/]+$')
execute function private.notify_standalone_workspace_activity();

notify pgrst, 'reload schema';
