-- AlterTable
ALTER TABLE "tax_settlement_records" ADD COLUMN "evidence_fingerprint" VARCHAR(64);

-- Backfill existing rows if any
UPDATE "tax_settlement_records"
SET "evidence_fingerprint" = encode(sha256(
  ('{"amountReported":"' || amount_reported::text || '","externalReference":' || COALESCE('"' || external_reference || '"', 'null') || ',"note":' || COALESCE('"' || note || '"', 'null') || ',"obligationKey":"' || obligation_key || '","paymentDate":"' || payment_date::text || '","referencePeriod":"' || reference_period || '","revenueCodeReported":' || COALESCE('"' || revenue_code_reported || '"', 'null') || ',"sourceFingerprint":"' || source_fingerprint || '","taxSubjectId":"' || tax_subject_id::text || '","verificationStatus":"' || verification_status || '"}')::bytea
), 'hex')
WHERE "evidence_fingerprint" IS NULL;

-- Deduplicate any duplicate historical semantic rows by keeping the lowest revision
DELETE FROM "tax_settlement_records" a
USING "tax_settlement_records" b
WHERE a.id <> b.id
  AND a.revision > b.revision
  AND a.tax_subject_id = b.tax_subject_id
  AND a.obligation_key = b.obligation_key
  AND a.source_fingerprint = b.source_fingerprint
  AND a.evidence_fingerprint = b.evidence_fingerprint;

-- AlterTable
ALTER TABLE "tax_settlement_records" ALTER COLUMN "evidence_fingerprint" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tax_settlement_record_semantic_uniq" ON "tax_settlement_records"("tax_subject_id", "obligation_key", "source_fingerprint", "evidence_fingerprint");

