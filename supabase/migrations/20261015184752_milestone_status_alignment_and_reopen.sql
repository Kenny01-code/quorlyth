-- Align milestone persistence with the app's "done" status and permit authorized reopening.
-- All existing ownership and community-scoped RLS checks remain in force.
CREATE OR REPLACE FUNCTION private.validate_doc_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare entry record; old_data jsonb;
begin
  if NEW.path is null or length(NEW.path) > 500
    or NEW.path !~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$'
    or jsonb_typeof(NEW.data) is distinct from 'object'
    or pg_column_size(NEW.data) > 131072 then
    raise exception 'Invalid document path or payload' using errcode = '22023';
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.path is distinct from OLD.path then raise exception 'Document paths are immutable' using errcode = '42501'; end if;
    old_data := OLD.data;
  else
    -- createSupabaseStore uses ON CONFLICT upsert for mutable docs. Resolve an existing
    -- path here so update guards/rate budgets apply only to genuinely new records.
    select d.data into old_data from public.docs d where d.path = NEW.path;
    if old_data is null and NEW.path ~ '^ideas/[^/]+$' then
      perform private.enforce_write_rate_limit('idea_submission', 10);
    elsif old_data is null and NEW.path ~ '^volunteers/[^/]+$' then
      perform private.enforce_write_rate_limit('collaboration_application', 5);
    end if;
  end if;

  if NEW.path ~ '^communities/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{name}',to_jsonb(private.sanitize_plain_text(NEW.data->>'name',100)),true);
    NEW.data := jsonb_set(NEW.data,'{purpose}',to_jsonb(private.sanitize_plain_text(NEW.data->>'purpose',1200)),true);
    NEW.data := jsonb_set(NEW.data,'{welcome}',to_jsonb(private.sanitize_plain_text(NEW.data->>'welcome',1200)),true);
    NEW.data := jsonb_set(NEW.data,'{rules}',to_jsonb(private.sanitize_plain_text(NEW.data->>'rules',3000)),true);
    if length(trim(coalesce(NEW.data->>'name',''))) < 1
      or coalesce(NEW.data->>'vis','listed') not in ('listed','unlisted')
      or coalesce(NEW.data->>'post','anyone') not in ('anyone','members','owner') then
      raise exception 'Invalid community name, visibility, or posting rule' using errcode = '22023';
    end if;
    if old_data is not null and (old_data->>'ownerId' is distinct from NEW.data->>'ownerId'
      or old_data->>'createdBy' is distinct from NEW.data->>'createdBy') then
      raise exception 'Community ownership is immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^ideas/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{title}',to_jsonb(private.sanitize_plain_text(NEW.data->>'title',120)),true);
    NEW.data := jsonb_set(NEW.data,'{body}',to_jsonb(private.sanitize_plain_text(NEW.data->>'body',6000)),true);
    if length(trim(coalesce(NEW.data->>'title',''))) < 1
      or jsonb_typeof(coalesce(NEW.data->'tags','[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(NEW.data->'tags','[]'::jsonb)) > 20 then
      raise exception 'Invalid idea title, body, or tags' using errcode = '22023';
    end if;
    if old_data is not null and (old_data->>'authorId' is distinct from NEW.data->>'authorId'
      or old_data->>'cid' is distinct from NEW.data->>'cid' or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Idea author, community, and creation time are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^ideas/[^/]+/comments/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{text}',to_jsonb(private.sanitize_plain_text(NEW.data->>'text',4000)),true);
    if length(trim(coalesce(NEW.data->>'text',''))) < 1 then raise exception 'Comment cannot be empty' using errcode = '22023'; end if;
    if old_data is not null and (old_data->>'authorId' is distinct from NEW.data->>'authorId'
      or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Comment authorship is immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^profiles/[^/]+$' then
    if NEW.data ? 'name' then NEW.data := jsonb_set(NEW.data,'{name}',to_jsonb(private.sanitize_plain_text(NEW.data->>'name',80)),true); end if;
    if NEW.data ? 'head' then NEW.data := jsonb_set(NEW.data,'{head}',to_jsonb(private.sanitize_plain_text(NEW.data->>'head',160)),true); end if;
    if NEW.data ? 'bio' then NEW.data := jsonb_set(NEW.data,'{bio}',to_jsonb(private.sanitize_plain_text(NEW.data->>'bio',1800)),true); end if;
  elsif NEW.path ~ '^members/[^/]+$' then
    if jsonb_typeof(coalesce(NEW.data->'c','{}'::jsonb)) <> 'object' then raise exception 'Invalid membership map' using errcode = '22023'; end if;
    for entry in select key,value from jsonb_each(coalesce(NEW.data->'c','{}'::jsonb)) loop
      if entry.value not in ('true'::jsonb,'false'::jsonb) then raise exception 'Invalid membership value' using errcode = '22023'; end if;
      if entry.value = 'true'::jsonb
        and not exists (select 1 from public.docs c
          where c.path = 'communities/' || entry.key and coalesce(c.data->>'arch','false') <> 'true')
        and coalesce(old_data->'c'->>entry.key,'false') <> 'true' then
        raise exception 'Membership must reference an existing, active community' using errcode = '22023';
      end if;
    end loop;
  elsif NEW.path ~ '^votes/[^/]+$' then
    if jsonb_typeof(coalesce(NEW.data->'ideas','{}'::jsonb)) <> 'object' then raise exception 'Invalid votes map' using errcode = '22023'; end if;
    for entry in select key,value from jsonb_each(coalesce(NEW.data->'ideas','{}'::jsonb)) loop
      if entry.value not in ('true'::jsonb,'false'::jsonb) then raise exception 'Invalid vote value' using errcode = '22023'; end if;
      if entry.value = 'true'::jsonb and not exists (select 1 from public.docs i
        where i.path = 'ideas/' || entry.key and private.can_view_community(i.data->>'cid')) then
        raise exception 'Vote must reference an existing, visible idea' using errcode = '22023';
      end if;
    end loop;
  elsif NEW.path ~ '^reviews/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{reason}',to_jsonb(private.sanitize_plain_text(NEW.data->>'reason',3000)),true);
    if coalesce(NEW.data->>'status','review') not in ('review','selected','held','declined','promoted') then
      raise exception 'Invalid review status' using errcode = '22023';
    end if;
    for entry in select key,value from jsonb_each(NEW.data) where key in ('score','f','o','r') loop
      if jsonb_typeof(entry.value) <> 'number' or (entry.value::text)::numeric < 0 or (entry.value::text)::numeric > 100 then
        raise exception 'Review scores must be numbers between 0 and 100' using errcode = '22023';
      end if;
    end loop;
  elsif NEW.path ~ '^volunteers/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{message}',to_jsonb(private.sanitize_plain_text(NEW.data->>'message',3000)),true);
    if coalesce(NEW.data->>'status','pending') not in ('pending','accepted','declined') then raise exception 'Invalid application status' using errcode = '22023'; end if;
    if old_data is not null then
      if old_data->>'applicantId' is distinct from NEW.data->>'applicantId'
        or old_data->>'ideaId' is distinct from NEW.data->>'ideaId'
        or old_data->>'at' is distinct from NEW.data->>'at' then
        raise exception 'Application owner, idea, and creation time are immutable' using errcode = '42501';
      end if;
      if old_data->>'status' in ('accepted','declined') and (
        old_data->>'status' is distinct from NEW.data->>'status'
        or old_data->>'reviewedBy' is distinct from NEW.data->>'reviewedBy'
        or old_data->>'reviewedAt' is distinct from NEW.data->>'reviewedAt'
      ) then
        raise exception 'Reviewed applications and their audit fields are immutable' using errcode = '22023';
      end if;
      if NEW.data->>'status' is distinct from old_data->>'status'
        and NEW.data->>'reviewedBy' is distinct from (select auth.uid())::text then
        raise exception 'A creator decision must identify its authenticated reviewer' using errcode = '42501';
      end if;
    end if;
  elsif NEW.path ~ '^projects/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{summary}',to_jsonb(private.sanitize_plain_text(NEW.data->>'summary',4000)),true);
    if NEW.data->>'ideaId' is distinct from split_part(NEW.path,'/',2)
      or length(trim(coalesce(NEW.data->>'summary',''))) < 1
      or coalesce(NEW.data->>'status','active') not in ('active','completed') then
      raise exception 'Invalid project fields or status' using errcode = '22023';
    end if;
    if old_data is not null and (old_data->>'ideaId' is distinct from NEW.data->>'ideaId'
      or old_data->>'createdBy' is distinct from NEW.data->>'createdBy'
      or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Project ownership and idea association are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^milestones/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{title}',to_jsonb(private.sanitize_plain_text(NEW.data->>'title',120)),true);
    NEW.data := jsonb_set(NEW.data,'{description}',to_jsonb(private.sanitize_plain_text(NEW.data->>'description',2000)),true);
    if length(trim(coalesce(NEW.data->>'title',''))) < 1
      or coalesce(NEW.data->>'status','todo') not in ('todo','in_progress','completed','done')
      or coalesce(length(NEW.data->>'projectId'),0) < 1 then raise exception 'Invalid milestone fields' using errcode = '22023'; end if;
    if old_data is not null and (old_data->>'projectId' is distinct from NEW.data->>'projectId'
      or old_data->>'createdBy' is distinct from NEW.data->>'createdBy'
      or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Milestone owner and project association are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^conversations/[^/]+$' then
    if TG_OP = 'INSERT' and NEW.data->>'createdBy' is distinct from (select auth.uid())::text then
      raise exception 'Conversation creator must be the authenticated caller' using errcode = '42501';
    end if;
    if coalesce(NEW.data->>'type','') not in ('direct','group')
      or jsonb_typeof(NEW.data->'members') <> 'array'
      or not ((NEW.data->'members') ? (select auth.uid())::text)
      or jsonb_array_length(NEW.data->'members') not between 2 and 100
      or (NEW.data->>'type' = 'direct' and jsonb_array_length(NEW.data->'members') <> 2)
      or (NEW.data->>'type' = 'group' and jsonb_array_length(NEW.data->'members') < 3)
      or (NEW.data->>'type' = 'group' and length(trim(coalesce(NEW.data->>'title',''))) not between 1 and 60) then
      raise exception 'Invalid conversation participants or title' using errcode = '22023';
    end if;
    if (select count(distinct member_id) from jsonb_array_elements_text(NEW.data->'members') as members(member_id))
       <> jsonb_array_length(NEW.data->'members') then
      raise exception 'Conversation participant IDs must be unique' using errcode = '22023';
    end if;
    for entry in select value from jsonb_array_elements(NEW.data->'members') as members(value) loop
      if jsonb_typeof(entry.value) <> 'string'
        or coalesce(entry.value #>> '{}','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists (select 1 from auth.users u where u.id = (entry.value #>> '{}')::uuid) then
        raise exception 'Conversation participants must be real user IDs' using errcode = '22023';
      end if;
    end loop;
    if old_data is not null and (
      old_data->>'createdBy' is distinct from NEW.data->>'createdBy'
      or old_data->'members' is distinct from NEW.data->'members'
      or old_data->>'type' is distinct from NEW.data->>'type'
      or old_data->>'createdAt' is distinct from NEW.data->>'createdAt'
    ) then
      raise exception 'Conversation identity and membership are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^messages/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{text}',to_jsonb(private.sanitize_plain_text(NEW.data->>'text',4000)),true);
    if length(trim(coalesce(NEW.data->>'text',''))) < 1
      or length(coalesce(NEW.data->>'text','')) > 4000
      or NEW.data->>'senderId' is null
      or not private.is_chat_user_member(NEW.data->>'conversationId',(NEW.data->>'senderId')::uuid) then
      raise exception 'Invalid message or conversation membership' using errcode = '22023';
    end if;
    if old_data is not null and (
      old_data->>'senderId' is distinct from NEW.data->>'senderId'
      or old_data->>'conversationId' is distinct from NEW.data->>'conversationId'
      or old_data->>'at' is distinct from NEW.data->>'at'
    ) then
      raise exception 'Message authorship and destination are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^calls/[^/]+$' then
    if NEW.data->>'id' is distinct from split_part(NEW.path,'/',2)
      or coalesce(NEW.data->>'mode','') not in ('voice','video')
      or coalesce(NEW.data->>'state','') not in ('preparing','ringing','accepted','declined','ended')
      or NEW.data->>'callerId' = NEW.data->>'calleeId'
      or NEW.data->>'callerId' is null or NEW.data->>'calleeId' is null
      or not private.is_chat_user_member(NEW.data->>'conversationId',(NEW.data->>'callerId')::uuid)
      or not private.is_chat_user_member(NEW.data->>'conversationId',(NEW.data->>'calleeId')::uuid) then
      raise exception 'Invalid call participants, conversation or state' using errcode = '22023';
    end if;
    if old_data is null and NEW.data->>'callerId' is distinct from (select auth.uid())::text then
      raise exception 'Only the authenticated caller can initiate a call' using errcode = '42501';
    end if;
    if old_data is not null then
      if old_data->>'id' is distinct from NEW.data->>'id'
        or old_data->>'callerId' is distinct from NEW.data->>'callerId'
        or old_data->>'calleeId' is distinct from NEW.data->>'calleeId'
        or old_data->>'conversationId' is distinct from NEW.data->>'conversationId'
        or old_data->>'mode' is distinct from NEW.data->>'mode'
        or old_data->>'createdAt' is distinct from NEW.data->>'createdAt' then
        raise exception 'Call identity and participants are immutable' using errcode = '42501';
      end if;
      if old_data->>'state' is distinct from NEW.data->>'state' and not (
        (old_data->>'state' = 'preparing' and NEW.data->>'state' in ('ringing','ended'))
        or (old_data->>'state' = 'ringing' and NEW.data->>'state' in ('accepted','declined','ended'))
        or (old_data->>'state' = 'accepted' and NEW.data->>'state' = 'ended')
      ) then
        raise exception 'Invalid call state transition' using errcode = '22023';
      end if;
      if old_data->'offer' is distinct from NEW.data->'offer'
        and not (old_data->>'state' = 'preparing' and NEW.data->>'state' = 'ringing') then
        raise exception 'Call offer cannot be replaced' using errcode = '42501';
      end if;
      if old_data->'answer' is distinct from NEW.data->'answer'
        and not (old_data->>'state' = 'ringing' and NEW.data->>'state' = 'accepted') then
        raise exception 'Call answer cannot be replaced' using errcode = '42501';
      end if;
    end if;
  elsif NEW.path ~ '^callSignals/[^/]+$' then
    if NEW.data->>'id' is distinct from split_part(NEW.path,'/',2)
      or NEW.data->>'fromId' is distinct from (select auth.uid())::text
      or NEW.data->>'toId' = NEW.data->>'fromId'
      or jsonb_typeof(NEW.data->'candidate') <> 'object'
      or not private.is_chat_call_in_conversation(NEW.data->>'callId',NEW.data->>'conversationId')
      or not exists (
        select 1 from public.docs c where c.path = 'calls/' || (NEW.data->>'callId')
          and ((c.data->>'callerId' = NEW.data->>'fromId' and c.data->>'calleeId' = NEW.data->>'toId')
            or (c.data->>'calleeId' = NEW.data->>'fromId' and c.data->>'callerId' = NEW.data->>'toId'))
      ) then
      raise exception 'Invalid call signal participants or conversation' using errcode = '42501';
    end if;
    if old_data is not null and (
      old_data->>'id' is distinct from NEW.data->>'id'
      or old_data->>'callId' is distinct from NEW.data->>'callId'
      or old_data->>'conversationId' is distinct from NEW.data->>'conversationId'
      or old_data->>'fromId' is distinct from NEW.data->>'fromId'
      or old_data->>'toId' is distinct from NEW.data->>'toId'
    ) then
      raise exception 'Call signal identity is immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^promotions/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{text}',to_jsonb(private.sanitize_plain_text(NEW.data->>'text',10000)),true);
    if length(trim(coalesce(NEW.data->>'text',''))) < 1 or NEW.data ? 'publishedAt'
      or NEW.data ? 'externalPostId' or NEW.data->>'status' in ('published','posted') then
      raise exception 'Only non-empty drafts are supported; external publishing is not configured' using errcode = '22023';
    end if;
    NEW.data := NEW.data || jsonb_build_object('status','draft','published',false);
    if old_data is not null and (old_data->>'ideaId' is distinct from NEW.data->>'ideaId'
      or old_data->>'by' is distinct from NEW.data->>'by'
      or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Draft author and idea are immutable' using errcode = '42501';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$function$
;
