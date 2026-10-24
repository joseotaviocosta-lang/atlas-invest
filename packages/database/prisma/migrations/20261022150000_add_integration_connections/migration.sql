-- Phase 5P-D — persistent integration connection lifecycle.
--
-- 1. `integration_connections`: whether a portfolio is connected to a
--    source. One row per (portfolio, source): lifecycle status plus
--    authorization timestamps. Schedules keep representing user preference
--    (independent, no FK either way); runs keep being execution history.
-- 2. Environment is CHECK-locked to 'SIMULATED' (same barrier as
--    schedules): CERT/PROD requires a deliberate future migration.
-- 3. Status is CHECK-locked to the lifecycle vocabulary
--    (NOT_CONNECTED / AWAITING_AUTHORIZATION / AUTHORIZED /
--    REQUIRES_REAUTHORIZATION / REVOKED): execution states never live here.
-- 4. No token/secret/certificate/CPF/payload columns by design; portfolio
--    deletion cascades (connections are scoped evidence of that portfolio).
-- Additive only. No data migration. No destructive changes.

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(100) NOT NULL DEFAULT 'SIMULATED',
    "environment" VARCHAR(50) NOT NULL DEFAULT 'SIMULATED',
    "status" VARCHAR(50) NOT NULL,
    "authorized_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integration_connections_environment_simulated_only" CHECK ("environment" = 'SIMULATED'),
    CONSTRAINT "integration_connections_status_allowed" CHECK ("status" IN ('NOT_CONNECTED', 'AWAITING_AUTHORIZATION', 'AUTHORIZED', 'REQUIRES_REAUTHORIZATION', 'REVOKED'))
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_portfolio_id_source_key" ON "integration_connections"("portfolio_id", "source");

-- CreateIndex
CREATE INDEX "integration_connections_portfolio_id_idx" ON "integration_connections"("portfolio_id");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
