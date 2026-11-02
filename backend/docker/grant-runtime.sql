-- Run as the migration/object-owner role after migrations. Provision the login/password privately first.
GRANT USAGE ON SCHEMA public TO devsync_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO devsync_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO devsync_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO devsync_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO devsync_runtime;
