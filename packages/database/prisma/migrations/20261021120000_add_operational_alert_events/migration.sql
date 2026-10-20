-- Migration 31: Phase 5G operational alert events (staging-ready monitoring).
--
-- Purpose: persist operator-visible alert lifecycle for ingestion/backfill
-- operations (dedupe, occurrence tracking, resolution) without touching any
-- financial table. Metrics remain derived from ingestion_job_runs + coverage;
-- no computed metrics are persisted here.
--
-- Dedupe contract (code-enforced via PostgreSQL advisory lock on dedupe_key):
-- at most one ACTIVE row per dedupe_key. Repeated detection while ACTIVE
-- updates last_detected_at/occurrence_count in place (no alert spam).
-- Resolution sets status RESOLVED + resolved_at (history preserved, never
-- deleted). A later recurrence inserts a new ACTIVE row.
-- Only operator flows write here; normal user GETs never touch this table.

CREATE TABLE "operational_alert_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dedupe_key" VARCHAR(255) NOT NULL,
    "alert_type" VARCHAR(64) NOT NULL,
    "severity" VARCHAR(16) NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "reason_code" VARCHAR(64) NOT NULL,
    "first_detected_at" TIMESTAMPTZ(6) NOT NULL,
    "last_detected_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "occurrence_count" INT NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "operational_alert_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operational_alert_events_dedupe_status_idx"
    ON "operational_alert_events" ("dedupe_key", "status");

CREATE INDEX "operational_alert_events_status_idx"
    ON "operational_alert_events" ("status");

CREATE INDEX "operational_alert_events_alert_type_idx"
    ON "operational_alert_events" ("alert_type");

CREATE INDEX "operational_alert_events_detected_at_idx"
    ON "operational_alert_events" ("last_detected_at");
