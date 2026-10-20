-- Migration 29: ingestion job run history for Phase 5E scheduled ingestion.
--
-- Traceability note (Phase 5E-R3):
--   No migration file for ingestion_job_runs existed in tracked Git history at
--   the approved Phase 5D baseline (5274022) or at b05e806. The owner database
--   contains 28 applied migrations and no ingestion_job_runs table. This file
--   is therefore a NEW, canonical migration 29, not an edit of an applied owner
--   migration.
--
--   The attempt-independent logical identity is (logical_job_key); attempt is
--   history metadata only. Active-run exclusivity is enforced by a PostgreSQL
--   advisory lock held for the whole execution, never by a row lock or by
--   SELECT-then-INSERT.

CREATE TABLE "ingestion_job_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "logical_job_key" VARCHAR(255) NOT NULL,
    "job_type" VARCHAR(64) NOT NULL,
    "trigger_type" VARCHAR(32) NOT NULL,
    "scheduled_for" DATE NOT NULL,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "status" VARCHAR(32) NOT NULL,
    "attempt" INT NOT NULL DEFAULT 1,
    "items_requested" INT,
    "items_fetched" INT,
    "items_inserted" INT,
    "items_revised" INT,
    "items_unchanged" INT,
    "items_failed" INT NOT NULL DEFAULT 0,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "ingestion_job_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingestion_job_runs_logical_key_attempt_uniq"
    ON "ingestion_job_runs" ("logical_job_key", "attempt");

CREATE INDEX "ingestion_job_runs_logical_key_idx"
    ON "ingestion_job_runs" ("logical_job_key");

CREATE INDEX "ingestion_job_runs_job_type_scheduled_for_idx"
    ON "ingestion_job_runs" ("job_type", "scheduled_for");

CREATE INDEX "ingestion_job_runs_status_idx"
    ON "ingestion_job_runs" ("status");

CREATE INDEX "ingestion_job_runs_started_at_idx"
    ON "ingestion_job_runs" ("started_at");
