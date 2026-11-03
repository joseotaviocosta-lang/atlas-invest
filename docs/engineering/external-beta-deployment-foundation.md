# Project Atlas — External Beta Deployment Foundation

**Document Version:** 1.0.0  
**Status:** READY / ASSETS COMMITTED (NO DEPLOY YET)  
**Target Environment:** External Beta (São Paulo / `sa-east-1`)  
**Architecture Reference:** [ADR-290](file:///c:/Projetos/atlas-invest/docs/decisions/ADR-290-external-beta-deployment-architecture-and-operational-boundaries.md)  
**Runbook Reference:** [Deployment Runbook](file:///c:/Projetos/atlas-invest/docs/engineering/external-beta-deployment-runbook.md)  

---

## 1. Executive Summary

This document establishes the repository-side foundation for the **Project Atlas External Beta** release, following the architectural decisions codified in **ADR-290** (Option B: Linux VPS / container host + Managed PostgreSQL 16 in São Paulo `sa-east-1`).

All deployment configurations, orchestration manifests, reverse proxy specifications, environment templates, and CI/CD pipelines have been implemented and locally validated without provisioning cloud resources, modifying DNS, mutating the production ledger, or creating database schema drift.

---

## 2. Invariants & Architecture Guarantees

| Domain | Specification | Invariant / Enforcement |
| :--- | :--- | :--- |
| **Hosting Model** | Linux VPS (sa-east-1) | Option B (ADR-290). Cost-effective, lowest latency to B3/investors. |
| **Database** | Managed PostgreSQL 16 | Private VPC network isolation. 48 canonical migrations strictly immutable. |
| **Ledger Integrity** | Append-Only | Zero updates/deletes. Arithmetic precision via `Decimal.js` (zero float). |
| **Filesystem Storage** | 100% Stateless | B3 XLSX/CSV imports parsed in-memory. Zero S3/GCS object storage dependency. |
| **Reverse Proxy** | Caddy 2 (`caddy:2-alpine`) | Automated TLS (Let's Encrypt / ZeroSSL), HSTS, `nosniff`, `DENY` clickjacking protection. |
| **Web Container** | Next.js 15 Standalone | Node 22 Alpine, non-root `node` user, internal routing via `ATLAS_API_INTERNAL_URL`. |
| **API Container** | NestJS Single Replica | Node 22 Alpine, non-root `node` user, single replica (zero scheduler collision). |
| **Authentication & Access** | Invite-Only Beta | `ALLOW_PUBLIC_REGISTRATION="false"`. Registration endpoint returns 403. |
| **Tax Evidence Flag** | Controlled Gate | `TAX_COST_EVIDENCE_ENRICHMENT_ENABLED="false"` until real disposal validated. |
| **Scheduler Flag** | Manual Fallback | `INTEGRATION_SCHEDULER_ENABLED="false"`. Manual B3 Excel/CSV import fallback. |

---

## 3. Deployment Asset Inventory

### 3.1. Orchestration: `compose.prod.yml`
- Root production compose file defining three services: `caddy`, `web`, and `api`.
- **Database Exclusion:** Contains NO database service; the API connects exclusively to the external managed PostgreSQL 16 instance.
- **Port Exposure:** Only Caddy exposes public host ports (`80:80` and `443:443`). `web` (3000) and `api` (3001) are exposed only to the private `atlas_network` bridge.
- **Log Hygiene:** Configured with `json-file` driver, `max-size: 20m`, and `max-file: 5` to prevent disk exhaustion.
- **Health Checks:** Native healthchecks on all services with `depends_on: condition: service_healthy`.

### 3.2. Reverse Proxy: `deploy/Caddyfile`
- Formatted and validated against Caddy 2.
- Enforces strict security headers:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Compresses responses with `zstd` and `gzip`.
- Grants up to 25MB request body size on the API endpoint for large B3 consolidated spreadsheets.

### 3.3. Environment Template: `.env.production.example`
- Documents all required production variables with security instructions.
- Specifies cryptographically strong secrets requirement (>= 32 characters).
- Explicitly documents private VPC database URL syntax with `sslmode=require`.

### 3.4. Build Hygiene: `.dockerignore`
- Reduces Docker build context transfer from over 100MB to under 1MB.
- Excludes `.git`, `node_modules`, `.next`, `dist`, `.turbo`, `.test_pgdata*`, `backups/`, `scratch/`, `hv-fixtures/`, logs, and temporary dumps.

### 3.5. CI Pipeline: `.github/workflows/ci.yml`
- Runs on GitHub Actions `ubuntu-latest` with ephemeral `postgres:16-alpine`.
- Verifies migration baseline status (`pnpm --filter @atlas/database prisma migrate status`).
- Executes full validation suites: linting, formatting, typechecking across 26 packages, unit, integration, and E2E tests.
- Verifies container builds for `atlas-api` and `atlas-web`.

### 3.6. Release Pipeline: `.github/workflows/deploy-beta.yml`
- Strictly manual execution (`workflow_dispatch`).
- Requires typing `DEPLOY-EXTERNAL-BETA` and providing a managed database snapshot identifier.
- Enforces pre-traffic migration gate: runs `prisma migrate deploy` and verifies migration count before updating application containers.
- Executes automated post-deployment smoke tests against `/health`, `/ready`, and `/login`.

---

## 4. Verification Evidence Matrix

| Gate / Asset | Verification Method | Outcome |
| :--- | :--- | :--- |
| **PostgreSQL 16 Engine** | Ephemeral `postgres:16-alpine` on port 5439 applying all 48 migrations from scratch. | **PASS** (48/48 applied, schema up to date) |
| **Prisma Generator** | Standard client generator targeting pnpm virtual store in Linux container. | **PASS** (Generated in 1.32s) |
| **API Dockerfile** | `docker build -t atlas-api:test -f apps/api/Dockerfile .` | **PASS** (371MB image produced) |
| **Web Dockerfile** | `docker build -t atlas-web:test -f apps/web/Dockerfile .` | **PASS** (Standalone Next.js build) |
| **Caddyfile Syntax** | `docker run --rm -v ... caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile` | **PASS** ("Valid configuration") |
| **Compose Prod Config** | `docker compose -f compose.prod.yml config` | **PASS** (Valid Docker Compose v2 syntax) |
| **Secrets Validation** | `tests/api/production-readiness-closure.test.ts` (10/10 Vitest tests) | **PASS** (Fails fast on missing/weak secrets) |
| **Registration Lock** | Verified `ALLOW_PUBLIC_REGISTRATION="false"` returns 403 Forbidden | **PASS** (`AUTH.REGISTRATION_DISABLED`) |
| **Scheduler Dormancy** | Verified `INTEGRATION_SCHEDULER_ENABLED="false"` skips cron registration | **PASS** (Manual import fallback active) |
| **Stateless Storage** | Audited B3 upload controllers for disk writes | **PASS** (100% in-memory buffer parsing) |
