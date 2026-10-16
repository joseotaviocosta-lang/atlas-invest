-- CreateTable
CREATE TABLE "market_quotes" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "trading_date" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "open" DECIMAL(38,18),
    "high" DECIMAL(38,18),
    "low" DECIMAL(38,18),
    "close" DECIMAL(38,18) NOT NULL,
    "adjusted_close" DECIMAL(38,18),
    "volume" DECIMAL(38,18),
    "provider" VARCHAR(32) NOT NULL,
    "provider_symbol" VARCHAR(64) NOT NULL,
    "first_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetch_count" INTEGER NOT NULL DEFAULT 1,
    "revised_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "market_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_quote_revisions" (
    "id" UUID NOT NULL,
    "market_quote_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prior_open" DECIMAL(38,18),
    "prior_high" DECIMAL(38,18),
    "prior_low" DECIMAL(38,18),
    "prior_close" DECIMAL(38,18) NOT NULL,
    "prior_adjusted_close" DECIMAL(38,18),
    "prior_volume" DECIMAL(38,18),
    "new_open" DECIMAL(38,18),
    "new_high" DECIMAL(38,18),
    "new_low" DECIMAL(38,18),
    "new_close" DECIMAL(38,18) NOT NULL,
    "new_adjusted_close" DECIMAL(38,18),
    "new_volume" DECIMAL(38,18),
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_quote_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_quotes_asset_date_idx" ON "market_quotes"("asset_id", "trading_date");

-- CreateIndex
CREATE INDEX "market_quotes_date_idx" ON "market_quotes"("trading_date");

-- CreateIndex
CREATE INDEX "market_quotes_provider_idx" ON "market_quotes"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "market_quotes_asset_date_provider_uniq" ON "market_quotes"("asset_id", "trading_date", "provider");

-- CreateIndex
CREATE INDEX "market_quote_revisions_quote_idx" ON "market_quote_revisions"("market_quote_id");

-- AddForeignKey
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_quote_revisions" ADD CONSTRAINT "market_quote_revisions_market_quote_id_fkey" FOREIGN KEY ("market_quote_id") REFERENCES "market_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

