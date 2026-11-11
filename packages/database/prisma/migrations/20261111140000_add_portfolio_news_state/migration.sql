-- APP-16M: Portfolio News State & New Event Detection
-- Tracks per-portfolio baseline initialization, event version fingerprints,
-- novelty transitions (NEW, UPDATED, SEEN, UNCHANGED), and user seen timestamps.
-- Additive only; zero changes to ledger, positions, or existing tables.

-- CreateTable
CREATE TABLE "portfolio_news_sync_states" (
    "portfolio_id" UUID NOT NULL,
    "news_state_initialized_at" TIMESTAMPTZ(6),
    "last_refreshed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_news_sync_states_pkey" PRIMARY KEY ("portfolio_id")
);

-- CreateTable
CREATE TABLE "portfolio_news_event_states" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "canonical_event_id" VARCHAR(120) NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_observed_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_by_user_at" TIMESTAMPTZ(6),
    "first_fingerprint" VARCHAR(64) NOT NULL,
    "latest_fingerprint" VARCHAR(64) NOT NULL,
    "state" VARCHAR(20) NOT NULL,
    "latest_update_reasons" JSONB NOT NULL DEFAULT '[]',
    "event_published_at" TIMESTAMPTZ(6),
    "snapshot_meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_news_event_states_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portfolio_news_event_states_state_check" CHECK ("state" IN ('NEW', 'UPDATED', 'SEEN', 'UNCHANGED'))
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_news_event_states_portfolio_canonical_key" ON "portfolio_news_event_states"("portfolio_id", "canonical_event_id");

-- CreateIndex
CREATE INDEX "portfolio_news_event_states_portfolio_state_idx" ON "portfolio_news_event_states"("portfolio_id", "state");

-- CreateIndex
CREATE INDEX "portfolio_news_event_states_portfolio_observed_idx" ON "portfolio_news_event_states"("portfolio_id", "last_observed_at" DESC);

-- CreateIndex
CREATE INDEX "portfolio_news_event_states_portfolio_published_idx" ON "portfolio_news_event_states"("portfolio_id", "event_published_at" DESC);

-- AddForeignKey
ALTER TABLE "portfolio_news_sync_states" ADD CONSTRAINT "portfolio_news_sync_states_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_news_event_states" ADD CONSTRAINT "portfolio_news_event_states_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
