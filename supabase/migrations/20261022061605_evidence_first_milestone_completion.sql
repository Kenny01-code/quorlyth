create or replace function private.enforce_evidence_first_project_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  milestone_id text;
  previous_updated_ms numeric := 0;
begin
  -- New submissions must contain at least one real attachment record. The
  -- storage paths and file ownership remain validated by the existing RLS
  -- helper; this guard makes an empty progress note insufficient.
  if NEW.path ~ '^workSubmissions/[^/]+$' then
    if NEW.data->>'status' = 'submitted' and (
      jsonb_typeof(NEW.data->'attachments') is distinct from 'array'
      or jsonb_array_length(
        case
          when jsonb_typeof(NEW.data->'attachments') = 'array' then NEW.data->'attachments'
          else '[]'::jsonb
        end
      ) = 0
    ) then
      raise exception 'Attach at least one piece of evidence before submitting work for review.'
        using errcode = '22023';
    end if;
    return NEW;
  end if;

  if NEW.path !~ '^milestones/[^/]+$'
    or coalesce(NEW.data->>'status', 'todo') not in ('done', 'completed') then
    return NEW;
  end if;

  -- Editing an already-complete milestone does not constitute a new completion.
  -- Re-opening it updates updatedAt, which means a fresh approval is required
  -- before it can become complete again.
  if TG_OP = 'UPDATE' then
    if coalesce(OLD.data->>'status', 'todo') in ('done', 'completed') then
      return NEW;
    end if;

    if coalesce(OLD.data->>'updatedAt', '') ~ '^[0-9]{10,16}$' then
      previous_updated_ms := (OLD.data->>'updatedAt')::numeric;
    elsif coalesce(OLD.data->>'at', '') ~ '^[0-9]{10,16}$' then
      previous_updated_ms := (OLD.data->>'at')::numeric;
    end if;
  end if;

  milestone_id := split_part(NEW.path, '/', 2);

  if not exists (
    select 1
    from public.docs submission
    where submission.path ~ '^workSubmissions/[^/]+$'
      and submission.data->>'milestoneId' = milestone_id
      and submission.data->>'projectId' = NEW.data->>'projectId'
      and submission.data->>'status' = 'approved'
      and submission.data->>'submittedBy' is not null
      and submission.data->>'reviewedBy' is not null
      and submission.data->>'submittedBy' is distinct from submission.data->>'reviewedBy'
      and coalesce(submission.data->>'reviewedAt', '') ~ '^[0-9]{10,16}$'
      and (
        case
          when jsonb_typeof(submission.data->'attachments') = 'array'
            then jsonb_array_length(submission.data->'attachments') > 0
          else false
        end
      )
      and (submission.data->>'reviewedAt')::numeric > previous_updated_ms
  ) then
    raise exception 'A milestone can only be completed after a different authorized reviewer approves a submission with evidence.'
      using errcode = '42501';
  end if;

  return NEW;
end;
$function$;

drop trigger if exists docs_enforce_evidence_first_project_completion on public.docs;

create trigger docs_enforce_evidence_first_project_completion
before insert or update on public.docs
for each row
when (NEW.path ~ '^(milestones|workSubmissions)/[^/]+$')
execute function private.enforce_evidence_first_project_completion();

revoke all on function private.enforce_evidence_first_project_completion() from public, anon, authenticated;
