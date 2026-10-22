-- The date checker does not access protected data. Keep it SECURITY INVOKER and
-- callable only by its owner; the database trigger invokes it as its owner.
alter function private.is_not_past_lagos_date(text) security invoker;
alter function private.is_not_past_lagos_date(text) reset row_security;
revoke all on function private.is_not_past_lagos_date(text) from public, anon, authenticated;
notify pgrst, 'reload schema';
