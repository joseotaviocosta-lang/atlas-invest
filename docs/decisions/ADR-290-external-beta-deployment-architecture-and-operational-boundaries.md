# ADR-290 — External Beta Deployment Architecture and Operational Boundaries

**Status:** APPROVED  
**Date:** 2026-11-03  
**Deciders:** Project Atlas Core Architecture Team & Engineering  
**Consulted:** Security, Tax Engine, Reliability, Operations  
**Informed:** Repository Stakeholders  

---

## 1. Context and Problem Statement

Project Atlas has completed Phase 6B (Migration History Hygiene & Clean Release Baseline) and Phase 6C (Reliability & Observability Baseline), achieving `ENGINEERING_READY_FOR_EXTERNAL_BETA` with 48/48 verified migrations, deterministic portfolio replay (109/109), and Contextual Tax Intelligence (CTI v1).

Before any external deployment can occur, an explicit Architecture Decision Record (ADR) must select and codify the deployment vehicle, hosting architecture, database model, secret management, backup policy, and operational boundaries for the upcoming external beta.

### Target Beta Profile:
- **Cohort:** Small, invite-only group of 5 to 20 trusted investors.
- **Traffic:** Low concurrency (1 to 5 concurrent sessions peak).
- **Data Sensitivity:** Real personal financial transactions, portfolio custody, and tax calculation records.
- **Integrations:** Manual B3 statement import (XLSX/CSV) processed in-memory; automated direct B3 API sync remains externally blocked.
- **Operations:** Owner-led, single-operator operations with high cost sensitivity and low operational tolerance for complex orchestration (e.g., Kubernetes).

---

## 2. Decision Drivers

1. **Data Security & Privacy (LGPD):** Financial data must reside in Brazil or a fully compliant jurisdiction, encrypted at rest and in transit, with database endpoints isolated from the public internet.
2. **Reliability & Failure Containment:** Decouple application compute crashes from database availability. A compute restart must not risk database corruption.
3. **Automated Disaster Recovery & Backups:** Zero manual daily backup burden; reliable point-in-time recovery and snapshot automation.
4. **Operational Simplicity:** Minimize moving parts. Avoid multi-cluster setups, complex service meshes, or heavy orchestration for a small beta.
5. **Cost Predictability:** Total monthly infrastructure cost must remain strictly controlled (target: \$35 to \$60/month).
6. **Zero Vendor Lock-in:** Architecture must rely on standard Docker containers (Node 22 Alpine) and vanilla PostgreSQL 16, allowing relocation between cloud providers in under 1 hour.

---

## 3. Evaluated Candidates

### Option A — Single Linux VPS with Docker Compose (All-in-One)
- **Topology:** Single VPS hosting Reverse Proxy (Caddy/Nginx) + Web container + API container + PostgreSQL container in Docker.
- **Pros:** Lowest cost (\$10–\$20/mo), simple local-like environment.
- **Cons:** Shared failure domain (disk full or memory spike kills Postgres), manual database maintenance, high operational burden for backups, high risk of data loss during host crash.
- **Score:** 31 / 50.

### Option B — Linux VPS / Container Host + Managed PostgreSQL (Recommended)
- **Topology:** Lightweight VPS / container host (running Caddy reverse proxy, Web container, and API container) paired with a **Managed PostgreSQL 16 Database** (e.g., AWS Lightsail / RDS in São Paulo `sa-east-1` or Vultr São Paulo).
- **Pros:** 
  - Complete compute-database isolation.
  - Automated managed daily snapshots and point-in-time recovery.
  - Database is not publicly accessible (VPC peering / private network).
  - Web and API run as non-root standard Docker containers.
  - Native Brazil (São Paulo) data residency and sub-20ms latency.
  - Modest cost (\$35–\$50/mo).
- **Cons:** Slightly higher recurring cost than a bare single VPS.
- **Score:** 45 / 50.

### Option C — Fully Managed PaaS (Railway / Render + Managed Database)
- **Topology:** Web and API hosted on PaaS (Railway or Render), with managed Postgres.
- **Pros:** Git push deployments, automatic preview environments.
- **Cons:** Neither Render nor Railway offers a native Brazil (São Paulo) datacenter region (only US, Frankfurt, Singapore), causing 120–160ms latency for Brazilian investors; platform workspace fees (\$20–\$25/mo) in addition to compute and database resource costs.
- **Score:** 34 / 50.

### Option D — Local Machine with Secure Tunnel (Cloudflare Tunnel)
- **Topology:** Self-hosted on developer/owner laptop with Cloudflare Tunnel.
- **Pros:** Zero hosting cost.
- **Cons:** Unacceptable availability, residential power/ISP failure domain, severe physical security risk for financial data.
- **Score:** 16 / 50 (Rejected).

---

## 4. Decision: Selection of Option B

**Project Atlas selects Option B: Linux VPS / Container Host with Managed PostgreSQL 16 in the São Paulo (`sa-east-1`) Region.**

```text
                                Internet (HTTPS :443)
                                          │
                                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Host: Ubuntu Linux VPS (São Paulo / sa-east-1)                        │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Caddy Reverse Proxy (Auto-TLS / Let's Encrypt / Rate Limiting)   │  │
│  └───────────────────┬──────────────────────────┬───────────────────┘  │
│                      │ :3000                    │ :3001                │
│                      ▼                          ▼                      │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐  │
│  │ Web Container (Next.js 15)    │  │ API Container (NestJS)        │  │
│  │ - Standalone Node.js 22       │  │ - Node.js 22 Alpine           │  │
│  │ - Non-root 'node' user        │  │ - Non-root 'node' user        │  │
│  │ - Internal BFF: :3000         │  │ - Single Replica (Scheduler)  │  │
│  └───────────────┬───────────────┘  └───────────────┬───────────────┘  │
│                  │                                  │                  │
│                  └────────── Private Docker ────────┘                  │
│                              Network Bridge                            │
└─────────────────────────────────────┬──────────────────────────────────┘
                                      │
                      Private VPC Network (Port 5432)
                      SSL / TLS Enforced (sslmode=require)
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Managed PostgreSQL 16 (AWS Lightsail / sa-east-1 or equivalent)       │
│  - Automated daily snapshots (7-day retention)                         │
│  - Private network isolation (No public IP)                            │
│  - Storage: 40 GB NVMe SSD                                             │
│  - Append-only Ledger + 48 Canonical Migrations                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Architectural and Operational Specifications

### 5.1. Web Layer
- **Runtime:** Next.js 15 App Router running standalone (`node apps/web/server.js`) on Node 22 Alpine.
- **Port:** Exposed internally on port `3000`.
- **Security:** Security headers enforced (HSTS `max-age=63072000`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).
- **BFF & Cookies:** Refresh tokens stored in `HttpOnly`, `SameSite=Lax`, `Secure` cookies (`atlas_refresh`). In production, reverse proxy passes `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`.
- **Internal API Routing:** Server-side BFF requests route internally via `ATLAS_API_INTERNAL_URL="http://api:3001"` (or `http://127.0.0.1:3001`), eliminating hairpinned internet latency.

### 5.2. API Layer
- **Runtime:** NestJS on Node 22 Alpine (`node apps/api/dist/main.js`).
- **Instances / Replicas:** Exactly `1` replica for initial beta.
- **Scheduler:** Ingestion and integration schedulers run in-process (`node-cron`). A single replica ensures zero double-execution while retaining PostgreSQL advisory lock safety.
- **Port:** Exposed internally on port `3001`.
- **Probes:** `/health` (process liveness) and `/ready` (database connectivity + 48-migration verification).

### 5.3. Database Layer
- **Engine:** PostgreSQL 16 Managed Service.
- **Network Isolation:** Public networking disabled; accessible exclusively from the application host via private VPC IP or private security group.
- **SSL/TLS:** Enforced (`sslmode=require`).
- **Baseline Migrations:** Exactly 48 migrations applied via `pnpm --filter @atlas/database prisma migrate deploy`.

### 5.4. Stateless File Processing
- **Audited Invariant:** Project Atlas is 100% stateless on filesystem storage.
- File imports (B3 XLSX/CSV) are sent via HTTP body, parsed in-memory, converted to ledger entities, and stored in PostgreSQL.
- **No S3, GCS, or Object Storage is required for the external beta.**

### 5.5. Secrets Management
- All secrets are injected exclusively via environment variables at container launch.
- Required production secrets:
  - `DATABASE_URL` (with SSL mode)
  - `JWT_ACCESS_SECRET` (>= 32 random characters)
  - `REFRESH_TOKEN_PEPPER` (>= 32 random characters)
  - `PASSWORD_RESET_PEPPER` (>= 32 random characters)
  - `ALLOWED_ORIGINS` (Canonical HTTPS domain)
- Prohibited: Secrets in Git, secrets in container images, secrets in client bundles.

### 5.6. Feature Flags for Beta
- `TAX_COST_EVIDENCE_ENRICHMENT_ENABLED`: **`false`** by default for initial beta launch.
  - *Rationale:* Since `FIRST_REAL_EVIDENCE_BACKED_DISPOSAL_NOT_YET_OBSERVED` remains active, tax cost evidence enrichment must remain disabled by default to prevent DARF divergence until a real disposal with verified documentary cost is observed and audited.
- `ALLOW_PUBLIC_REGISTRATION`: **`false`** (Invite-only beta via owner-created accounts).
- `INTEGRATION_SCHEDULER_ENABLED`: **`false`** (Real B3 sync is externally blocked; manual import fallback only).

### 5.7. Observability & Telemetry
- Structured JSON logging to stdout/stderr via `@atlas/logger` with automatic redaction of `SENSITIVE_KEYS`.
- Invariant request tracing via `x-request-id`.
- External third-party telemetry (Sentry/Datadog) is **`RECOMMENDED_AFTER_BETA_START`** to avoid compliance leakage before legal policy execution.

---

## 6. Disaster Recovery & Rollback

| Event | Recovery Target (RTO) | Data Loss Limit (RPO) | Recovery Procedure |
| :--- | :--- | :--- | :--- |
| **Compute Host Crash** | < 30 minutes | 0 minutes | Re-provision Linux VPS, deploy immutable Docker images, point to existing managed PostgreSQL. |
| **Database Corruption** | < 1 hour | < 24 hours (or point-in-time) | Restore managed database snapshot from automated daily backup. |
| **Defective App Deploy** | < 5 minutes | 0 minutes | Revert Docker image tag to previous validated Git SHA. |
| **Migration Failure** | < 15 minutes | 0 minutes | Halt deployment; execute forward-fix migration or snapshot restore. |

---

## 7. Cost Model (Monthly Estimate)

| Component | Specification | Estimated Monthly Cost (USD) |
| :--- | :--- | :--- |
| **App Compute VPS** | 2 vCPU, 2 GB RAM, 60 GB SSD (São Paulo) | \$20.00 |
| **Managed PostgreSQL** | 1 vCPU, 1 GB RAM, 40 GB NVMe SSD (São Paulo) | \$15.00 |
| **Domain & DNS** | Existing registered domain (`.com.br`) | ~\$3.50 (amortized) |
| **Backups & Egress** | Managed snapshots included (up to 40 GB) | \$0.00 – \$2.00 |
| **Total Estimated Cost**| | **\$38.50 – \$40.50 / month** |

---

## 8. Legal and Operational Boundaries

- **`DEPLOYMENT_ENGINEERING_READY`:** Architecture, security, type safety, deterministic replay, and disaster recovery meet all technical standards for deployment.
- **`PUBLIC_LAUNCH_AUTHORIZED`:** **PENDING**. Legal counsel must approve Terms of Service, Privacy Policy, and tax disclaimer statements prior to admitting public users.
- **B3 Sync:** **EXTERNALLY BLOCKED**. Direct B3 automation is replaced by the verified manual Excel import parser.

---

## 9. References

- [ADR-001 — Domain-Driven Architecture](file:///c:/Projetos/atlas-invest/docs/decisions/ADR-001-architecture-style.md)
- [ADR-038 — Transaction Ledger Determinism](file:///c:/Projetos/atlas-invest/docs/decisions/ADR-038-transaction-ledger.md)
- [ADR-289 — Tax Compliance Period Close](file:///c:/Projetos/atlas-invest/docs/decisions/ADR-289-tax-compliance-period-close.md)
- [Reliability & Observability Baseline](file:///c:/Projetos/atlas-invest/docs/engineering/reliability-observability-baseline.md)
