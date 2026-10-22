-- Phase 5P-PRE: operational history of import/sync executions.
-- Additive only: one new table + one nullable provenance column.
-- No data migration, no destructive changes, no backfill.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "integration_run_id" UUID;

-- CreateTable
CREATE TABLE "integration_runs" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(100),
    "environment" VARCHAR(50),
    "file_name" VARCHAR(255),
    "source_as_of" VARCHAR(10),
    "status" VARCHAR(50) NOT NULL,
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_normalized" INTEGER NOT NULL DEFAULT 0,
    "new_candidates" INTEGER NOT NULL DEFAULT 0,
    "exact_duplicates" INTEGER NOT NULL DEFAULT 0,
    "probable_duplicates" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "unsupported" INTEGER NOT NULL DEFAULT 0,
    "invalid" INTEGER NOT NULL DEFAULT 0,
    "confirmed" INTEGER NOT NULL DEFAULT 0,
    "ignored" INTEGER NOT NULL DEFAULT 0,
    "reconciliation_matched" INTEGER,
    "reconciliation_divergent" INTEGER,
    "reconciliation_missing_local" INTEGER,
    "reconciliation_missing_source" INTEGER,
    "reconciliation_unresolved" INTEGER,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(500),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_runs_portfolio_id_idx" ON "integration_runs"("portfolio_id");

-- CreateIndex
CREATE INDEX "transactions_portfolio_id_integration_run_id_idx" ON "transactions"("portfolio_id", "integration_run_id");

-- AddForeignKey
ALTER TABLE "integration_runs" ADD CONSTRAINT "integration_runs_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
