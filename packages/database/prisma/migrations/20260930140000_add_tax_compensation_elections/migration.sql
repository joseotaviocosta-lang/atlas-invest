-- Phase 4G.2A.1a — persisted, immutable tax-compensation election revisions
-- (additive only). One logical identity is (tax_subject_id, competence,
-- election_type); each change inserts a new monotonic version. Same value is
-- idempotent; rows are never updated in place. No destructive changes.

CREATE TABLE "tax_compensation_elections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_subject_id" UUID NOT NULL,
    "competence" CHAR(7) NOT NULL,
    "election_type" VARCHAR(60) NOT NULL,
    "value" VARCHAR(30) NOT NULL,
    "version" INTEGER NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "supersedes_id" UUID,
    "fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_compensation_elections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tax_compensation_election_revision_identity" ON "tax_compensation_elections"("tax_subject_id", "competence", "election_type", "version");
CREATE INDEX "tax_compensation_elections_tax_subject_id_competence_elect_idx" ON "tax_compensation_elections"("tax_subject_id", "competence", "election_type");

ALTER TABLE "tax_compensation_elections" ADD CONSTRAINT "tax_compensation_elections_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
