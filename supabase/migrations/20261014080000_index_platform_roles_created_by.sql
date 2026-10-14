-- Cover the audit foreign key so owner/admin role cleanup does not scan the role table.
create index if not exists platform_roles_created_by_idx
  on private.platform_roles(created_by);
