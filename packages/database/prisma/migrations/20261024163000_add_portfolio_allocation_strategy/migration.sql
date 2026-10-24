-- Phase 5Q-C — user-defined allocation strategy targets.
--
-- `portfolio_allocation_strategy_targets`: one row per (portfolio,
-- asset-class category). targetBp is integer basis points (4000 = 40%).
-- The 100%-total invariant is enforced by the application service inside a
-- single replace transaction (cross-row sums cannot be CHECK-constrained).
-- Zero targets are normalized away on write (0 == absent, documented).
-- Portfolio deletion cascades (targets are intent scoped to the portfolio).
-- Additive only. No data migration. No destructive changes.

-- CreateTable
CREATE TABLE "portfolio_allocation_strategy_targets" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "target_bp" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portfolio_allocation_strategy_targets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portfolio_allocation_strategy_targets_target_range" CHECK ("target_bp" >= 0 AND "target_bp" <= 10000)
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_allocation_strategy_targets_portfolio_id_category_key" ON "portfolio_allocation_strategy_targets"("portfolio_id", "category");

-- CreateIndex
CREATE INDEX "portfolio_allocation_strategy_targets_portfolio_id_idx" ON "portfolio_allocation_strategy_targets"("portfolio_id");

-- AddForeignKey
ALTER TABLE "portfolio_allocation_strategy_targets" ADD CONSTRAINT "portfolio_allocation_strategy_targets_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
