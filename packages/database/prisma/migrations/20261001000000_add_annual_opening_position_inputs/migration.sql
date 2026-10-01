-- Drop table if partially created
DROP TABLE IF EXISTS "annual_opening_position_inputs" CASCADE;

-- CreateTable
CREATE TABLE "annual_opening_position_inputs" (
    "id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "total_historical_cost" DECIMAL(38,18) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "revision" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "notes" TEXT,
    "supersedes_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "annual_opening_position_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annual_opening_pos_lookup_idx" ON "annual_opening_position_inputs"("tax_subject_id", "portfolio_id", "account_id", "asset_id", "status");

-- CreateIndex
CREATE INDEX "annual_opening_pos_subj_status_idx" ON "annual_opening_position_inputs"("tax_subject_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "annual_opening_pos_rev_uniq" ON "annual_opening_position_inputs"("tax_subject_id", "portfolio_id", "account_id", "asset_id", "revision");

-- AddForeignKey
ALTER TABLE "annual_opening_position_inputs" ADD CONSTRAINT "annual_opening_position_inputs_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_opening_position_inputs" ADD CONSTRAINT "annual_opening_position_inputs_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_opening_position_inputs" ADD CONSTRAINT "annual_opening_position_inputs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_opening_position_inputs" ADD CONSTRAINT "annual_opening_position_inputs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
