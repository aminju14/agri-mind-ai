-- TASK 9 — Proactive insights table (0–2 per assistant message) + RLS tenant isolation.

CREATE TYPE "InsightCategory" AS ENUM ('learning', 'risk', 'opportunity', 'planning', 'research');

CREATE TABLE "insights" (
    "id"             TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId"      TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "content"        TEXT NOT NULL,
    "category"       "InsightCategory" NOT NULL,
    "confidence"     DOUBLE PRECISION NOT NULL,
    "ordinal"        INTEGER NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "insights_messageId_ordinal_idx"      ON "insights" ("messageId", "ordinal");
CREATE INDEX "insights_conversationId_createdAt_idx" ON "insights" ("conversationId", "createdAt");

ALTER TABLE "insights"
    ADD CONSTRAINT "insights_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insights"
    ADD CONSTRAINT "insights_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS tenant isolation (via conversation ownership — consistent with messages/citations).
ALTER TABLE "insights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insights" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "insights"
    USING ("conversationId" IN (
        SELECT "id" FROM "conversations"
        WHERE "userId" = current_setting('app.user_id', true)
    ));
