-- Create the non-superuser application role for RLS enforcement.
--
-- WHY: Postgres superusers (and roles with BYPASSRLS) ignore Row-Level Security
-- entirely — even FORCE ROW LEVEL SECURITY does not constrain them. The tenant-isolation
-- policies (migration 20260613000200_rls_tenant_isolation) therefore only take effect when
-- the app connects as a NON-superuser, NOBYPASSRLS role. See docs/DATABASE.md §13.2–§13.3.
--
-- This is intentionally NOT a Prisma migration: roles are cluster-scoped and need a
-- per-environment password, so an operator runs this ONCE per database after migrations.
--
-- Usage (replace the password):
--   psql "$DIRECT_URL" -v app_password="'a-strong-password'" -f ops/sql/create-app-role.sql
-- Then point the app at this role:
--   DATABASE_URL=postgresql://agrimind_app:<password>@host:5432/agrimind?schema=public
--   DIRECT_URL stays as the migration/admin (owner) connection.
--
-- Idempotent: safe to re-run. Grants cover existing AND future tables/sequences.

\set ON_ERROR_STOP on

-- 1. Create the role if it does not exist. The password is passed via -v app_password
--    and substituted by psql here at the top level (psql vars do NOT expand inside a
--    dollar-quoted DO block, so we gate creation with \gexec instead).
SELECT 'CREATE ROLE agrimind_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ' || quote_literal(:'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agrimind_app')
\gexec

-- Defensively ensure the flags + refresh the password even if the role pre-existed.
ALTER ROLE agrimind_app NOSUPERUSER NOBYPASSRLS;
SELECT 'ALTER ROLE agrimind_app PASSWORD ' || quote_literal(:'app_password')
\gexec

-- 2. Schema usage.
GRANT USAGE ON SCHEMA public TO agrimind_app;

-- 3. DML on all current tables + sequences.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agrimind_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agrimind_app;

-- 4. Default privileges so FUTURE tables/sequences (new migrations) are auto-granted.
--    Run as the role that owns/creates objects (the migration/owner role running this script).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agrimind_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO agrimind_app;

-- NOTE: agrimind_app is NOT granted DDL/owner rights. Migrations are applied with the
-- owner connection (DIRECT_URL), never with agrimind_app.
