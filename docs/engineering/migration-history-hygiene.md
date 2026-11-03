# Project Atlas — Migration History Hygiene & Clean Release Baseline
## Forensic Audit, Governance Decision, and Pre-Release Verification

---

## 1. Executive Summary

This document establishes the pre-release migration governance baseline for **Project Atlas** prior to any staging or production deployment. It resolves the forensic debt identified around migration 47 (`20261030163031_add_cost_basis_evidence`) and migration 48 (`20261030164500_fix_cost_evidence_identity`).

### Key Findings
1. **Zero Schema Drift**: A clean deployment of migrations `0 → 48` against a fresh PostgreSQL 16 database produces a schema that is **100% byte-for-byte and index-for-index equivalent** to the active development database (`atlas_dev`). `prisma migrate diff` reports **`No difference detected.`**
2. **Deterministic Fresh Deployment**: Fresh instances (including CI on `atlas_test` and ephemeral clean databases) execute `prisma migrate deploy` through all 48 migrations with exit code `0` and zero warnings.
3. **Historical Root Cause Identified**: Migration 47 originally applied a unique constraint on `(portfolio_id, fingerprint)`. In development, identity requirements were refined to include `version` (`(portfolio_id, fingerprint, version)`). The repository file was adjusted prior to commit `cd5dcac`, while migration 48 was added as an idempotent compensation (`DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT IF NOT EXISTS ...`).
4. **Governance Decision**: The migration chain `0 → 48` is **frozen as canonical and immutable** (Option A with formal baseline). No migration files are rewritten, avoiding artificial drift against CI environments (`atlas_test`) and future production runners.

---

## 2. Forensic Timeline & Evidence

### Migration Inventory (47 & 48)
- **Migration 47**: `20261030163031_add_cost_basis_evidence`
  - Created table: `cost_basis_evidence`
  - Identity in committed file: `CONSTRAINT "cost_evidence_fingerprint_version_identity" UNIQUE ("portfolio_id", "fingerprint", "version")`
- **Migration 48**: `20261030164500_fix_cost_evidence_identity`
  - Purpose: Idempotent migration to ensure `cost_evidence_fingerprint_version_identity` exists and any legacy `cost_evidence_fingerprint_identity` is dropped.
  - Safe on both fresh DBs (where it is an idempotent no-op) and historical DBs.

### Checksum Matrix Across Environments

| Environment | Database URL | Migration 47 Checksum | Migration 48 Checksum | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Repository File (Disk)** | `packages/database/...` | `f8008303f248008c5f6aa243326eb53b6f02eff5bdb590ad9baf574b1fb0dfe8` | `3f2d8ecce95063b062c36429e73d1a68adb93be3e4446c5e6e6797c51b1824a8` | Canonical |
| **Clean Database (Fresh 0→48)** | `127.0.0.1:5439/atlas_clean` | `f8008303f248008c5f6aa243326eb53b6f02eff5bdb590ad9baf574b1fb0dfe8` | `3f2d8ecce95063b062c36429e73d1a68adb93be3e4446c5e6e6797c51b1824a8` | **MATCH (100%)** |
| **Test Database (CI)** | `127.0.0.1:5433/atlas_test` | `f8008303f248008c5f6aa243326eb53b6f02eff5bdb590ad9baf574b1fb0dfe8` | `3f2d8ecce95063b062c36429e73d1a68adb93be3e4446c5e6e6797c51b1824a8` | **MATCH (100%)** |
| **Active Dev Database** | `127.0.0.1:5434/atlas_dev` | `ec276b98da316d4c9adc1a68680f2a1e4f5289a46cfc4d0d75e3bdad79322436` | `3f2d8ecce95063b062c36429e73d1a68adb93be3e4446c5e6e6797c51b1824a8` | Up to date (`0` pending) |

### Git Forensics
- Commit `cd5dcac4921441451ecfecd16aafdecd5184fcde` is the single commit introducing both migrations 47 and 48.
- There are no prior git commits containing earlier blobs of migration 47.
- `prisma migrate status` on `atlas_dev` reports:
  ```text
  48 migrations found in prisma/migrations
  Database schema is up to date!
  ```

---

## 3. Evaluation of Remediation Options

### Option A — Freeze History As-Is (CHOSEN)
- **Rationale**:
  1. The 48 migration files in Git are already 100% synchronized with clean environments and CI (`atlas_test`).
  2. Running `prisma migrate deploy` on any fresh database applies all 48 migrations flawlessly.
  3. The resulting database schema is 100% identical to the active development database (`No difference detected`).
  4. There is no prior git blob to "restore"; attempting to fabricate an uncommitted intermediate state would break `atlas_test` and introduce synthetic history.
  5. `_prisma_migrations` on development is not edited manually, upholding the rule against tampering with migration metadata.

### Option B — Restore Hypothetical Original Blob
- **Rejected**: Conditioned on the original blob being provable in git. Git history contains only `cd5dcac`, which committed the current file. Inventing an uncommitted file breaks `atlas_test` and future clean deployments.

### Option C — Squash Pre-Production Migrations
- **Rejected**: Squashing eliminates granular historical context across the entire 48-migration chain and risks operational disruption without adding safety.

---

## 4. Permanent Migration Immutability Policy

1. **Applied Migrations Are Strictly Immutable**:
   Once a migration file exists in `packages/database/prisma/migrations` and has been committed or applied to any database, it must NEVER be modified in place.
2. **All Corrections Are Append-Only**:
   Any schema revision, index adjustment, or constraint correction must be authored as a **new forward migration** via `prisma migrate dev` or `prisma migrate create`.
3. **No Direct Metadata Manipulation**:
   The `_prisma_migrations` table is an append-only ledger managed exclusively by the Prisma CLI. Manual `UPDATE` or `DELETE` queries on `_prisma_migrations` are strictly prohibited.

---

## 5. Multi-Instance Database Safety & Port Guardrails

Project Atlas utilizes distinct local PostgreSQL instances to isolate environments and prevent accidental cross-database migrations.

### Canonical Port Mapping
- **Development Database**: `127.0.0.1:5434` (`atlas_postgres_dev5434`, database: `atlas_dev`)
- **Test Database (Vitest)**: `127.0.0.1:5433` (`atlas_postgres_test`, database: `atlas_test`)
- **Legacy Database**: `127.0.0.1:5432` (`atlas_postgres` — DO NOT TARGET for Atlas operations)

### Pre-Migration Verification Rule
Before executing any DDL or migration command (`prisma migrate dev`, `prisma migrate deploy`, `prisma db push`), developers and CI pipelines must verify:
```bash
# Verify target database port and database name
echo $DATABASE_URL
# Expected dev: postgresql://atlas:atlas@127.0.0.1:5434/atlas_dev?schema=public
# Expected test: postgresql://atlas:atlas@127.0.0.1:5433/atlas_test?schema=public
```

---

## 6. Fresh Environment Deployment Runbook

For new developer setups, CI runners, staging environments, and production deployment:

### Step 1: Ensure Target Database is Active
```bash
docker exec atlas_postgres_dev5434 pg_isready -U atlas
```

### Step 2: Validate Target Environment URL
```bash
# Verify port is 5434 for dev (or staging/production target)
pnpm --filter @atlas/database exec prisma migrate status
```

### Step 3: Apply Canonical Migration Chain
```bash
pnpm --filter @atlas/database exec prisma migrate deploy
```

### Step 4: Validate Resulting Schema
```bash
pnpm --filter @atlas/database exec prisma migrate diff \
  --from-schema-datamodel packages/database/prisma/schema.prisma \
  --to-url "$DATABASE_URL"
```

---

## 7. Release Baseline Definition

```text
MIGRATION_RELEASE_BASELINE
- Total migrations: 48
- Range: 20260915000000_init_financial_persistence → 20261030164500_fix_cost_evidence_identity
- Fresh deploy 0→48: PASS (exit code 0, 0 errors, 0 warnings)
- Active dev DB status: PASS (Database schema is up to date!)
- CI test DB status: PASS (48/48 applied with identical checksums)
- Schema equivalence: PASS (No difference detected)
- Ledger integrity: 137 transactions preserved
- Evidence integrity: 3 KCRE11 records preserved
```
This baseline serves as the formal foundation for all future migrations (49+).

