-- Row-Level Security: tenant isolation (defense in depth)
-- Spec: docs/DATABASE.md §13. Application-layer `userId` filtering is the primary
-- control; RLS is the backstop so a missed filter cannot leak cross-tenant data.
--
-- The app MUST run as a non-superuser role and set the current user per request/tx:
--   SELECT set_config('app.user_id', $userId, true);   -- tx-local (third arg = true)
-- Prisma queries then run inside that transaction (see src/server/persistence/tenant.ts).
--
-- KB tables (documents, chunks, chunk_embeddings, query_embedding_cache) are GLOBAL,
-- not user-scoped, and intentionally have NO RLS.

-- Enable RLS on all user-owned tables ----------------------------------------
ALTER TABLE "conversations"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "citations"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "panel_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_paths"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_events"    ENABLE ROW LEVEL SECURITY;

-- Also force RLS for the table owner so the policies cannot be bypassed if the app
-- happens to connect as the owning role.
ALTER TABLE "conversations"   FORCE ROW LEVEL SECURITY;
ALTER TABLE "messages"        FORCE ROW LEVEL SECURITY;
ALTER TABLE "citations"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "panel_snapshots" FORCE ROW LEVEL SECURITY;
ALTER TABLE "learning_paths"  FORCE ROW LEVEL SECURITY;
ALTER TABLE "usage_events"    FORCE ROW LEVEL SECURITY;

-- Policies --------------------------------------------------------------------
-- current_setting('app.user_id', true) returns NULL if unset (true = missing_ok),
-- so a request that forgets to set it sees NO rows (fail closed), never all rows.

CREATE POLICY "tenant_isolation" ON "conversations"
  USING ("userId" = current_setting('app.user_id', true));

CREATE POLICY "tenant_isolation" ON "messages"
  USING ("conversationId" IN (
    SELECT "id" FROM "conversations"
    WHERE "userId" = current_setting('app.user_id', true)
  ));

CREATE POLICY "tenant_isolation" ON "citations"
  USING ("messageId" IN (
    SELECT m."id" FROM "messages" m
    JOIN "conversations" c ON c."id" = m."conversationId"
    WHERE c."userId" = current_setting('app.user_id', true)
  ));

CREATE POLICY "tenant_isolation" ON "panel_snapshots"
  USING ("conversationId" IN (
    SELECT "id" FROM "conversations"
    WHERE "userId" = current_setting('app.user_id', true)
  ));

CREATE POLICY "tenant_isolation" ON "learning_paths"
  USING ("userId" = current_setting('app.user_id', true));

CREATE POLICY "tenant_isolation" ON "usage_events"
  USING ("userId" = current_setting('app.user_id', true));
