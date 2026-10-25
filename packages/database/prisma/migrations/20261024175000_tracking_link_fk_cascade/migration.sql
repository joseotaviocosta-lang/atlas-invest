-- Phase 5Q-G follow-up: tracking links are portfolio-scoped rows.
--
-- The initial migration declared the transaction FK as RESTRICT, which
-- blocks portfolio deletion (all other portfolio relations cascade, and
-- deleting a portfolio cascades its transactions). Links vanish together
-- with their portfolio — consistent with every other plan/scenario row.
-- The ledger itself stays append-only via the API (no transaction delete
-- path exists), so CASCADE here removes no independently reachable audit.

-- AlterTable
ALTER TABLE "contribution_plan_transaction_links" DROP CONSTRAINT "contribution_plan_transaction_links_transaction_id_fkey";

-- AddForeignKey
ALTER TABLE "contribution_plan_transaction_links" ADD CONSTRAINT "contribution_plan_transaction_links_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
