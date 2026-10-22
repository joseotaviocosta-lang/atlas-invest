-- Phase 5P-PRE follow-up + 5P-A: operational run linkage + scheduled sync foundation.
--
-- 1. `integration_runs.trigger`: distinguishes human-driven runs ('MANUAL')
--    from scheduler-driven runs ('SCHEDULED'). Nullable: runs recorded
--    before triggers existed remain valid.
-- 2. `integration_schedules`: future sync intent per (portfolio, source).
--    One schedule per integration per portfolio (unique). Environment is
--    CHECK-locked to 'SIMULATED': enabling CERT/PROD requires a deliberate
--    future migration — availability can never flip via API or row edits.
-- 3. `integration_jobs`: one row per scheduled occurrence
--    (unique per schedule+slot, idempotent ticks). Terminal states are
--    COMPLETED/PARTIAL/FAILED; cross-instance exclusivity comes from
--    atomic claim updates plus PostgreSQL advisory locks held by executors
--    (same pattern as the ingestion job lock), never from in-memory mutexes.
-- Additive only. No data migration. No destructive changes.

-- AlterTable
ALTER TABLE "integration_runs" ADD COLUMN "trigger" VARCHAR(20);

-- CreateTable
CREATE TABLE "integration_schedules" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(100) NOT NULL DEFAULT 'SIMULATED',
    "environment" VARCHAR(50) NOT NULL DEFAULT 'SIMULATED',
    "cadence" VARCHAR(50) NOT NULL,
    "hour_local" INTEGER,
    "minute_local" INTEGER,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'America/Sao_Paulo',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "next_run_at" TIMESTAMPTZ(6),
    "last_run_at" TIMESTAMPTZ(6),
    "last_status" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integration_schedules_environment_simulated_only" CHECK ("environment" = 'SIMULATED')
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_schedules_portfolio_id_source_key" ON "integration_schedules"("portfolio_id", "source");

-- CreateIndex
CREATE INDEX "integration_schedules_enabled_next_run_at_idx" ON "integration_schedules"("enabled", "next_run_at");

-- AddForeignKey
ALTER TABLE "integration_schedules" ADD CONSTRAINT "integration_schedules_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "integration_jobs" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "environment" VARCHAR(50) NOT NULL DEFAULT 'SIMULATED',
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "not_before_at" TIMESTAMPTZ(6),
    "run_id" UUID,
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(500),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integration_jobs_environment_simulated_only" CHECK ("environment" = 'SIMULATED')
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_jobs_schedule_id_scheduled_for_key" ON "integration_jobs"("schedule_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "integration_jobs_status_scheduled_for_idx" ON "integration_jobs"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "integration_jobs_run_id_idx" ON "integration_jobs"("run_id");

-- CreateIndex
CREATE INDEX "integration_jobs_portfolio_id_idx" ON "integration_jobs"("portfolio_id");

-- AddForeignKey
ALTER TABLE "integration_jobs" ADD CONSTRAINT "integration_jobs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "integration_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
