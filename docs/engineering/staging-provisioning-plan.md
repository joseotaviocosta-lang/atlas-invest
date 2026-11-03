# Project Atlas — Staging Infrastructure Provisioning Plan
## Staging Environment Architecture, Bill of Materials, Network, Security, and Provisioning Readiness Gate

**Document Version:** 1.0.0  
**Date:** 2026-11-03  
**Status:** PROVISIONING READINESS GATE (NO CLOUD CREATION YET)  
**Target Environment:** Staging (`staging.atlasinvest.com.br` / `sa-east-1`)  
**Parent Architecture:** [ADR-290 — External Beta Deployment Architecture and Operational Boundaries](../decisions/ADR-290-external-beta-deployment-architecture-and-operational-boundaries.md)  
**Execution Runbook:** [External Beta Deployment Runbook](external-beta-deployment-runbook.md)  

---

## 1. Executive Summary & Purpose

This document establishes the concrete infrastructure provisioning plan for the **Project Atlas Staging Environment**. It operationalizes the architectural decisions codified in [ADR-290](../decisions/ADR-290-external-beta-deployment-architecture-and-operational-boundaries.md) (Option B: Linux VPS + Managed PostgreSQL 16 in São Paulo `sa-east-1`), specifying the exact cloud provider, service tiers, current pricing verification, resource bill of materials, network topology, secret management, DNS plan, and smoke validation matrix.

**Primary Invariant:** Zero cloud resources, user accounts, DNS records, or billing commitments are created in this phase. Provisioning is strictly gated by explicit Owner cost and execution authorization.

---

## 2. Provider Options Verification & Current Pricing Analysis (Parts A, B & AT)

*Verification Date:* **2026-11-03**  
*Official Sources:* AWS Lightsail Pricing (`aws.amazon.com/lightsail/pricing/`), AWS RDS PostgreSQL Pricing (`aws.amazon.com/rds/postgresql/pricing/`), Vultr Global Pricing & Managed Databases (`vultr.com/pricing/`), DigitalOcean Datacenter Footprint (`digitalocean.com/docs/platform/regions/`).

### 2.1. Candidate Evaluation Matrix

| Provider | Brazil Region (`sa-east-1` / São Paulo) | Managed PostgreSQL 16 Tier & Monthly Cost | Linux Compute Tier & Monthly Cost | Private DB Isolation | Staging Monthly Total (USD) | Evaluation Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Amazon Lightsail** | **YES (`sa-east-1`)** | **Standard Plan** (1 vCPU, 1 GB RAM, 40 GB SSD): **$15.00/mo** | **Standard Plan** (1 vCPU, 2 GB RAM, 60 GB SSD): **$10.00/mo** | **Native Private Mode** (no public IP, internal AWS backbone) | **$25.00 / mo** | **SELECTED (Superior Simplicity & Cost)** |
| **AWS EC2 + AWS RDS** | **YES (`sa-east-1`)** | `db.t4g.micro` (1 GB RAM): ~$24.82/mo + gp3 20GB: ~$3.50/mo = **$28.32/mo** | `t4g.small` (2 GB RAM): ~$17.50/mo + gp3 20GB: ~$2.76/mo + IPv4: ~$3.65/mo = **$23.91/mo** | Security Groups inside VPC (NAT Gateway ~$35/mo if fully private) | **$52.23 – $87.00 / mo** | **REJECTED (Excessive complexity and cost for staging)** |
| **Vultr** | **YES (São Paulo)** | **No entry tier**; lowest available is 4 GB RAM / 1 vCPU / 30 GB NVMe: **$90.00/mo** | 1 vCPU, 2 GB RAM: **$12.00/mo** | VPC 2.0 private network | **$102.00 / mo** | **REJECTED (Database tier prohibitively expensive for staging)** |
| **DigitalOcean** | **NO** (Only US, CA, EU, APAC) | N/A | N/A | N/A | N/A | **REJECTED (Fails Brazil data residency requirement)** |
| **Render / Railway** | **NO** (Only US, EU, APAC) | N/A | N/A | N/A | N/A | **REJECTED (Fails Brazil latency & data residency requirements)** |

### 2.2. Brazil Region Requirement Verification (Part B)
Amazon Lightsail natively operates in **South America (São Paulo) — `sa-east-1`**:
- **Compute:** Standard Linux instances deployed directly in São Paulo AZs.
- **Managed PostgreSQL:** Native PostgreSQL 16 support in `sa-east-1`.
- **Private Networking:** Internal network routing between Lightsail compute and managed databases within `sa-east-1` is free, sub-millisecond, and fully private.
- **Automated Snapshots:** Regional EBS-backed snapshots stored within the São Paulo region.

---

## 3. Provider Scorecard (Part E)

Each candidate scored on a 1–5 scale across 10 engineering and operational dimensions:

| Dimension (Weight) | AWS Lightsail (`sa-east-1`) | AWS EC2 + RDS (`sa-east-1`) | Vultr (São Paulo) | DigitalOcean | Render / Railway |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Brazil Region (`sa-east-1`)** | 5 | 5 | 5 | 1 | 1 |
| **Managed PostgreSQL Quality** | 5 | 5 | 4 | 1 | 1 |
| **Private Networking Isolation** | 5 | 5 | 4 | 1 | 1 |
| **Automated Backups & PITR** | 5 | 5 | 4 | 1 | 1 |
| **Cost Predictability for Staging**| 5 | 3 | 2 | 3 | 3 |
| **Operational Simplicity** | 5 | 2 | 4 | 4 | 4 |
| **Docker & Compose Compatibility**| 5 | 5 | 5 | 5 | 5 |
| **Snapshot & Restore Drill** | 5 | 5 | 4 | 3 | 3 |
| **Native Monitoring & Alarms** | 4 | 5 | 3 | 3 | 3 |
| **Vendor Portability / Lock-in** | 5 | 4 | 5 | 5 | 3 |
| **TOTAL SCORE (out of 50)** | **49 / 50** | **44 / 50** | **36 / 50** | **23 / 50** | **22 / 50** |

---

## 4. Selection of Concrete Staging Provider (Part F)

```text
STAGING_PROVIDER_SELECTED = "Amazon Lightsail (sa-east-1 / São Paulo)"
```

**Justification:** Amazon Lightsail provides an optimal combination of local Brazilian hosting (`sa-east-1`), fully managed PostgreSQL 16 with native one-click Private Mode, automated 7-day daily backups, fixed predictable billing ($25.00/month), zero complex VPC/NAT Gateway maintenance, and standard Ubuntu Linux compute with complete Docker Compose portability.

---

## 5. Concrete Staging Profile & Capacity Sizing (Parts C & D)

Staging is designed to validate end-to-end releases, database migrations (0→48), authentication lifecycles, and synthetic financial imports without over-provisioning:

| Dimension | Production Beta Profile (Target) | Staging Profile (Approved) | Rationale |
| :--- | :--- | :--- | :--- |
| **Compute vCPU** | 2 vCPU | **1 vCPU** | Sufficient for single-operator test workflows and background tasks. |
| **Compute RAM** | 2 GB to 4 GB | **2 GB** | Comfortably runs Caddy (~50MB), Next.js 15 Standalone (~250MB), NestJS API (~350MB), and OS (~300MB) without memory pressure. |
| **Compute SSD** | 60 GB to 80 GB | **60 GB** | Accommodates base OS, Docker image layers (Web 328MB, API 371MB), and rotated log files. |
| **PostgreSQL Tier** | 1 vCPU, 1–2 GB RAM | **1 vCPU, 1 GB RAM** | Baseline managed tier. Synthetic fixtures occupy < 5MB; Prisma pool fits comfortably. |
| **PostgreSQL Storage** | 40 GB NVMe SSD | **40 GB SSD** | Minimum standard tier storage; provides >99% free space. |
| **Database Network** | Private VPC (0 public IP) | **Private Mode (0 public IP)** | Non-negotiable security invariant. |
| **Public IPv4** | 1 static IP for compute | **1 static IP for compute** | Included at no additional cost while attached to active instance. |
| **Data Scope** | Small cohort of real data | **100% Synthetic fixtures only** | Zero real portfolios, statements, or investor PII. |

---

## 6. Staging Bill of Materials (BOM) (Part AU)

| # | Resource Description | Provider Service | Region | Specification / Tier | Qty | Monthly Cost (USD) | Public IP? | Persistence | Backup Policy |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | **Staging App Host** | Amazon Lightsail Instance | `sa-east-1` (São Paulo) | Ubuntu 24.04 LTS, 1 vCPU, 2 GB RAM, 60 GB SSD | 1 | $10.00 | Yes (Static IPv4) | Persistent | Manual pre-deploy snapshot |
| 2 | **Staging Managed DB** | Amazon Lightsail Database | `sa-east-1` (São Paulo) | PostgreSQL 16 Standard (1 vCPU, 1 GB RAM, 40 GB SSD) | 1 | $15.00 | **NO (Private)** | Persistent | Automated daily snapshot (7-day retention) |
| 3 | **Static IPv4 Address** | Amazon Lightsail Static IP | `sa-east-1` (São Paulo) | Regional Static IPv4 attached to compute | 1 | $0.00 | Yes | Persistent | N/A |
| 4 | **Outbound Data Transfer**| Lightsail Bandwidth Allowance| `sa-east-1` (São Paulo) | 3 TB included monthly allowance | 1 | $0.00 | N/A | Ephemeral | N/A |
| 5 | **Internal Traffic** | AWS Internal Network | `sa-east-1` (São Paulo) | Compute ↔ DB communication within `sa-east-1` | 1 | $0.00 | No | N/A | N/A |
| 6 | **Snapshot Storage** | Lightsail Snapshot Storage | `sa-east-1` (São Paulo) | Daily snapshots within standard storage allowance | 1 | $0.00 – $1.00| No | Retained 7d | Managed retention |
| **TOTAL** | | | | | | **$25.00 / mo** | | | |

---

## 7. Resource Naming Conventions (Part H)

All staging resources follow the canonical naming pattern to prevent environment confusion:

- **Compute Instance:** `atlas-staging-app`
- **Static IPv4:** `atlas-staging-app-ip`
- **Managed Database:** `atlas-staging-db`
- **Firewall Rule Group:** `atlas-staging-firewall`
- **Database Snapshot Prefix:** `atlas-staging-db-snap-YYYYMMDD-HHMM`
- **Local Application Network:** `atlas_network` (Docker bridge)
- **Container Names:** `atlas_caddy`, `atlas_web`, `atlas_api`

---

## 8. Network Topology & Ingress / Egress Architecture (Parts J, K & U)

```text
                                  Internet
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           │                                                   │
      Port 80/tcp (HTTP)                                  Port 443/tcp (HTTPS)
      Port 22/tcp (Restricted SSH by Owner CIDR)               │
           │                                                   │
           ▼                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Host: atlas-staging-app (Amazon Lightsail VPS — sa-east-1)                      │
│  Static IP: atlas-staging-app-ip                                                 │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ Caddy 2 Reverse Proxy (Docker Host / Ports 80 & 443)                       │  │
│  │ - TLS Auto-Termination (Let's Encrypt / ZeroSSL)                           │  │
│  │ - HSTS (max-age=63072000), X-Frame-Options: DENY, X-Content-Type: nosniff   │  │
│  │ - 25MB Body Limit for B3 Excel/CSV Import                                  │  │
│  └──────────────────────┬───────────────────────────────┬─────────────────────┘  │
│                         │                               │                        │
│     staging.atlasinvest.com.br             staging-api.atlasinvest.com.br        │
│     (Reverse Proxy to :3000)                (Reverse Proxy to :3001)             │
│                         │                               │                        │
│                         ▼                               ▼                        │
│  ┌──────────────────────────────┐              ┌──────────────────────────────┐  │
│  │ Web Container (Next.js 15)   │              │ API Container (NestJS)       │  │
│  │ - Standalone Node 22 Alpine  │              │ - Node 22 Alpine             │  │
│  │ - Internal Port: 3000        │              │ - Internal Port: 3001        │  │
│  │ - BFF calls internal API ────┼─────────────►│ - Single Replica (Scheduler) │  │
│  └──────────────────────────────┘              └──────────────┬───────────────┘  │
│                                                               │                  │
│  Docker Bridge Network (atlas_network)                        │                  │
└───────────────────────────────────────────────────────────────┼──────────────────┘
                                                                │
                                   Private AWS Backbone Network │ (No Public IP)
                                   SSL Enforced (sslmode=require)│ Port 5432
                                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Managed PostgreSQL 16: atlas-staging-db (Amazon Lightsail — sa-east-1)          │
│  - Endpoint: atlas-staging-db.xxxxxx.sa-east-1.rds.amazonaws.com                 │
│  - Mode: PRIVATE ONLY (Rejects all external internet connections)                │
│  - Database: atlas_staging                                                       │
│  - Baseline Migrations: 48/48 Applied                                            │
│  - Automated Daily Backups (7-day retention)                                     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Ingress Firewall Configuration:
- `80/tcp`: Allowed to World (0.0.0.0/0) — Required for Let's Encrypt HTTP-01 challenge and redirect to HTTPS.
- `443/tcp`: Allowed to World (0.0.0.0/0) — Secure HTTPS traffic for Web and API.
- `22/tcp`: Restricted strictly to Owner's management IP address (`<OWNER_MANAGEMENT_IP>/32`).
- **Blocked from Public Ingress:** Port `3000` (Web internal), Port `3001` (API internal), Port `5432` (PostgreSQL).

---

## 9. Database Settings & Connection Limits (Parts L & M)

- **Engine:** PostgreSQL 16.x
- **Database Name:** `atlas_staging`
- **Default Schema:** `public`
- **Master Username:** Placeholder (e.g., `atlas_staging_admin` — generated at provisioning)
- **Master Password:** Placeholder (Cryptographically random >= 32 characters, generated at provisioning)
- **SSL Enforcement:** Mandated (`sslmode=require`)
- **Connection String Specification:**
  ```text
  DATABASE_URL="postgresql://<USER>:<PASSWORD>@<PRIVATE_ENDPOINT>:5432/atlas_staging?schema=public&sslmode=require"
  ```
- **Prisma Connection Pooling Sizing:**
  - Lightsail 1 GB Managed Database connection ceiling: ~50 concurrent connections.
  - API replica count: Exactly `1` replica.
  - Configured Prisma pool limit: `connection_limit=10`.
  - Max expected staging connection load: 10 connections. Headroom: >80%. Zero connection exhaustion risk.

---

## 10. DNS Plan & Domain Ownership Status (Parts I & AN)

### Canonical Staging Domains:
- **Web Application:** `staging.atlasinvest.com.br`
- **Backend API:** `staging-api.atlasinvest.com.br`

### Domain Ownership Verification (Part AN):
- **Verification Status:** **`DOMAIN_OWNERSHIP_UNVERIFIED`**
- *Finding:* The repository documents `atlasinvest.com.br` as the target domain (e.g., in `.env.production.example`, `deploy/Caddyfile`, and `docs/operations/owner-action-checklist.md`). However, registration and DNS delegation at Registro.br have not yet been executed by the Owner.
- *Operational Gate:* Provider selection and resource planning proceed independently. DNS record publication is deferred until the Owner confirms domain registration.

### Planned DNS Records (Once Domain is Registered):
| Hostname | Record Type | TTL | Target Value | Description |
| :--- | :---: | :---: | :--- | :--- |
| `staging.atlasinvest.com.br` | `A` | 300 | `<atlas-staging-app-ip>` | Staging Web client routing |
| `staging-api.atlasinvest.com.br` | `A` | 300 | `<atlas-staging-app-ip>` | Staging API client & webhook routing |

---

## 11. Secrets Inventory & Generation Procedure (Parts N & O)

### 11.1. Secrets Inventory
All secrets are classified into Host Runtime Secrets and CI Deployment Secrets. **No secret values are ever committed to Git.**

| Secret Variable Name | Classification | Injected Where | Purpose & Format Requirements |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Runtime Secret | Host (`.env.staging`) | Private connection string with user, password, and `sslmode=require`. |
| `JWT_ACCESS_SECRET` | Runtime Secret | Host (`.env.staging`) | Access token signing key. **Must be >= 32 characters**, cryptographically random. |
| `REFRESH_TOKEN_PEPPER` | Runtime Secret | Host (`.env.staging`) | Server pepper for hashing opaque refresh tokens. **Must be >= 32 characters**. |
| `PASSWORD_RESET_PEPPER`| Runtime Secret | Host (`.env.staging`) | Server pepper for password reset tokens. **Must be >= 32 characters**. |
| `ALLOWED_ORIGINS` | Runtime Secret | Host (`.env.staging`) | Set to canonical Web domain: `"https://staging.atlasinvest.com.br"`. |
| `STAGING_HOST` | CI Secret | GitHub Actions Secrets | Public IPv4 address (`<atlas-staging-app-ip>`) of the staging host. |
| `STAGING_SSH_USER` | CI Secret | GitHub Actions Secrets | Dedicated deploy user (`ubuntu` or `deploy`). |
| `STAGING_SSH_KEY` | CI Secret | GitHub Actions Secrets | Private Ed25519 SSH deploy key with command-restricted sudo access. |
| `CR_PAT` | Host Secret | Host runtime (one-time) | Ephemeral GitHub Personal Access Token (`read:packages`) for pulling GHCR images. |

### 11.2. Cryptographic Secret Generation Procedure (Part O)
During future provisioning, runtime secrets must be generated locally or on the host using cryptographically secure random bytes:

```bash
# Generate high-entropy secrets (32 bytes = 64 hex characters):
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
REFRESH_TOKEN_PEPPER=$(openssl rand -hex 32)
PASSWORD_RESET_PEPPER=$(openssl rand -hex 32)
STAGING_DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
```

---

## 12. Feature Flags & Operational Invariants (Parts P, Q, R & AD)

| Feature Flag | Staging Setting | Enforcement & Invariant |
| :--- | :---: | :--- |
| `ALLOW_PUBLIC_REGISTRATION` | **`false`** | Public registration is disabled. Staging test users are provisioned via controlled CLI seed. |
| `TAX_COST_EVIDENCE_ENRICHMENT_ENABLED` | **`false`** | Enforces ADR-290 invariant: documentary cost enrichment remains disabled until first real disposal is validated. |
| `INTEGRATION_SCHEDULER_ENABLED` | **`false`** | Ingestion scheduler remains dormant; prevents unnecessary external polling and advisory lock races. |
| **B3 Integration Policy** (Part Q) | **Manual File Upload Only** | Zero OAuth, mTLS, or B3 certificates required. Synthetic B3 XLSX and CSV test fixtures only. |
| **Data Policy** (Part R) | **Synthetic Data Only** | **STRICT PROHIBITION** on real personal portfolios, bank statements, or investor CPF data. |
| **KCRE11 / CTE Policy** (Part AD) | **Synthetic Fixtures Only** | Owner's real KCRE11 rows and transaction data are not replicated on staging. Synthetic test rows are used. |

---

## 13. System Administration & Docker Baseline (Parts S, T, V & AI)

### 13.1. Operator & Admin Access (Part T)
- **Operating System:** Ubuntu 24.04 LTS (Noble Numbat).
- **Authentication:** Ed25519 SSH Key authentication strictly required.
- **Hardening:**
  - Password authentication disabled in `/etc/ssh/sshd_config` (`PasswordAuthentication no`).
  - Direct root login disabled (`PermitRootLogin no`).
  - Dedicated sudo user `ubuntu`.
  - SSH port 22 access restricted by Lightsail firewall to Owner IP.

### 13.2. Initial Staging Account Bootstrap (Part S)
With `ALLOW_PUBLIC_REGISTRATION="false"`, the initial test user is created without security bypass using a controlled CLI bootstrap command executed directly on the host inside the API container:

```bash
docker compose exec api node dist/scripts/seed-staging-user.js --email="qa@atlasinvest.com.br" --name="QA User"
```

### 13.3. Docker Host Baseline (Part V)
Installed via official Docker APT repository:
- Docker Engine 27.x+
- Docker Compose Plugin v2.29+
- Containers executed as non-root users (`USER node`).

### 13.4. Log Rotation Policy (Part AI)
Configured uniformly in `compose.prod.yml`:
- Logging driver: `json-file`
- Options: `max-size: "20m"`, `max-file: "5"`.
- Log inspection: `docker compose logs -f --tail=100 api | grep "x-request-id"`.

---

## 14. Container Registry & Deployment Pipeline (Parts W, X, Y & Z)

- **Container Registry:** GitHub Container Registry (GHCR):
  - `ghcr.io/<owner>/atlas-web:<git-sha>`
  - `ghcr.io/<owner>/atlas-api:<git-sha>`
- **Deployment Vehicle:** GitHub Actions workflow triggered via manual dispatch (`workflow_dispatch`) with environment `staging`.
- **Authentication:** SSH deploy action using private SSH key; pulls private images from GHCR via scoped `CR_PAT` with `read:packages`.

---

## 15. Initial Staging Provisioning Sequence (Part AA)

When authorized, staging provisioning will execute in the following exact sequence:

1. **Owner Authorization:** Confirm explicit Owner approval of provider, monthly cost, and scope.
2. **Provider Account Preparation:** Log into AWS Console; verify `sa-east-1` (São Paulo) region is active.
3. **Managed Database Provisioning:** Launch `atlas-staging-db` (PostgreSQL 16, 1 GB RAM, 40 GB SSD) in Private Mode.
4. **Compute Instance Provisioning:** Launch `atlas-staging-app` (Ubuntu 24.04 LTS, 1 vCPU, 2 GB RAM, 60 GB SSD) in `sa-east-1`.
5. **Static IP Allocation:** Create `atlas-staging-app-ip` and attach it to `atlas-staging-app`.
6. **Firewall Hardening:** In Lightsail console, configure firewall: allow 80/tcp, 443/tcp, and restrict 22/tcp to Owner IP.
7. **OS & Docker Setup:** Connect via SSH; apply OS security updates; install official Docker Engine & Compose plugin.
8. **Runtime Secrets Configuration:** Create `/opt/atlas/.env.staging` on the host using cryptographically generated keys.
9. **GHCR Registry Login:** Execute `docker login ghcr.io` on the host using scoped `read:packages` token.
10. **Application Assets Transfer:** Deploy `compose.prod.yml` and `deploy/Caddyfile` to `/opt/atlas/`.
11. **DNS Record Verification:** Configure DNS `A` records pointing `staging.atlasinvest.com.br` and `staging-api.atlasinvest.com.br` to the static IP (once domain is active).
12. **Caddy Validation:** Start Caddy to verify automatic TLS certificate issuance via ACME.
13. **First Database Migration (0→48):** Execute `pnpm --filter @atlas/database exec prisma migrate deploy` against `atlas-staging-db`.
14. **Migration Status Verification:** Confirm `prisma migrate status` returns exactly 48 migrations applied, schema up to date.
15. **API Container Startup:** Launch `atlas_api` container; verify logs for successful database connectivity.
16. **Liveness & Readiness Probes:** Execute `curl -f http://localhost:3001/health` and `curl -f http://localhost:3001/ready`.
17. **Web Container Startup:** Launch `atlas_web` container; verify health check at `http://localhost:3000/login`.
18. **Synthetic User Bootstrap:** Seed initial staging QA user via CLI script.
19. **Smoke Suite Execution:** Run staging smoke test matrix (login, synthetic B3 import, portfolio replay, tax view).
20. **Baseline Backup Snapshot:** Take an on-demand baseline database snapshot `atlas-staging-db-snap-initial`.

---

## 16. First Migration Baseline (0 → 48) (Part AB)

The staging database starts completely empty. Running migration:
```bash
docker compose run --rm api pnpm --filter @atlas/database exec prisma migrate deploy
```
Must apply all 48 canonical migrations sequentially:
- Starting count: `0`
- Target count: `48`
- Drift tolerance: `0`
- Verification: `prisma migrate status` must output `"Database schema is up to date!"`.

---

## 17. Staging Smoke Test Matrix (Part AC)

| Step | Action / Endpoint | Method | Expected Output / Status | Critical Invariant Tested |
| :--- | :--- | :---: | :--- | :--- |
| **SMOKE-01** | `https://staging-api.atlasinvest.com.br/health` | GET | `{"status":"ok"}` (200) | Process liveness |
| **SMOKE-02** | `https://staging-api.atlasinvest.com.br/ready` | GET | `{"status":"ready","database":"connected","migrations":48}` (200) | Database connectivity + 48 migrations |
| **SMOKE-03** | `https://staging.atlasinvest.com.br/login` | GET | HTTP 200, renders login form | Caddy routing + Web container rendering |
| **SMOKE-04** | User Authentication | POST | Returns Access Token + `atlas_refresh` HttpOnly cookie | Argon2id verification + session persistence |
| **SMOKE-05** | Token Rotation & Refresh | POST | New Access Token issued, session updated | Single-flight refresh token rotation |
| **SMOKE-06** | User Logout | POST | Session revoked in database, cookie cleared | Active session revocation |
| **SMOKE-07** | Synthetic B3 Excel Import | POST | Preview succeeds, ledger rows persisted append-only | In-memory spreadsheet parser |
| **SMOKE-08** | Portfolio Replay | GET | Derived positions calculated deterministically | Portfolio Engine zero-float replay |
| **SMOKE-09** | Tax Intelligence View | GET | CTI status renders without infinite loading | CTI v1 pipeline stability |
| **SMOKE-10** | Registration Lockout | POST | HTTP 403 `AUTH.REGISTRATION_DISABLED` | Public registration enforcement |

---

## 18. Backup Policy & Disaster Recovery Drill (Parts AE & AF)

### 18.1. Backup Policy (Part AE)
- **Automatic Daily Backups:** Managed daily snapshots taken during the low-traffic window (03:00 UTC), retained for **7 days**.
- **Pre-Deploy Snapshot:** Mandatory on-demand snapshot taken prior to any deployment or migration.

### 18.2. Recovery Drill Design (Part AF)
Prior to declaring staging fully verified, the operator executes a non-destructive recovery drill:
1. Trigger snapshot: `aws lightsail create-relational-database-snapshot --relational-database-name atlas-staging-db --relational-database-snapshot-name drill-snap-01 --region sa-east-1`.
2. Restore snapshot to temporary database: `aws lightsail create-relational-database-from-snapshot --relational-database-name atlas-drill-db --relational-database-snapshot-name drill-snap-01 --region sa-east-1`.
3. Point test container to `atlas-drill-db`; verify `prisma migrate status` (48/48) and run `/ready` check.
4. Tear down temporary drill database: `aws lightsail delete-relational-database --relational-database-name atlas-drill-db --skip-final-snapshot --region sa-east-1`.
5. Document drill outcome in operational audit log.

---

## 19. Financial Sizing & Owner Cost Authorization (Parts AJ, AK, AL, AM & AR)

### 19.1. Staging Monthly Cost Breakdown (Part AJ)
*Exchange Rate Reference (Early November 2026):* **USD 1.00 ≈ BRL 5.44**

| Cost Item | Specification | Expected Monthly (USD) | Expected Monthly (BRL) | Worst-Case Bound (USD) | Worst-Case Bound (BRL) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Compute VPS** | Lightsail 1 vCPU, 2 GB RAM | $10.00 | R$ 54.40 | $10.00 | R$ 54.40 |
| **Managed DB** | Lightsail PostgreSQL 16 (1 GB RAM) | $15.00 | R$ 81.60 | $15.00 | R$ 81.60 |
| **Static IPv4** | Attached to active compute | $0.00 | R$ 0.00 | $0.00 | R$ 0.00 |
| **Egress Bandwidth** | Up to 3 TB allowance | $0.00 | R$ 0.00 | $2.00 | R$ 10.88 |
| **Snapshot Storage** | Excess snapshot delta (>40 GB) | $0.00 | R$ 0.00 | $3.00 | R$ 16.32 |
| **TOTAL** | | **$25.00 / month** | **R$ 136.00 / month** | **$30.00 / month** | **R$ 163.20 / month** |

### 19.2. Staging vs. Beta Cost Delta (Part AK)
- **Staging Monthly:** **$25.00 / mo** (~R$ 136.00)
- **External Beta Monthly:** **$38.50 – $40.50 / mo** (~R$ 209.44 – R$ 220.32)
- **Lifecycle Optimization (Part AL):** Staging compute and database can be stopped or destroyed during extended periods of development dormancy to reduce monthly spend to zero, retaining only database snapshot backups ($0.05/GB/mo ≈ $0.20/mo).

### 19.3. Billing Alarm Threshold (Part AR)
An AWS Billing Alarm will be configured in AWS CloudWatch / Billing:
- **Threshold:** **$35.00 / month** (Alerts the Owner via email if unexpected data transfer or snapshot retention causes spend to exceed 140% of baseline).

---

## 20. Security Checklist (Part AP)

- [ ] **Private Database:** Database operates in Private Mode; zero public IP address assigned.
- [ ] **Transport Encryption:** TLS 1.3 enforced by Caddy with automatic renewal; database connections require SSL (`sslmode=require`).
- [ ] **Cookie Security:** Refresh tokens stored in `HttpOnly`, `SameSite=Lax`, `Secure` cookies.
- [ ] **Origin Restriction:** `ALLOWED_ORIGINS` strictly restricted to `"https://staging.atlasinvest.com.br"`.
- [ ] **Registration Disabled:** `ALLOW_PUBLIC_REGISTRATION="false"` actively enforced.
- [ ] **Zero Real Data:** Database seeded strictly with synthetic test fixtures.
- [ ] **Container Isolation:** Web and API containers run as non-root user `node`.
- [ ] **Network Segmentation:** Database port `5432` and internal ports `3000`/`3001` closed to the internet.
- [ ] **SSH Hardening:** Key-based authentication only, password authentication disabled, port 22 restricted to Owner IP.
- [ ] **Repository Hygiene:** Zero secrets or credentials committed to Git.
- [ ] **Provider MFA:** AWS root and IAM administrator accounts secured with multi-factor authentication (TOTP/FIDO2).

---

## 21. Provider CLI Provisioning Commands (Informational Only — NO EXECUTION YET) (Part AV)

```bash
# ============================================================================
# AWS CLI COMMAND TEMPLATES (DO NOT EXECUTE IN THIS PHASE)
# ============================================================================

# 1. Create Staging Managed PostgreSQL 16 Database in sa-east-1
# aws lightsail create-relational-database \
#   --relational-database-name atlas-staging-db \
#   --relational-database-blueprint-id postgres_16 \
#   --relational-database-bundle-id micro_1_0 \
#   --master-database-name atlas_staging \
#   --master-username atlas_admin \
#   --master-user-password "<GENERATED_PASSWORD>" \
#   --preferred-backup-window "03:00-03:30" \
#   --preferred-maintenance-window "Sun:04:00-Sun:04:30" \
#   --region sa-east-1

# 2. Launch Staging Compute Instance
# aws lightsail create-instances \
#   --instance-names atlas-staging-app \
#   --availability-zone sa-east-1a \
#   --blueprint-id ubuntu_24_04 \
#   --bundle-id small_1_0 \
#   --region sa-east-1

# 3. Allocate and Attach Static IP
# aws lightsail allocate-static-ip --static-ip-name atlas-staging-app-ip --region sa-east-1
# aws lightsail attach-static-ip --static-ip-name atlas-staging-app-ip --instance-name atlas-staging-app --region sa-east-1
```

---

## 22. Owner Authorization Gate (Part AW)

```text
================================================================================
STAGING PROVISIONING AUTHORIZATION

Provider:                     Amazon Lightsail (AWS)
Region:                       South America (São Paulo) — sa-east-1
Selected Tiers:               Compute: 1 vCPU, 2 GB RAM ($10/mo)
                              Database: PostgreSQL 16 Standard 1 vCPU, 1 GB RAM ($15/mo)
Expected Monthly Cost:        $25.00 / month (~R$ 136.00 / month at USD 1 = BRL 5.44)
Maximum Upper Bound Cost:     $30.00 / month (~R$ 163.20 / month)
Billing Alert Setpoint:       $35.00 / month
Resources to Create:          1 × VPS, 1 × Managed DB, 1 × Static IP, 0 × Public DB IP
DNS Changes:                  staging.atlasinvest.com.br, staging-api.atlasinvest.com.br
Domain Ownership Status:      DOMAIN_OWNERSHIP_UNVERIFIED (Requires Owner domain check)
Git Push Required:            NO
Cloud Resource Creation:      NO (Deferred until explicit Owner authorization)
Real Data Upload:             NO (100% Synthetic fixtures only)
================================================================================

STATUS: AWAITING_EXPLICIT_OWNER_AUTHORIZATION
```
