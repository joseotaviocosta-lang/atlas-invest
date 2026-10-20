-- Migration 30: Phase 5E-H1 period persistence contract fix.
--
-- Root cause (H1 BLOCKER): `scheduled_for DATE` was overloaded to mean both the
-- execution civil date and the logical business window. Canonical logical
-- periods are heterogeneous (DAY YYYY-MM-DD, MONTH YYYY-MM for MACRO_IPCA,
-- YEAR YYYY for calendar refresh), so `::date` casts failed with 500 for
-- CALENDAR_B3_REFRESH / CALENDAR_BANKING_REFRESH / MACRO_IPCA.
--
-- Contract after H1 (additive, no destructive changes, migration 29 untouched):
--   target_period            TEXT     canonical logical business window
--                                   (DAY YYYY-MM-DD, MONTH YYYY-MM, YEAR YYYY)
--   target_period_granularity VARCHAR(16) DAY | MONTH | YEAR
--   scheduled_for            DATE     execution civil date in America/Sao_Paulo
--                                   (always YYYY-MM-DD, never the period)
--   logical_job_key          jobType + ":" + targetPeriod (attempt excluded)
--
-- Backfill: existing rows predate H1 and are all DAY periods (daily closed-day
-- skips on atlas_test; owner has 0 rows), so target_period is derived from the
-- stored execution date and granularity is DAY.

ALTER TABLE "ingestion_job_runs" ADD COLUMN "target_period" TEXT;
ALTER TABLE "ingestion_job_runs" ADD COLUMN "target_period_granularity" VARCHAR(16);

UPDATE "ingestion_job_runs"
   SET "target_period" = to_char("scheduled_for", 'YYYY-MM-DD'),
       "target_period_granularity" = 'DAY'
 WHERE "target_period" IS NULL;

ALTER TABLE "ingestion_job_runs" ALTER COLUMN "target_period" SET NOT NULL;
ALTER TABLE "ingestion_job_runs" ALTER COLUMN "target_period_granularity" SET NOT NULL;

CREATE INDEX "ingestion_job_runs_job_type_target_period_idx"
    ON "ingestion_job_runs" ("job_type", "target_period");
