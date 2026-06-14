-- Conversation pin/archive flags.
-- Adds the isPinned/isArchived columns referenced by the conversation repository
-- (listConversations select + updateConversationStatus). Without this migration a
-- fresh DB would be missing these columns and history queries would fail at runtime.

ALTER TABLE "conversations" ADD COLUMN "isPinned"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
