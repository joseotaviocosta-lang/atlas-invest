-- Phase 4F — taxpayer identity boundary & official DARF generation/handoff
-- records (additive only). Atlas does NOT generate the official DARF; it stores
-- a masked identity reference and an immutable handoff provenance record.
-- No destructive changes.

CREATE TABLE "taxpayer_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "identity_type" VARCHAR(10) NOT NULL,
    "masked_identifier" VARCHAR(30) NOT NULL,
    "secure_reference" VARCHAR(64) NOT NULL,
    "identity_available" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taxpayer_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "official_darf_generation_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_subject_id" UUID NOT NULL,
    "tax_obligation_id" UUID,
    "tax_payment_aggregation_id" UUID,
    "generation_mode" VARCHAR(40) NOT NULL,
    "revenue_code" VARCHAR(10) NOT NULL,
    "competence" CHAR(7) NOT NULL,
    "due_date" DATE,
    "principal_amount" DECIMAL(38,18) NOT NULL,
    "late_fee_amount" DECIMAL(38,18),
    "interest_amount" DECIMAL(38,18),
    "total_amount" DECIMAL(38,18) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "official_document_id" VARCHAR(100),
    "official_reference" VARCHAR(255),
    "source_system" VARCHAR(40) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "version" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "superseded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_darf_generation_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "taxpayer_identities_user_id_key" ON "taxpayer_identities"("user_id");
CREATE UNIQUE INDEX "official_darf_generation_identity" ON "official_darf_generation_records"("tax_subject_id", "tax_obligation_id", "fingerprint");
CREATE INDEX "official_darf_generation_tax_subject_id_status_idx" ON "official_darf_generation_records"("tax_subject_id", "status");
CREATE INDEX "official_darf_generation_tax_subject_id_obligation_idx" ON "official_darf_generation_records"("tax_subject_id", "tax_obligation_id");

ALTER TABLE "taxpayer_identities" ADD CONSTRAINT "taxpayer_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "official_darf_generation_records" ADD CONSTRAINT "official_darf_generation_records_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "official_darf_generation_records" ADD CONSTRAINT "official_darf_generation_records_tax_obligation_id_fkey" FOREIGN KEY ("tax_obligation_id") REFERENCES "tax_obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
