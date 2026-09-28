-- Phase 4B.3 — canonical tax input persistence (additive only).
-- Persists trade classification, withholding/IRRF and FII tax-condition
-- metadata. Never mutates the immutable transaction ledger.

CREATE TABLE "tax_trade_classification_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_subject_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "classification" VARCHAR(20) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_reference" VARCHAR(255) NOT NULL,
    "effective_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "conflict_status" VARCHAR(20) NOT NULL DEFAULT 'NONE',
    "fingerprint" VARCHAR(64) NOT NULL,
    "provenance" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "tax_trade_classification_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_withholding_input_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_subject_id" UUID NOT NULL,
    "competence" CHAR(7) NOT NULL,
    "economic_date" DATE NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(38,18),
    "currency" VARCHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_reference" VARCHAR(255) NOT NULL,
    "conflict_status" VARCHAR(20) NOT NULL DEFAULT 'NONE',
    "fingerprint" VARCHAR(64) NOT NULL,
    "provenance" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "tax_withholding_input_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fii_tax_eligibility_fact_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_subject_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "holder_count" INTEGER,
    "investor_ownership_percent" DECIMAL(38,18),
    "is_exchange_traded" BOOLEAN,
    "source_type" VARCHAR(50) NOT NULL,
    "source_reference" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "conflict_status" VARCHAR(20) NOT NULL DEFAULT 'NONE',
    "fingerprint" VARCHAR(64) NOT NULL,
    "provenance" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fii_tax_eligibility_fact_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_trade_classification_identity" ON "tax_trade_classification_records"("tax_subject_id", "transaction_id", "source_reference");
CREATE INDEX "tax_trade_classification_records_tax_subject_id_transaction_id_idx" ON "tax_trade_classification_records"("tax_subject_id", "transaction_id");
CREATE INDEX "tax_trade_classification_records_tax_subject_id_effective_date_idx" ON "tax_trade_classification_records"("tax_subject_id", "effective_date");

CREATE UNIQUE INDEX "tax_withholding_identity" ON "tax_withholding_input_records"("tax_subject_id", "source_type", "source_reference");
CREATE INDEX "tax_withholding_input_records_tax_subject_id_competence_idx" ON "tax_withholding_input_records"("tax_subject_id", "competence");
CREATE INDEX "tax_withholding_input_records_tax_subject_id_economic_date_idx" ON "tax_withholding_input_records"("tax_subject_id", "economic_date");

CREATE UNIQUE INDEX "fii_tax_eligibility_identity" ON "fii_tax_eligibility_fact_records"("tax_subject_id", "asset_id", "source_type", "source_reference", "as_of_date");
CREATE INDEX "fii_tax_eligibility_fact_records_tax_subject_id_asset_id_as_of_date_idx" ON "fii_tax_eligibility_fact_records"("tax_subject_id", "asset_id", "as_of_date");

ALTER TABLE "tax_trade_classification_records" ADD CONSTRAINT "tax_trade_classification_records_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_trade_classification_records" ADD CONSTRAINT "tax_trade_classification_records_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_withholding_input_records" ADD CONSTRAINT "tax_withholding_input_records_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fii_tax_eligibility_fact_records" ADD CONSTRAINT "fii_tax_eligibility_fact_records_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fii_tax_eligibility_fact_records" ADD CONSTRAINT "fii_tax_eligibility_fact_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
