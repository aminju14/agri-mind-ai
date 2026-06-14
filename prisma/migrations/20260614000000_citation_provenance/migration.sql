-- TASK 7 — Citation provenance + ranking fields.
-- Adds documentId (which KB document the citation aggregates) and similarityScore (the
-- best chunk similarity that produced it) for source traceability and auditing.

ALTER TABLE "citations" ADD COLUMN "documentId"      TEXT;
ALTER TABLE "citations" ADD COLUMN "similarityScore" DOUBLE PRECISION;
