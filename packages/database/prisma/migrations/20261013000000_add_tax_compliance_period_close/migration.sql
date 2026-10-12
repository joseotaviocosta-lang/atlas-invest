-- CreateTable
CREATE TABLE "tax_compliance_period_close_records" (
    "id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "period" VARCHAR(16) NOT NULL,
    "calendar_year" INTEGER NOT NULL,
    "month" VARCHAR(7),
    "exercise" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "record_status" VARCHAR(16) NOT NULL,
    "status_at_close" VARCHAR(32),
    "close_mode" VARCHAR(32),
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "binder_fingerprint" VARCHAR(64) NOT NULL,
    "reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_compliance_period_close_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_period_close_rev_uniq" ON "tax_compliance_period_close_records"("tax_subject_id", "scope", "period", "revision");

-- CreateIndex
CREATE INDEX "tax_period_close_lookup_idx" ON "tax_compliance_period_close_records"("tax_subject_id", "scope", "period");

-- AddForeignKey
ALTER TABLE "tax_compliance_period_close_records" ADD CONSTRAINT "tax_compliance_period_close_records_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
