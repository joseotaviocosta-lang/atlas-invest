-- Phase 4I.4: high-income annual evidence persistence (corporate effective-tax
-- facts, annual adjustment attestations, attested annual-income totals).
-- Additive-only: creates one table with revision-aware uniqueness. Derived tax
-- results are never persisted here; only non-derivable evidence facts.

-- CreateTable
CREATE TABLE "high_income_evidence_records" (
    "id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "calendar_year" INTEGER NOT NULL,
    "payer_key" VARCHAR(255) NOT NULL,
    "payer_id" VARCHAR(255),
    "evidence_type" VARCHAR(40) NOT NULL,
    "payer_type" VARCHAR(40),
    "profit_period_exercise" INTEGER,
    "evidence_mode" VARCHAR(20),
    "accounting_profit" DECIMAL(38,18),
    "ir_due" DECIMAL(38,18),
    "csll_due" DECIMAL(38,18),
    "prouni_tax_credit" DECIMAL(38,18),
    "simplified_revenue" DECIMAL(38,18),
    "adjustment_amount" DECIMAL(38,18),
    "authority" VARCHAR(30) NOT NULL,
    "evidence_source" VARCHAR(40) NOT NULL,
    "conflict_status" VARCHAR(20) NOT NULL DEFAULT 'NONE',
    "upstream_fingerprint" VARCHAR(64),
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "supersedes_id" UUID,
    "resolution_note" VARCHAR(40),
    "created_by_principal" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "high_income_evidence_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hi_evidence_lookup_idx" ON "high_income_evidence_records"("tax_subject_id", "calendar_year", "evidence_type", "payer_key");

-- CreateIndex
CREATE INDEX "hi_evidence_year_idx" ON "high_income_evidence_records"("tax_subject_id", "calendar_year");

-- CreateIndex
CREATE UNIQUE INDEX "hi_evidence_rev_uniq" ON "high_income_evidence_records"("tax_subject_id", "calendar_year", "payer_key", "evidence_type", "profit_period_exercise", "revision");

-- AddForeignKey
ALTER TABLE "high_income_evidence_records" ADD CONSTRAINT "high_income_evidence_records_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
