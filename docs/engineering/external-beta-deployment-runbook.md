# Project Atlas — External Beta Deployment Runbook

**Document Version:** 1.0.0  
**Status:** DRAFT / DESIGN ONLY (NO DEPLOY YET)  
**Target Environment:** External Beta (São Paulo / `sa-east-1`)  
**Architecture Reference:** [ADR-290](file:///c:/Projetos/atlas-invest/docs/decisions/ADR-290-external-beta-deployment-architecture-and-operational-boundaries.md)  

---

## 1. Overview & Operational Principles

This runbook defines the exact step-by-step procedure for deploying, verifying, maintaining, and recovering the **Project Atlas External Beta** environment.

### Core Operational Invariants:
1. **Never mutate migrations in production:** The 48-migration baseline is strictly immutable.
2. **Never deploy without a snapshot:** Take a managed database snapshot before applying any new deployment or migration.
3. **Zero float financial calculations:** Verify arithmetic precision standards remain active.
4. **Append-only ledger:** The database ledger cannot be updated or deleted; rollbacks use forward-fix or snapshot restore.
5. **Private database endpoint:** PostgreSQL must never be exposed to the public internet.

---

## 2. Environment Specifications Matrix

| Setting | Local Development | Staging (Pre-Deploy Gate) | External Beta (Production) |
| :--- | :--- | :--- | :--- |
| **Hosting Model** | Local Windows / Node 22 | Isolated VPS or Sub-stack | Linux VPS + Managed PostgreSQL |
| **Region** | Local Machine | São Paulo (`sa-east-1`) | São Paulo (`sa-east-1`) |
| **Web URL** | `http://localhost:3000` | `https://staging.atlasinvest.com.br` | `https://app.atlasinvest.com.br` |
| **API URL** | `http://localhost:3001` | `https://staging-api.atlasinvest.com.br` | `https://api.atlasinvest.com.br` |
| **Database** | Docker container (`:5434`) | Managed Postgres (Staging DB) | Managed Postgres 16 (`atlas_beta`) |
| **TLS / SSL** | None / Self-signed | Automatic Let's Encrypt (Caddy) | Automatic Let's Encrypt (Caddy) |
| **Access Model** | Unrestricted local | Owner / Internal QA | Invite-only (`ALLOW_PUBLIC_REGISTRATION=false`) |
| **Tax Evidence Flag** | `true` (local dev audit) | `false` | `false` (default until real disposal validation) |
| **Log Format** | Local console | Structured JSON (`@atlas/logger`) | Structured JSON (`@atlas/logger`) |

---

## 3. Preflight Checklist (Execute Before Deploy)

Before triggering any remote server action, verify locally:

```bash
# 1. Verify working branch and clean status
git status --short
git branch --show-current

# 2. Verify all 26 packages typecheck
pnpm typecheck

# 3. Verify linting passes cleanly
pnpm lint

# 4. Verify test suites
pnpm test:api
pnpm test:web

# 5. Verify database migration baseline count
pnpm --filter @atlas/database prisma migrate status
# Expected output: "Database schema is up to date!" (48 migrations)
```

---

## 4. Pre-Deployment Database Snapshot

Always execute an on-demand database backup before deploying new code:

```bash
# In AWS Lightsail / RDS console or CLI:
aws lightsail create-relational-database-snapshot \
  --relational-database-name atlas-beta-db \
  --relational-database-snapshot-name "pre-deploy-$(date +%Y%m%d%H%M)" \
  --region sa-east-1
```

Confirm that the snapshot status transitions to `available` before proceeding.

---

## 5. Migration Execution Flow

Database migrations must run **before** traffic is shifted to new application containers:

```bash
# 1. SSH into the deployment bastion / app host
ssh deploy@<APP_HOST_IP>

# 2. Export required production connection (Private VPC endpoint)
export DATABASE_URL="postgresql://atlas_user:<PASSWORD>@<PRIVATE_DB_ENDPOINT>:5432/atlas_beta?schema=public&sslmode=require"

# 3. Run migration deployment
cd /opt/atlas/repo
pnpm --filter @atlas/database prisma migrate deploy

# 4. Verify exactly 48 (or expected N) migrations are active
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$queryRaw\`SELECT count(*)::int as count FROM _prisma_migrations WHERE rolled_back_at IS NULL\`
  .then(([r]) => {
    console.log('Applied migrations:', r.count);
    if (r.count < 48) process.exit(1);
    process.exit(0);
  });
"
```

---

## 6. Application Deployment Flow

### 6.1. Build and Tag Container Images

```bash
# Build API container (non-root Node 22 Alpine)
docker build -t atlas-api:$(git rev-parse --short HEAD) -f apps/api/Dockerfile .

# Build Web container (standalone Next.js 15)
docker build -t atlas-web:$(git rev-parse --short HEAD) -f apps/web/Dockerfile .
```

### 6.2. Production `compose.prod.yml`

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
      - api

  web:
    image: atlas-web:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
      - ATLAS_API_INTERNAL_URL=http://api:3001
      - NEXT_PUBLIC_API_URL=https://api.atlasinvest.com.br
      - NEXT_PUBLIC_APP_URL=https://app.atlasinvest.com.br
    expose:
      - "3000"

  api:
    image: atlas-api:latest
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - API_PORT=3001
      - DATABASE_URL=postgresql://atlas_user:SECRET@<PRIVATE_DB_HOST>:5432/atlas_beta?schema=public&sslmode=require
      - JWT_ACCESS_SECRET=SECRET_AT_LEAST_32_CHARS
      - REFRESH_TOKEN_PEPPER=SECRET_AT_LEAST_32_CHARS
      - PASSWORD_RESET_PEPPER=SECRET_AT_LEAST_32_CHARS
      - ALLOWED_ORIGINS=https://app.atlasinvest.com.br
      - ALLOW_PUBLIC_REGISTRATION=false
      - TAX_COST_EVIDENCE_ENRICHMENT_ENABLED=false
      - INTEGRATION_SCHEDULER_ENABLED=false
    expose:
      - "3001"

volumes:
  caddy_data:
  caddy_config:
```

### 6.3. Production `Caddyfile`

```caddy
app.atlasinvest.com.br {
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    reverse_proxy web:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}

api.atlasinvest.com.br {
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
    reverse_proxy api:3001 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

---

## 7. Post-Deployment Verification & Smoke Tests

Execute immediately following container startup:

```bash
# 1. Verify Liveness Probe
curl -f -s https://api.atlasinvest.com.br/health | jq .
# Expected: { "status": "ok", "uptime": ... }

# 2. Verify Readiness Probe
curl -f -s https://api.atlasinvest.com.br/ready | jq .
# Expected: { "status": "ready", "database": "connected", "migrations": { "expected": 48, "applied": 48 } }

# 3. Web Login Page Smoke Test
curl -I -s https://app.atlasinvest.com.br/login | head -n 5
# Expected: HTTP/2 200 OK

# 4. Verify Authenticated Navigation Smoke (Web Browser)
# - Log in with designated beta owner account.
# - Navigate to /portfolio -> Verify positions load without 500 error.
# - Navigate to /tax -> Verify CTI renders without "Analisando..." perpetual deadlock.
# - Check Network panel -> Confirm refresh cookie has 'Secure' and 'HttpOnly' flags.
```

---

## 8. Rollback Procedures

### 8.1. Application Rollback (Web or API)
If the new application code introduces a regression:

```bash
# 1. Update container tag in docker-compose.prod.yml to previous stable commit SHA
export PREVIOUS_STABLE_SHA="<PREVIOUS_GIT_SHA>"

# 2. Relaunch containers instantly (< 30 seconds)
docker compose -f compose.prod.yml up -d --no-deps web api

# 3. Verify readiness
curl -f https://api.atlasinvest.com.br/ready
```

### 8.2. Database Rollback
Because Atlas utilizes an append-only transaction ledger, **do not execute manual SQL deletes or table drops.**

1. **If code rollback is sufficient:** Revert application containers. Because migrations are strictly backward-compatible (append-only columns/tables), old application code continues to function against the new schema.
2. **If catastrophic data corruption occurred:**
   ```bash
   # Restore from pre-deploy snapshot in AWS Lightsail / RDS
   aws lightsail restore-relational-database \
     --relational-database-snapshot-name pre-deploy-202611030900 \
     --relational-database-name atlas-beta-db-restored \
     --region sa-east-1
   # Update DATABASE_URL to point to restored database endpoint
   ```

---

## 9. Incident Response & Troubleshooting Cheat-Sheet

| Severity | Definition | Target Response | Contact |
| :--- | :--- | :--- | :--- |
| **SEV-1** | Outage, data corruption, or security incident | < 30 minutes | Page Core Lead / Owner |
| **SEV-2** | Critical function unavailable (e.g. Tax replay failure) | < 2 hours | Core Engineering |
| **SEV-3** | Degraded performance or minor import failure | < 24 hours | On-call Engineer |
| **SEV-4** | Cosmetic UI defect | Next release | Backlog |

### Forensic Commands:

```bash
# Check API structured error logs filtered by requestId
docker compose -f compose.prod.yml logs api | grep "a1b2c3d4-e5f6..."

# Check recent fatal errors or unhandled rejections
docker compose -f compose.prod.yml logs --tail=100 api | grep -i "error"

# Inspect active database connection pool count
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'atlas_beta';"

# Clean Web cache if chunk loading fails
docker compose -f compose.prod.yml restart web
```

---

## 10. Document Authorization Gate

- **Engineering Review:** APPROVED  
- **Operational Runbook Readiness:** PASS  
- **Action Permitted:** Ready for staging trial when explicitly commanded.  
- **Action Prohibited:** NO PUSH, NO DEPLOY without explicit Owner authorization.
