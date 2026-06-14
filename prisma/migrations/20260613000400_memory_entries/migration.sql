-- TASK 5 — Conversation memory: memory_entries table + RLS tenant isolation.

-- Category enum.
CREATE TYPE "MemoryCategory" AS ENUM ('crop_interest', 'learning_interest', 'goal', 'challenge');

-- Table.
CREATE TABLE "memory_entries" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "category"   "MemoryCategory" NOT NULL,
    "value"      TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"  TIMESTAMPTZ NOT NULL,
    CONSTRAINT "memory_entries_pkey" PRIMARY KEY ("id")
);

-- One canonical entry per (user, category, value) — dedup/update, never duplicate.
CREATE UNIQUE INDEX "memory_entries_userId_category_value_key"
    ON "memory_entries" ("userId", "category", "value");

-- Active-memory retrieval ordering.
CREATE INDEX "memory_entries_userId_isArchived_lastSeenAt_idx"
    ON "memory_entries" ("userId", "isArchived", "lastSeenAt");

-- FK to users (cascade on user delete).
ALTER TABLE "memory_entries"
    ADD CONSTRAINT "memory_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS tenant isolation (consistent with conversations/messages — docs/DATABASE.md §13).
ALTER TABLE "memory_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memory_entries" FORCE  ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "memory_entries"
    USING ("userId" = current_setting('app.user_id', true));
