/** Check effective privileges without changing grants or exposing role details. */
export async function assertRuntimeRole(db) {
  const [role] = await db.$queryRaw`
    SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication AS privileged,
      EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid) AS member,
      has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
      EXISTS (SELECT 1 FROM pg_namespace n WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema' AND has_schema_privilege(current_user, n.oid, 'CREATE')) AS schema_create,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema' AND (c.relowner = r.oid OR (c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(current_user, c.oid, 'TRIGGER') OR has_table_privilege(current_user, c.oid, 'TRUNCATE')))))
      OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proowner = r.oid AND left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema')
      OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typowner = r.oid AND left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema') AS owns_object
    FROM pg_roles r WHERE r.rolname = current_user`;
  if (
    !role ||
    role.privileged !== false ||
    role.member !== false ||
    role.database_create !== false ||
    role.schema_create !== false ||
    role.owns_object !== false
  )
    throw new Error('Unsafe database runtime role');
}
