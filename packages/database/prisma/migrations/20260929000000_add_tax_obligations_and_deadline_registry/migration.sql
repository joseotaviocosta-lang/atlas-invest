-- Phase 4C.2 — direct official tax deadline registry, tax obligations and
-- manual payment evidence (additive only). No destructive changes.
--
-- Deadline entries are immutable/versioned official facts seeded from the RFB
-- Agenda Tributária / ADE CORAT. Obligations are derived operational state;
-- payment evidence is manual-only and never mutates the tax liability.

CREATE TABLE "federal_tax_deadline_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revenue_code" VARCHAR(10) NOT NULL,
    "tax_bucket" VARCHAR(30) NOT NULL,
    "competence" CHAR(7) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "source_authority" VARCHAR(100) NOT NULL,
    "source_document" VARCHAR(200) NOT NULL,
    "source_reference" VARCHAR(500) NOT NULL,
    "source_published_at" DATE NOT NULL,
    "verified_at" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "supersedes_entry_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "federal_tax_deadline_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_obligations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_subject_id" UUID NOT NULL,
    "competence" CHAR(7) NOT NULL,
    "tax_bucket" VARCHAR(30),
    "revenue_code" VARCHAR(10),
    "liability_fingerprint" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL,
    "deadline_entry_id" UUID,
    "principal_amount" DECIMAL(38,18),
    "currency" VARCHAR(3),
    "due_date" DATE,
    "status" VARCHAR(30) NOT NULL,
    "reason_code" VARCHAR(50),
    "darf_readiness" VARCHAR(20) NOT NULL,
    "darf_readiness_reason" VARCHAR(50),
    "data_quality" VARCHAR(20) NOT NULL,
    "superseded_by_id" UUID,
    "provenance" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_obligations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_payment_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "obligation_id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "paid_at" DATE NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "source_reference" VARCHAR(255),
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_payment_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "federal_tax_deadline_version_identity" ON "federal_tax_deadline_entries"("revenue_code", "competence", "version");
-- At most one active VERIFIED entry per logical identity (revenue code + competence).
CREATE UNIQUE INDEX "federal_tax_deadline_active_verified_identity" ON "federal_tax_deadline_entries"("revenue_code", "competence") WHERE "status" = 'VERIFIED';
CREATE INDEX "federal_tax_deadline_entries_revenue_code_competence_status_idx" ON "federal_tax_deadline_entries"("revenue_code", "competence", "status");

CREATE UNIQUE INDEX "tax_obligation_identity" ON "tax_obligations"("tax_subject_id", "competence", "liability_fingerprint", "revision");
CREATE INDEX "tax_obligations_tax_subject_id_competence_idx" ON "tax_obligations"("tax_subject_id", "competence");
CREATE INDEX "tax_obligations_tax_subject_id_status_idx" ON "tax_obligations"("tax_subject_id", "status");

CREATE UNIQUE INDEX "tax_payment_evidence_source_identity" ON "tax_payment_evidence"("obligation_id", "source_reference");
CREATE UNIQUE INDEX "tax_payment_evidence_fingerprint_identity" ON "tax_payment_evidence"("obligation_id", "fingerprint");
CREATE INDEX "tax_payment_evidence_tax_subject_id_obligation_id_idx" ON "tax_payment_evidence"("tax_subject_id", "obligation_id");

ALTER TABLE "tax_obligations" ADD CONSTRAINT "tax_obligations_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_obligations" ADD CONSTRAINT "tax_obligations_deadline_entry_id_fkey" FOREIGN KEY ("deadline_entry_id") REFERENCES "federal_tax_deadline_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tax_payment_evidence" ADD CONSTRAINT "tax_payment_evidence_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "tax_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tax_payment_evidence" ADD CONSTRAINT "tax_payment_evidence_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: official VERIFIED production deadline entries (RFB Agenda Tributária /
-- ADE CORAT). Idempotent by version identity.
INSERT INTO "federal_tax_deadline_entries"
  ("id", "revenue_code", "tax_bucket", "competence", "due_date", "status",
   "source_authority", "source_document", "source_reference", "source_published_at",
   "verified_at", "version", "supersedes_entry_id", "metadata")
VALUES
  ('f0000000-0000-4000-8000-000000000001', '6015', 'FII_SALE', '2026-08', '2026-09-30', 'VERIFIED',
   'RFB', 'ADE CORAT nº 63/2026', 'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2026/Setembro/dia-30-09-2026',
   '2026-08-27', '2026-09-28', 1, NULL,
   '{"periodicity":"MENSAL","description":"Ganhos líquidos em operações em bolsa","douPublication":"2026-08-27"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000002', '6015', 'FII_SALE', '2026-09', '2026-10-30', 'VERIFIED',
   'RFB', 'ADE CORAT nº 78/2026', 'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2026/Outubro/dia-30-10-2026',
   '2026-09-28', '2026-09-28', 1, NULL,
   '{"periodicity":"MENSAL","description":"Ganhos líquidos em operações em bolsa","adjustedFor":"month-end Saturday (31/10/2026)"}'::jsonb),
  ('f0000000-0000-4000-8000-000000000003', '6015', 'FII_SALE', '2025-07', '2025-08-29', 'VERIFIED',
   'RFB', 'Agenda Tributária — agosto/2025', 'https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/2025/agosto/dia-29-08-2025',
   '2025-08-27', '2026-09-28', 1, NULL,
   '{"periodicity":"MENSAL","description":"Ganhos líquidos em operações em bolsa","adjustedFor":"month-end Saturday+Sunday (30-31/08/2025)"}'::jsonb)
ON CONFLICT ("revenue_code", "competence", "version") DO NOTHING;
