-- Phase 4K.1: taxpayer compliance workflow actions persistence.
-- Additive-only: creates tax_compliance_actions table with revision-aware uniqueness.
-- Derived tax results are never persisted here; only user-reported workflow actions.

-- CreateTable
CREATE TABLE "tax_compliance_actions" (
    "id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "obligation_key" VARCHAR(255) NOT NULL,
    "action_type" VARCHAR(50) NOT NULL,
    "source_fingerprint" VARCHAR(64),
    "note" TEXT,
    "metadata" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_compliance_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_compliance_action_lookup_idx" ON "tax_compliance_actions"("tax_subject_id", "obligation_key");

-- CreateIndex
CREATE INDEX "tax_compliance_action_time_idx" ON "tax_compliance_actions"("tax_subject_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "tax_compliance_action_rev_uniq" ON "tax_compliance_actions"("tax_subject_id", "obligation_key", "revision");

-- AddForeignKey
ALTER TABLE "tax_compliance_actions" ADD CONSTRAINT "tax_compliance_actions_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

