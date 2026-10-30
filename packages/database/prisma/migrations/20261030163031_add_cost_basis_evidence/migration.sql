-- Cost-basis evidence revisions (ADR-310, historical cost enrichment).
-- Audited claims that already-represented quantities carry factual
-- acquisition cost. NEVER a ledger event: no quantity is created, moved,
-- or rewritten here. Additive only; no existing table is touched.

-- CreateTable
CREATE TABLE "cost_basis_evidence" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "evidence_type" VARCHAR(40) NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "quantity_covered" NUMERIC(38,18) NOT NULL,
    "unit_cost" NUMERIC(38,18),
    "total_cost" NUMERIC(38,18),
    "currency" VARCHAR(3) NOT NULL,
    "acquisition_date" DATE NOT NULL,
    "evidence_date" DATE,
    "status" VARCHAR(20) NOT NULL,
    "source_reference" VARCHAR(255) NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL,
    "supersedes_id" UUID,
    "fingerprint" VARCHAR(64) NOT NULL,
    "confirmed_by" VARCHAR(255),
    "confirmed_at" TIMESTAMPTZ(6),
    "rejected_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_basis_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_evidence_fingerprint_version_identity" UNIQUE ("portfolio_id", "fingerprint", "version")
);

-- CreateIndex
CREATE INDEX "cost_evidence_scope_status_idx" ON "cost_basis_evidence"("portfolio_id", "account_id", "asset_id", "status");

-- AddForeignKey
ALTER TABLE "cost_basis_evidence" ADD CONSTRAINT "cost_basis_evidence_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_basis_evidence" ADD CONSTRAINT "cost_basis_evidence_account_id_portfolio_id_fkey" FOREIGN KEY ("account_id", "portfolio_id") REFERENCES "accounts"("id", "portfolio_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_basis_evidence" ADD CONSTRAINT "cost_basis_evidence_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
