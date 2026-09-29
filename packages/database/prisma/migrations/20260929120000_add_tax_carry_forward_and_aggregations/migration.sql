-- Phase 4E — minimum DARF & same-revenue-code carry-forward (additive only).
--
-- Federal tax below the minimum DARF threshold (R$ 10,00; Lei 9.430/1996
-- art. 68 caput e §1º) is never discarded and never rewritten to zero. It is
-- represented as an immutable `tax_carry_forward_entries` fact and combined into
-- a derived `tax_payment_aggregations` unit. No destructive changes.
--
-- Consumption is explicit and exactly-once: an OPEN entry may be consumed once
-- and is marked CONSUMED (never deleted). Cross-revenue-code aggregation is
-- forbidden. No official DARF is generated in this phase.

CREATE TABLE "tax_payment_aggregations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_subject_id" UUID NOT NULL,
    "revenue_code" VARCHAR(10) NOT NULL,
    "target_competence" CHAR(7) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "current_amount" DECIMAL(38,18) NOT NULL,
    "carry_forward_amount" DECIMAL(38,18) NOT NULL,
    "total_payable" DECIMAL(38,18) NOT NULL,
    "minimum_threshold" DECIMAL(38,18) NOT NULL,
    "source_entry_ids" JSONB NOT NULL,
    "current_obligation_id" UUID,
    "due_date" DATE,
    "status" VARCHAR(20) NOT NULL,
    "rule_id" VARCHAR(100) NOT NULL,
    "rule_version" VARCHAR(30) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_payment_aggregations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_carry_forward_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_subject_id" UUID NOT NULL,
    "source_obligation_id" UUID NOT NULL,
    "source_competence" CHAR(7) NOT NULL,
    "revenue_code" VARCHAR(10) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "target_competence" CHAR(7),
    "consumed_by_aggregation_id" UUID,
    "consumed_at" TIMESTAMPTZ(6),
    "rule_id" VARCHAR(100) NOT NULL,
    "rule_version" VARCHAR(30) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_carry_forward_entries_pkey" PRIMARY KEY ("id")
);

-- At most one carry-forward entry per source obligation + rule version.
CREATE UNIQUE INDEX "tax_carry_forward_source_identity" ON "tax_carry_forward_entries"("source_obligation_id", "rule_id", "rule_version");
CREATE INDEX "tax_carry_forward_tax_subject_id_revenue_code_status_idx" ON "tax_carry_forward_entries"("tax_subject_id", "revenue_code", "status");
CREATE INDEX "tax_carry_forward_tax_subject_id_revenue_code_target_idx" ON "tax_carry_forward_entries"("tax_subject_id", "revenue_code", "target_competence");
CREATE INDEX "tax_carry_forward_consumed_by_aggregation_id_idx" ON "tax_carry_forward_entries"("consumed_by_aggregation_id");

CREATE UNIQUE INDEX "tax_payment_aggregation_identity" ON "tax_payment_aggregations"("tax_subject_id", "revenue_code", "target_competence", "fingerprint");
CREATE INDEX "tax_payment_aggregations_tax_subject_id_revenue_code_idx" ON "tax_payment_aggregations"("tax_subject_id", "revenue_code", "target_competence");

ALTER TABLE "tax_payment_aggregations" ADD CONSTRAINT "tax_payment_aggregations_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_payment_aggregations" ADD CONSTRAINT "tax_payment_aggregations_current_obligation_id_fkey" FOREIGN KEY ("current_obligation_id") REFERENCES "tax_obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tax_carry_forward_entries" ADD CONSTRAINT "tax_carry_forward_entries_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_carry_forward_entries" ADD CONSTRAINT "tax_carry_forward_entries_source_obligation_id_fkey" FOREIGN KEY ("source_obligation_id") REFERENCES "tax_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_carry_forward_entries" ADD CONSTRAINT "tax_carry_forward_entries_consumed_by_aggregation_id_fkey" FOREIGN KEY ("consumed_by_aggregation_id") REFERENCES "tax_payment_aggregations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
