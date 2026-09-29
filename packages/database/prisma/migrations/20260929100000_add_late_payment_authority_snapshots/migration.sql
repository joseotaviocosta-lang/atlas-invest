-- Phase 4D.2 — official late-fee authority snapshots and SELIC rate snapshots
-- (additive only). No destructive changes.

CREATE TABLE "official_late_fee_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "municipality_code" VARCHAR(10) NOT NULL,
    "due_date" DATE NOT NULL,
    "payment_date" DATE NOT NULL,
    "principal_amount" DECIMAL(38,18) NOT NULL,
    "late_fee_amount" DECIMAL(38,18) NOT NULL,
    "late_fee_percent" DECIMAL(38,18) NOT NULL,
    "start_business_date" DATE,
    "source_system" VARCHAR(30) NOT NULL,
    "source_reference" VARCHAR(500) NOT NULL,
    "source_retrieved_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_late_fee_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tax_interest_rate_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "index_name" VARCHAR(30) NOT NULL,
    "reference_month" CHAR(7) NOT NULL,
    "rate_percent" DECIMAL(38,18) NOT NULL,
    "source_authority" VARCHAR(100) NOT NULL,
    "source_reference" VARCHAR(500) NOT NULL,
    "source_retrieved_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_interest_rate_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "official_late_fee_snapshot_identity" ON "official_late_fee_snapshots"("municipality_code", "due_date", "payment_date", "principal_amount", "version");
CREATE INDEX "official_late_fee_snapshots_municipality_code_due_date_payment_date_idx" ON "official_late_fee_snapshots"("municipality_code", "due_date", "payment_date");

CREATE UNIQUE INDEX "tax_interest_rate_snapshot_identity" ON "tax_interest_rate_snapshots"("index_name", "reference_month", "version");
CREATE INDEX "tax_interest_rate_snapshots_index_name_reference_month_idx" ON "tax_interest_rate_snapshots"("index_name", "reference_month");

-- Seed: official Sicalc late-fee snapshots (verified from the public RFB/Sicalc
-- multa endpoint on 2026-09-29). Values are authoritative for the
-- business-day-sensitive late fee.
INSERT INTO "official_late_fee_snapshots"
  ("id", "municipality_code", "due_date", "payment_date", "principal_amount",
   "late_fee_amount", "late_fee_percent", "start_business_date", "source_system",
   "source_reference", "source_retrieved_at", "verified_at", "version", "fingerprint")
VALUES
  ('e1000000-0000-4000-8000-000000000001', '7107', '2026-09-30', '2026-10-01', 199.90,
   0.66, 0.33, '2026-10-01', 'SICALC',
   'https://sicalc.receita.fazenda.gov.br/sicalc/api/multa/calcula/7107/2026-09-30/2026-10-01/199.90',
   '2026-09-29T00:00:00Z', '2026-09-29T00:00:00Z', 1,
   md5('SICALC|7107|2026-09-30|2026-10-01|199.90|0.66|0.33')),
  ('e1000000-0000-4000-8000-000000000002', '7107', '2025-01-15', '2025-04-10', 1000.00,
   200.00, 20, '2025-01-16', 'SICALC',
   'https://sicalc.receita.fazenda.gov.br/sicalc/api/multa/calcula/7107/2025-01-15/2025-04-10/1000.00',
   '2026-09-29T00:00:00Z', '2026-09-29T00:00:00Z', 1,
   md5('SICALC|7107|2025-01-15|2025-04-10|1000.00|200.00|20'))
ON CONFLICT ("municipality_code", "due_date", "payment_date", "principal_amount", "version") DO NOTHING;

-- Seed: official monthly SELIC rates required for the verified historical
-- example (RFB Sicalc/RFB monthly acts). Values retrieved 2026-09-29.
INSERT INTO "tax_interest_rate_snapshots"
  ("id", "index_name", "reference_month", "rate_percent", "source_authority",
   "source_reference", "source_retrieved_at", "verified_at", "version")
VALUES
  ('e2000000-0000-4000-8000-000000000001', 'SELIC', '2025-02', 0.99, 'RFB',
   'https://sicalc.receita.fazenda.gov.br/sicalc/api/selic/acumulada/2025-01-01/2025-04-01',
   '2026-09-29T00:00:00Z', '2026-09-29T00:00:00Z', 1),
  ('e2000000-0000-4000-8000-000000000002', 'SELIC', '2025-03', 0.96, 'RFB',
   'https://sicalc.receita.fazenda.gov.br/sicalc/api/selic/acumulada/2025-01-01/2025-04-01',
   '2026-09-29T00:00:00Z', '2026-09-29T00:00:00Z', 1)
ON CONFLICT ("index_name", "reference_month", "version") DO NOTHING;
