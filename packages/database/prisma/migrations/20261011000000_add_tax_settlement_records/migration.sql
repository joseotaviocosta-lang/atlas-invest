-- CreateTable
CREATE TABLE "tax_settlement_records" (
    "id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "obligation_key" VARCHAR(255) NOT NULL,
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "payment_date" DATE NOT NULL,
    "amount_reported" DECIMAL(38,18) NOT NULL,
    "revenue_code_reported" VARCHAR(16),
    "reference_period" VARCHAR(16) NOT NULL,
    "external_reference" VARCHAR(255),
    "note" TEXT,
    "verification_status" VARCHAR(32) NOT NULL DEFAULT 'USER_REPORTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_settlement_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_settlement_record_rev_uniq" ON "tax_settlement_records"("tax_subject_id", "obligation_key", "revision");

-- CreateIndex
CREATE INDEX "tax_settlement_record_lookup_idx" ON "tax_settlement_records"("tax_subject_id", "obligation_key");

-- CreateIndex
CREATE INDEX "tax_settlement_record_period_idx" ON "tax_settlement_records"("tax_subject_id", "reference_period");

-- AddForeignKey
ALTER TABLE "tax_settlement_records" ADD CONSTRAINT "tax_settlement_records_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

