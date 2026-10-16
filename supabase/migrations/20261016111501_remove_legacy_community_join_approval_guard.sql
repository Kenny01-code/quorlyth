-- Remove the older guard, which rejected approved self-membership grants too.
-- The replacement trigger checks for an approved request before allowing the grant.
drop trigger if exists docs_guard_community_join_approval on public.docs;
drop function if exists private.guard_community_join_approval();
