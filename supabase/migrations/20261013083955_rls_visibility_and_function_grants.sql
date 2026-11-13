-- Tighten shared-workspace visibility without changing the existing record-store design.
-- Community, idea and comment reads must respect community visibility. The previous
-- permissive policy OR-ed with the participant-aware policy and bypassed its checks.

drop policy if exists "read shared workspace" on public.docs;
create policy "read shared workspace" on public.docs
for select to authenticated
using (
  (
    path ~ '^communities/[^/]+$'
    and public.can_view_community(split_part(path, '/', 2))
  )
  or (
    path ~ '^ideas/[^/]+$'
    and public.can_view_community(public.idea_community_id(split_part(path, '/', 2)))
  )
  or (
    path ~ '^ideas/[^/]+/comments/[^/]+$'
    and public.can_view_community(public.idea_community_id(split_part(path, '/', 2)))
  )
  -- Preserve the existing shared workspace surfaces; these retain their
  -- established visibility model and are not used for private chat signaling.
  or path ~ '^(votes|members|profiles)/[^/]+$'
  or path ~ '^promotions/[^/]+$'
  or path = 'settings/space'
);

-- "owner writes all" previously applied to PUBLIC and evaluated is_owner()
-- for anonymous requests. Restrict it to signed-in users.
drop policy if exists "owner writes all" on public.docs;
create policy "owner writes all" on public.docs
for all to authenticated
using (public.is_owner())
with check (public.is_owner());

-- These helper RPCs are authorization predicates, not anonymous API endpoints.
-- Keep their use in authenticated RLS policy expressions while removing the
-- inherited PUBLIC/anon EXECUTE grants.
revoke all on function public.can_manage_community(text) from public, anon;
grant execute on function public.can_manage_community(text) to authenticated;

revoke all on function public.can_post_to_community(text) from public, anon;
grant execute on function public.can_post_to_community(text) to authenticated;

revoke all on function public.can_view_community(text) from public, anon;
grant execute on function public.can_view_community(text) to authenticated;

revoke all on function public.idea_community_id(text) from public, anon;
grant execute on function public.idea_community_id(text) to authenticated;

revoke all on function public.is_idea_author(text) from public, anon;
grant execute on function public.is_idea_author(text) to authenticated;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

revoke all on function public.owner_claim_exists() from public, anon;
grant execute on function public.owner_claim_exists() to authenticated;

-- Event-trigger handler; Postgres invokes it through the installed event trigger,
-- not as an exposed RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

notify pgrst, 'reload schema';
