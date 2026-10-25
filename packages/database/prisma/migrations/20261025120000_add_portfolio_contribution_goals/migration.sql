-- Phase 5Q-J – user-defined monthly contribution goals (versioned intent).
--
-- `portfolio_contribution_goals` stores one row per effective version:
-- half-open [effective_from, effective_to_month) with NULL end meaning
-- open-ended. Only one open version per portfolio (partial unique
-- index); closing + creating happens atomically in the repository.
-- Past months are never rewritten: edits close the open version at the
-- chosen month and open a new one. No targets, no scores, no forecasts,
-- no recommendations — just the user's declared number. Portfolio
-- deletion cascades (goals are portfolio-scoped intent).

-- CreateTable
CREATE TABLE "portfolio_contribution_goals" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portfolio_contribution_goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portfolio_contribution_goals_amount_positive" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "portfolio_contribution_goals_portfolio_id_idx" ON "portfolio_contribution_goals"("portfolio_id");

-- CreateIndex
CREATE INDEX "portfolio_contribution_goals_portfolio_id_effective_from_idx" ON "portfolio_contribution_goals"("portfolio_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_contribution_goals_open_version_unique" ON "portfolio_contribution_goals"("portfolio_id") WHERE "effective_to" IS NULL;

-- AddForeignKey
ALTER TABLE "portfolio_contribution_goals" ADD CONSTRAINT "portfolio_contribution_goals_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
