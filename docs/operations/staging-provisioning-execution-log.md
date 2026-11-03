# Project Atlas — Staging Infrastructure Provisioning Execution Log

**Date:** 2026-11-03  
**Status:** PROVISIONING IN PROGRESS (MANUAL AWS CONSOLE EXECUTION)  
**Provider:** Amazon Lightsail (AWS)  
**Region:** South America (São Paulo) — `sa-east-1`  
**Cost Cap:** US$ 25 expected / US$ 30 maximum first-month authorization  
**Execution Method:** Manual AWS Console by Owner (Zero AWS credentials in repository/logs)  
**Data Policy:** 100% Synthetic Data Only (Zero real investor portfolios or PII)  

---

## 1. Owner Authorization Record

- **Status:** `APPROVED_FOR_STAGING_INFRASTRUCTURE_PROVISIONING`
- **Authorized Scope:**
  - 1 × Ubuntu 24.04 Lightsail instance, 2 GB RAM (`atlas-staging-app`)
  - 1 × Managed PostgreSQL 16 database, 1 GB RAM (`atlas-staging-db`, Private Mode)
  - 1 × Static IPv4 (`atlas-staging-app-ip`)
  - Private database networking & firewall hardening
  - Managed automated snapshots (7-day retention)
- **Gated / NOT Authorized:**
  - Production resources: NO
  - Public beta users: NO
  - Public registration: NO
  - Git push: NO (separately gated)
  - GHCR image publication: NO (separately gated)
  - DNS changes: NO (deferred until domain ownership verification and explicit authorization)
  - Real investor data: STRICTLY PROHIBITED

---

## 2. Infrastructure Checklist & Step-by-Step Execution

| Phase | Resource / Action | Configuration / Parameters | Status |
| :--- | :--- | :--- | :---: |
| **01** | **AWS Region Verification** | Ensure AWS Console is set to **São Paulo (`sa-east-1`)** | Awaiting Owner execution |
| **02** | **Billing Alert Verification** | CloudWatch Billing Alarm configured for **$35.00 – $40.00 / month** | Awaiting Owner execution |
| **03** | **Managed Database Provisioning** | Name: `atlas-staging-db`<br>Engine: PostgreSQL 16.x<br>Plan: Standard 1 GB RAM ($15/mo)<br>Database Name: `atlas_staging`<br>Master Username: `atlas_admin`<br>Public Accessibility: **DISABLED (Private Mode)** | Awaiting Owner execution |
| **04** | **Compute Instance Provisioning** | Name: `atlas-staging-app`<br>OS: Ubuntu 24.04 LTS<br>Plan: 1 vCPU, 2 GB RAM, 60 GB SSD ($10/mo)<br>Region: `sa-east-1` | Awaiting Owner execution |
| **05** | **Static IPv4 Allocation** | Name: `atlas-staging-app-ip`<br>Attached to: `atlas-staging-app` | Awaiting Owner execution |
| **06** | **Lightsail Firewall Hardening** | Ingress allowed:<br>- 80/tcp (HTTP)<br>- 443/tcp (HTTPS)<br>- 22/tcp (SSH - restricted to Owner IP)<br>Publicly blocked: 3000, 3001, 5432 | Awaiting Owner execution |
| **07** | **Host Baseline Hardening** | Connect via SSH (key only):<br>- Ubuntu package update<br>- Docker Engine 27.x+ install<br>- Docker Compose plugin install<br>- Directory `/opt/atlas` created | Pending compute availability |
| **08** | **Runtime Secrets on Host** | Generated on host via `openssl rand -hex 32`:<br>- Written to `/opt/atlas/.env.staging` (chmod 600)<br>- Zero secret leakage in repository | Pending compute availability |
| **09** | **Database Migration (0→48)** | Run `prisma migrate deploy` from staging host against `atlas-staging-db` | Pending DB availability |
| **10** | **Baseline Snapshot Capture** | Capture `atlas-staging-db-snap-initial` | Pending migration success |

---

## 3. Non-Sensitive Infrastructure Outputs Registry

*(To be populated by Owner after Console creation — NEVER record passwords or secret keys here)*

- **Compute Static IPv4 (`atlas-staging-app-ip`):** `[PENDING_OWNER_REPORT]`
- **Managed Database Private Endpoint (`atlas-staging-db`):** `[PENDING_OWNER_REPORT]`
- **Database Port:** `5432`
- **Database Name:** `atlas_staging`
- **Database SSL Mode:** `require`

