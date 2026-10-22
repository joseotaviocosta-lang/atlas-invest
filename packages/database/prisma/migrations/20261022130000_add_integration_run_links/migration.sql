-- Phase 5P-PRE: link confirmed canonical transactions to their run.
--
-- Supersedes the `integration_run_id` provenance column from
-- `20261022120000_add_integration_runs`: dropping the column removes its
-- index implicitly, so only the DROP COLUMN is needed. The ledger table
-- returns to its canonical shape and run linkage lives in a dedicated link
-- table, so historical database probes keep working against untouched ledger
-- shape. Forward-only, additive; no data migration.

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "integration_run_id";

-- CreateTable
CREATE TABLE "integration_run_transactions" (
    "run_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_run_transactions_pkey" PRIMARY KEY ("run_id","transaction_id")
);

-- CreateIndex
CREATE INDEX "integration_run_transactions_portfolio_id_idx" ON "integration_run_transactions"("portfolio_id");

-- CreateIndex
CREATE INDEX "integration_run_transactions_transaction_id_idx" ON "integration_run_transactions"("transaction_id");

-- AddForeignKey
ALTER TABLE "integration_run_transactions" ADD CONSTRAINT "integration_run_transactions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "integration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
