-- Phase 5S-C — append-only transaction rectification link (identity + audit only).
--
-- `transaction_rectifications` records one human rectification per
-- original transaction: the ledger keeps the original, its
-- compensating reversal and (except pure cancellations) the
-- replacement. CHECK constrains mode and decision-free audit fields
-- (reason required, server actor/timestamp). One outgoing link per
-- original plus unique compensating/replacement identities keep chains
-- linear (A → B → C); replacements are always freshly created, so
-- cycles are structurally impossible. No backfill: historical
-- (pre-table) rectifications keep working through externalId naming
-- conventions. FKs: portfolio cascades with its scope; ledger rows
-- are RESTRICT (append-only, never deleted through decisions).

-- CreateTable
CREATE TABLE "transaction_rectifications" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "original_transaction_id" UUID NOT NULL,
    "compensating_transaction_id" UUID NOT NULL,
    "replacement_transaction_id" UUID,
    "mode" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "decided_by_principal" VARCHAR(255) NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_rectifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transaction_rectifications_mode_allowed" CHECK ("mode" IN ('RECTIFY', 'CANCEL'))
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_rectification_original_uniq" ON "transaction_rectifications"("original_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_rectification_compensating_uniq" ON "transaction_rectifications"("compensating_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_rectification_replacement_uniq" ON "transaction_rectifications"("replacement_transaction_id");

-- CreateIndex
CREATE INDEX "transaction_rectification_portfolio_idx" ON "transaction_rectifications"("portfolio_id");

-- AddForeignKey
ALTER TABLE "transaction_rectifications" ADD CONSTRAINT "transaction_rectifications_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_rectifications" ADD CONSTRAINT "transaction_rectifications_original_transaction_id_fkey" FOREIGN KEY ("original_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_rectifications" ADD CONSTRAINT "transaction_rectifications_compensating_transaction_id_fkey" FOREIGN KEY ("compensating_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_rectifications" ADD CONSTRAINT "transaction_rectifications_replacement_transaction_id_fkey" FOREIGN KEY ("replacement_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
