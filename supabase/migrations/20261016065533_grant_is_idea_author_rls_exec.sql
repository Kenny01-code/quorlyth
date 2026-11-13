-- Fix authenticated shared-data reads after adding idea-author workspace policies.
-- These policies call private.is_idea_author directly. Keep the SECURITY DEFINER
-- helper private to the caller's own idea check and do not expose it to anon.
revoke all on function private.is_idea_author(text) from public, anon, authenticated, service_role;
grant execute on function private.is_idea_author(text) to authenticated;

comment on function private.is_idea_author(text) is
  'Caller-bound predicate used by authenticated collaboration RLS policies to check whether auth.uid() authored the supplied idea.';
