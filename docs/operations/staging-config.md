# Staging Configuration Template (Phase 5G)

Copy values per environment. **Never commit real secrets.** All values below
are safe defaults or placeholders.

```env
# Environment identity
NODE_ENV=staging

# Database (staging database URL; never point at atlas_dev from automation)
DATABASE_URL=postgresql://atlas:***@STAGING_HOST:5432/atlas_staging?schema=public
DATABASE_TEST_URL=postgresql://atlas:atlas@localhost:5433/atlas_test?schema=public

# Auth secrets (32+ chars, unique per environment; placeholder only)
JWT_ACCESS_SECRET=replace-with-staging-secret-min-32-chars
REFRESH_TOKEN_PEPPER=replace-with-staging-pepper-min-32-chars
PASSWORD_RESET_PEPPER=replace-with-staging-reset-pepper-min-32-chars

# Ingestion scheduler (default OFF; staging enables explicitly AFTER readiness passes)
INGESTION_SCHEDULER_ENABLED=false
INGESTION_OPERATOR_USER_IDS=<operator-uuid>,<operator-uuid-2>

# Provider selection (names only; keys stay in secret storage, never in Git)
MARKET_DATA_PROVIDER=BRAPI
BENCHMARK_DATA_PROVIDER=yahoo
RATE_BENCHMARK_DATA_PROVIDER=bcb

# API surface
ALLOWED_ORIGINS=https://staging.atlas.example,http://localhost:3000
NEXT_PUBLIC_API_URL=https://staging-api.atlas.example
NEXT_PUBLIC_APP_URL=https://staging.atlas.example
API_BASE_URL=https://staging-api.atlas.example
```

## Enablement checklist (staging)

1. Apply all migrations (`prisma migrate deploy`) and verify 31/31.
2. Confirm operator allowlist contains only staging operators.
3. `GET /api/v1/admin/operations/scheduler/readiness` as operator → READY.
4. Set `INGESTION_SCHEDULER_ENABLED=true` and restart the API.
5. Watch `data-status` for HEALTHY sources; investigate DEGRADED before release.
6. To disable: set the flag to `false` and restart (no data migration needed).

## Timezone and clock

Scheduler and freshness use `America/Sao_Paulo` civil dates. Keep host clocks
NTP-synced; freshness cutoffs (20:00 default, 15:00 FX) assume local civil time.
