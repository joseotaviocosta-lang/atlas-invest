-- Cost-basis evidence identity fix (ADR-310 follow-up).
-- Status transitions (submit/verify/reject) and content revisions reuse the
-- same semantic fingerprint with a bumped version, so the identity must be
-- per-version. Exact resubmission (no parent, version 1) stays idempotent.
-- Idempotent: safe whether the dev database currently carries the old
-- single-column identity (as index or constraint) or the new one already.
ALTER TABLE "cost_basis_evidence" DROP CONSTRAINT IF EXISTS "cost_evidence_fingerprint_identity";
DROP INDEX IF EXISTS "cost_evidence_fingerprint_identity";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cost_evidence_fingerprint_version_identity'
  ) THEN
    ALTER TABLE "cost_basis_evidence"
      ADD CONSTRAINT "cost_evidence_fingerprint_version_identity"
      UNIQUE ("portfolio_id", "fingerprint", "version");
  END IF;
END
$$;
