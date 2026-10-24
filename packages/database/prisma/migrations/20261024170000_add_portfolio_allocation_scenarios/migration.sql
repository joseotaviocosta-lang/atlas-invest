-- Phase 5Q-E – saved hypothetical allocation scenarios (input only).
--
-- `portfolio_allocation_scenarios` stores the user-declared hypothesis
-- (name + type); `portfolio_allocation_scenario_changes` stores the
-- manually-split hypothetical contribution per asset class as exact
-- Decimal amounts. Amounts are canonical decimals (<=2 decimals, > 0):
-- the range is enforced by a CHECK constraint; duplicates per scenario
-- are rejected by a unique key; validation of categories/positivity
-- lives in the application service (same engine as 5Q-D simulation).
-- Duplicate names are allowed (identity is the id). No projected values,
-- weights, deviations, coverage or recommendations are ever persisted:
-- results are always recomputed live. Portfolio/scenario deletion
-- cascades. Additive only. No data migration. No destructive changes.

-- CreateTable
CREATE TABLE "portfolio_allocation_scenarios" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'CONTRIBUTION',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portfolio_allocation_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_allocation_scenario_changes" (
    "id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portfolio_allocation_scenario_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portfolio_allocation_scenario_changes_amount_positive" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "portfolio_allocation_scenarios_portfolio_id_idx" ON "portfolio_allocation_scenarios"("portfolio_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_allocation_scenario_changes_scenario_id_category_key" ON "portfolio_allocation_scenario_changes"("scenario_id", "category");

-- CreateIndex
CREATE INDEX "portfolio_allocation_scenario_changes_scenario_id_idx" ON "portfolio_allocation_scenario_changes"("scenario_id");

-- AddForeignKey
ALTER TABLE "portfolio_allocation_scenarios" ADD CONSTRAINT "portfolio_allocation_scenarios_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_allocation_scenario_changes" ADD CONSTRAINT "portfolio_allocation_scenario_changes_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "portfolio_allocation_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
