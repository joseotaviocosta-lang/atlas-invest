-- Phase 4I.5A: repair the empty 20261002000000_add_taxpayer_confirmations
-- migration. That migration.sql was committed as a 0-byte file (Git empty blob
-- e69de29, commit 464456d), so the taxpayer_confirmations table backing
-- model TaxpayerConfirmationRecord was never created in any environment that
-- ran only tracked migrations. This additive, deterministic migration creates
-- the table exactly as the schema defines it. Not continuous-deploy-breaking:
-- additive-only; the historical empty migration is left untouched.

-- CreateTable
CREATE TABLE "taxpayer_confirmations" (
    "id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "calendar_year" INTEGER NOT NULL,
    "confirmation_type" VARCHAR(60) NOT NULL,
    "subject_reference" VARCHAR(255) NOT NULL,
    "decision" VARCHAR(30) NOT NULL,
    "statement_version" VARCHAR(30) NOT NULL,
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "created_by_principal" VARCHAR(255) NOT NULL,
    "revision" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "supersedes_id" UUID,
    "notes" TEXT,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "taxpayer_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "taxpayer_conf_lookup_idx" ON "taxpayer_confirmations"("tax_subject_id", "calendar_year", "confirmation_type", "subject_reference");

-- CreateIndex
CREATE INDEX "taxpayer_conf_year_idx" ON "taxpayer_confirmations"("tax_subject_id", "calendar_year");

-- CreateIndex
CREATE UNIQUE INDEX "taxpayer_conf_rev_uniq" ON "taxpayer_confirmations"("tax_subject_id", "calendar_year", "confirmation_type", "subject_reference", "revision");

-- AddForeignKey
ALTER TABLE "taxpayer_confirmations" ADD CONSTRAINT "taxpayer_confirmations_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
