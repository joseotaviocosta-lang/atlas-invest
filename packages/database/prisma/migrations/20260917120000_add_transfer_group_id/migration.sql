-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "transfer_group_id" VARCHAR(255);

-- CreateIndex
CREATE INDEX "transactions_portfolio_id_transfer_group_id_idx" ON "transactions"("portfolio_id", "transfer_group_id");
