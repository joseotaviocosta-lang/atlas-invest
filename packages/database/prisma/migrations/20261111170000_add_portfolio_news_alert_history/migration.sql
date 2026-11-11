-- APP-16O: Material News Alert History & Audit Trail
-- Append-only local audit log of material news alert attempts and deliveries.
-- Strictly separated from current event operational state (`portfolio_news_event_states`).
-- Additive only; zero changes to ledger, positions, or existing tables.

-- CreateTable
CREATE TABLE "portfolio_news_alert_histories" (
    "id" UUID NOT NULL,
    "alert_attempt_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "canonical_event_id" VARCHAR(120) NOT NULL,
    "event_version_fingerprint" VARCHAR(64) NOT NULL,
    "event_state" VARCHAR(20) NOT NULL,
    "materiality" VARCHAR(20) NOT NULL,
    "ticker" VARCHAR(32) NOT NULL,
    "alert_type" VARCHAR(32) NOT NULL,
    "delivery_status" VARCHAR(40) NOT NULL,
    "claimed_at" TIMESTAMPTZ(6),
    "attempted_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "failure_reason" VARCHAR(500),
    "notification_id" VARCHAR(120),
    "headline_snapshot" VARCHAR(500) NOT NULL,
    "materiality_reason_snapshot" VARCHAR(500),
    "source_label_snapshot" VARCHAR(120),
    "batch_event_count" INTEGER NOT NULL DEFAULT 1,
    "batch_tickers" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_news_alert_histories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portfolio_news_alert_histories_event_state_check" CHECK ("event_state" IN ('NEW', 'UPDATED')),
    CONSTRAINT "portfolio_news_alert_histories_materiality_check" CHECK ("materiality" IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'ROUTINE')),
    CONSTRAINT "portfolio_news_alert_histories_batch_count_check" CHECK ("batch_event_count" >= 1)
);

-- CreateIndex (pagination by attemptedAt DESC, id DESC)
CREATE INDEX "portfolio_news_alert_histories_portfolio_attempted_idx"
ON "portfolio_news_alert_histories"("portfolio_id", "attempted_at" DESC, "id" DESC);

-- CreateIndex (filter by status)
CREATE INDEX "portfolio_news_alert_histories_portfolio_status_idx"
ON "portfolio_news_alert_histories"("portfolio_id", "delivery_status");

-- CreateIndex (filter by ticker)
CREATE INDEX "portfolio_news_alert_histories_portfolio_ticker_idx"
ON "portfolio_news_alert_histories"("portfolio_id", "ticker");

-- Partial Unique Index: strictly at most one DELIVERED entry per (portfolioId, canonicalEventId, eventVersionFingerprint),
-- while allowing multiple failed/permission/retry attempts for the same event version.
CREATE UNIQUE INDEX "portfolio_news_alert_histories_unique_delivered"
ON "portfolio_news_alert_histories"("portfolio_id", "canonical_event_id", "event_version_fingerprint")
WHERE "delivery_status" = 'DELIVERED';

-- AddForeignKey
ALTER TABLE "portfolio_news_alert_histories"
ADD CONSTRAINT "portfolio_news_alert_histories_portfolio_id_fkey"
FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
