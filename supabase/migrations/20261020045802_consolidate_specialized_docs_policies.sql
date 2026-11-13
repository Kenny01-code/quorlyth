-- Consolidate the specialized docs RLS policies into one permissive policy
-- per operation. PostgreSQL combines permissive policies with OR, so preserving
-- each existing predicate in the corresponding combined expression keeps the
-- current allow/deny decisions while avoiding repeated policy evaluation.
begin;

drop policy if exists docs_insert_scoped on public.docs;
create policy docs_insert_scoped on public.docs
for insert to authenticated
with check (
  (select private.can_insert_doc(path, data))
  or (select private.can_create_ai_organizer_request(path, data))
  or (select private.can_insert_ai_organizer_milestone(path, data))
  or (select private.can_insert_work_submission(path, data))
);

drop policy if exists docs_insert_ai_organizer_milestones on public.docs;
-- This policy can never authorize a new row: the predicate intentionally requires
-- the existing project record, so it belongs to UPDATE, not INSERT.
drop policy if exists docs_insert_ai_organizer_project_brief on public.docs;
drop policy if exists docs_insert_ai_organizer_requests on public.docs;
drop policy if exists docs_insert_work_submissions on public.docs;

drop policy if exists docs_read_scoped on public.docs;
-- Anonymous visitors must not evaluate the private helpers that are intentionally
-- executable by authenticated users only. Keep their original public-read predicates
-- in a separate anon-only policy; authenticated users get the combined policy below.
drop policy if exists docs_read_public_scoped on public.docs;
create policy docs_read_public_scoped on public.docs
for select to anon
using (
  (select private.can_read_doc(path, data))
  or (select private.can_read_conversation_doc(path, data))
);

create policy docs_read_scoped on public.docs
for select to authenticated
using (
  (select private.can_read_doc(path, data))
  or (select private.can_read_conversation_doc(path, data))
  or (select private.can_read_ai_organizer_request(path, data))
  or (select private.can_read_collaboration_application(path, data))
  or (select private.can_read_work_submission(path, data))
);

drop policy if exists docs_read_ai_organizer_requests on public.docs;
drop policy if exists docs_read_idea_author_collaboration_application on public.docs;
drop policy if exists docs_read_work_submissions on public.docs;

drop policy if exists docs_update_scoped on public.docs;
create policy docs_update_scoped on public.docs
for update to authenticated
using (
  (select private.can_update_doc(path, data))
  or (select private.can_update_ai_organizer_request(path, data))
  or (select private.can_review_pending_collaboration_application(path, data))
  or (select private.can_review_work_submission(path, data))
  or (select private.can_update_ai_organizer_project_brief(path, data))
)
with check (
  (select private.can_update_doc(path, data))
  or (select private.can_save_ai_organizer_request(path, data))
  or (select private.can_decide_collaboration_application(path, data))
  or (select private.can_save_work_review(path, data))
  or (select private.can_update_ai_organizer_project_brief(path, data))
);

drop policy if exists docs_update_ai_organizer_requests on public.docs;
drop policy if exists docs_update_ai_organizer_project_brief on public.docs;
drop policy if exists docs_update_idea_author_collaboration_decision on public.docs;
drop policy if exists docs_review_work_submissions on public.docs;

commit;
