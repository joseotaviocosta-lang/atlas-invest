-- Phase 5Q-F – user-declared contribution plans (future intent, not advice).
--
-- `portfolio_contribution_plans` stores what the user intends to contribute
-- (name + date-only `planned_date` + status). `portfolio_contribution_plan_items`
-- stores the manually-declared per-category amounts as exact Decimals.
-- Status machine: PLANNED → COMPLETED | CANCELLED (enforced by the
-- application service; the CHECK documents the vocabulary). COMPLETED and
-- CANCELLED never create transactions, orders or ledger writes — there is
-- deliberately no transaction FK and no execution column. `source_scenario_id`
-- is optional provenance (SET NULL on scenario delete); plans never depend
-- on the scenario afterwards. No projected values, deviations, coverage,
-- scores or recommendations are ever persisted. Portfolio deletion cascades.
-- Additive only. No data migration. No destructive changes.

-- CreateTable
CREATE TABLE "portfolio_contribution_plans" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "planned_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    "currency" VARCHAR(3) NOT NULL,
    "source_scenario_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portfolio_contribution_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portfolio_contribution_plans_status_vocab" CHECK ("status" IN ('PLANNED', 'COMPLETED', 'CANCELLED'))
);

-- CreateTable
CREATE TABLE "portfolio_contribution_plan_items" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portfolio_contribution_plan_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portfolio_contribution_plan_items_amount_positive" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "portfolio_contribution_plans_portfolio_id_idx" ON "portfolio_contribution_plans"("portfolio_id");

-- CreateIndex
CREATE INDEX "portfolio_contribution_plans_portfolio_id_status_planned_date_idx" ON "portfolio_contribution_plans"("portfolio_id", "status", "planned_date");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_contribution_plan_items_plan_id_category_key" ON "portfolio_contribution_plan_items"("plan_id", "category");

-- CreateIndex
CREATE INDEX "portfolio_contribution_plan_items_plan_id_idx" ON "portfolio_contribution_plan_items"("plan_id");

-- AddForeignKey
ALTER TABLE "portfolio_contribution_plans" ADD CONSTRAINT "portfolio_contribution_plans_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_contribution_plans" ADD CONSTRAINT "portfolio_contribution_plans_source_scenario_id_fkey" FOREIGN KEY ("source_scenario_id") REFERENCES "portfolio_allocation_scenarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_contribution_plan_items" ADD CONSTRAINT "portfolio_contribution_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "portfolio_contribution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
