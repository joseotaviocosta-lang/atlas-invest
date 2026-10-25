-- Phase 5Q-G – links between contribution plans and ledger transactions.
--
-- `contribution_plan_transaction_links` stores one row per (plan,
-- transaction): CONFIRMED (user-confirmed actual) or REJECTED
-- (user-dismissed candidate; memory so it never reappears). Candidates
-- are derived on read and never persisted. No amounts, dates,
-- categories, assets or currencies are stored here — those facts always
-- come from the ledger (transactions) and the plan (items). A partial
-- unique index guarantees one CONFIRMED plan per transaction (no
-- double-counted actuals across plans; v1 does not split transactions).
-- Plan delete cascades (PLANNED plans are the only deletable ones;
-- terminal history is immutable upstream). Transaction delete cascades as
-- well: links are portfolio-scoped rows and portfolio deletion already
-- cascades every other relation; the ledger itself stays append-only via
-- the API (no transaction delete path exists). Additive only. No data
-- migration. No destructive changes.

-- CreateTable
CREATE TABLE "contribution_plan_transaction_links" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contribution_plan_transaction_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contribution_plan_transaction_links_status_vocab" CHECK ("status" IN ('CONFIRMED', 'REJECTED'))
);

-- CreateIndex
CREATE UNIQUE INDEX "contribution_plan_transaction_links_plan_id_transaction_id_key" ON "contribution_plan_transaction_links"("plan_id", "transaction_id");

-- CreateIndex
CREATE INDEX "contribution_plan_transaction_links_plan_id_idx" ON "contribution_plan_transaction_links"("plan_id");

-- CreateIndex
CREATE INDEX "contribution_plan_transaction_links_plan_id_status_idx" ON "contribution_plan_transaction_links"("plan_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contribution_plan_transaction_links_confirmed_transaction_unique" ON "contribution_plan_transaction_links"("transaction_id") WHERE "status" = 'CONFIRMED';

-- AddForeignKey
ALTER TABLE "contribution_plan_transaction_links" ADD CONSTRAINT "contribution_plan_transaction_links_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "portfolio_contribution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_plan_transaction_links" ADD CONSTRAINT "contribution_plan_transaction_links_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
