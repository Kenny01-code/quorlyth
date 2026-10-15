-- The community-join request policies invoke this helper directly, so authenticated
-- users need EXECUTE permission for RLS evaluation. The helper itself is SECURITY
-- DEFINER with a constrained search_path and performs its own role/ownership check.
GRANT EXECUTE ON FUNCTION private.can_manage_community(text) TO authenticated;
