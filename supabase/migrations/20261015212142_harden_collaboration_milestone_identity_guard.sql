-- Also guard attempts to rename a non-milestone document into/out of the milestone
-- namespace. This closes a path-identity bypass that an OLD-only trigger condition misses.
create or replace function private.guard_collaboration_milestone_identity()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.path ~ '^milestones/[^/]+$'
     or new.path ~ '^milestones/[^/]+$' then
    if new.path is distinct from old.path
       or new.data->>'projectId' is distinct from old.data->>'projectId'
       or new.data->>'createdBy' is distinct from old.data->>'createdBy' then
      raise exception 'A milestone cannot be moved to another project or reassigned to another creator.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_collaboration_milestone_identity on public.docs;
create trigger guard_collaboration_milestone_identity
before update of path, data on public.docs
for each row
execute function private.guard_collaboration_milestone_identity();
