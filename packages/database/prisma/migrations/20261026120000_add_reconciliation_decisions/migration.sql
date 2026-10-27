-- Phase 5S-B-R1 — human reconciliation decision persistence foundation.
--
-- `reconciliation_decisions` stores identity + decision + audit only:
-- one row asserts a human reviewed the pair (integration run source
-- item, local transaction). CONFIRM_MATCH records correspondence,
-- NOT_A_MATCH records rejection. Never creates, edits or deletes
-- ledger transactions; never rewrites run summaries. Pair identity
-- (portfolio, run, source item key, transaction) is unique, so repeat
-- submissions are idempotent and conflicting decisions are rejected,
-- never overwritten. decided_by_principal stores the server-derived
-- user id (audit trail survives user deletion). Transaction FK is
-- RESTRICT (append-only ledger); run/portfolio FKs cascade with their
-- history scope. No backfill: historical runs keep no decisions.

-- CreateTable
CREATE TABLE "reconciliation_decisions" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "integration_run_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "source_item_key" VARCHAR(255) NOT NULL,
    "local_transaction_id" UUID NOT NULL,
    "decision" VARCHAR(20) NOT NULL,
    "decided_by_principal" VARCHAR(255) NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reconciliation_decisions_decision_allowed" CHECK ("decision" IN ('CONFIRM_MATCH', 'NOT_A_MATCH'))
);

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_decision_pair_uniq" ON "reconciliation_decisions"("portfolio_id", "integration_run_id", "source_item_key", "local_transaction_id");

-- CreateIndex
CREATE INDEX "reconciliation_decision_run_idx" ON "reconciliation_decisions"("integration_run_id");

-- AddForeignKey
ALTER TABLE "reconciliation_decisions" ADD CONSTRAINT "reconciliation_decisions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_decisions" ADD CONSTRAINT "reconciliation_decisions_integration_run_id_fkey" FOREIGN KEY ("integration_run_id") REFERENCES "integration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_decisions" ADD CONSTRAINT "reconciliation_decisions_local_transaction_id_fkey" FOREIGN KEY ("local_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
