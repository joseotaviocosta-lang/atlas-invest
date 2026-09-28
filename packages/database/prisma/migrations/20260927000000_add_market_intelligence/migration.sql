-- CreateTable
CREATE TABLE "market_intelligence_items" (
    "id" UUID NOT NULL,
    "source_provider" VARCHAR(100) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_item_id" VARCHAR(255) NOT NULL,
    "headline" VARCHAR(500) NOT NULL,
    "excerpt" VARCHAR(2000),
    "canonical_url" VARCHAR(1000),
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "retrieved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" VARCHAR(50) NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "market_intelligence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_intelligence_asset_links" (
    "id" UUID NOT NULL,
    "market_intelligence_item_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_intelligence_asset_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_intelligence_items_source_provider_source_item_id_key" ON "market_intelligence_items"("source_provider", "source_item_id");

-- CreateIndex
CREATE INDEX "market_intelligence_items_published_at_idx" ON "market_intelligence_items"("published_at");

-- CreateIndex
CREATE INDEX "market_intelligence_items_category_idx" ON "market_intelligence_items"("category");

-- CreateIndex
CREATE UNIQUE INDEX "market_intelligence_asset_links_market_intelligence_item_id_asset_id_key" ON "market_intelligence_asset_links"("market_intelligence_item_id", "asset_id");

-- CreateIndex
CREATE INDEX "market_intelligence_asset_links_asset_id_idx" ON "market_intelligence_asset_links"("asset_id");

-- CreateIndex
CREATE INDEX "market_intelligence_asset_links_market_intelligence_item_id_idx" ON "market_intelligence_asset_links"("market_intelligence_item_id");

-- AddForeignKey
ALTER TABLE "market_intelligence_asset_links" ADD CONSTRAINT "market_intelligence_asset_links_market_intelligence_item_id_fkey" FOREIGN KEY ("market_intelligence_item_id") REFERENCES "market_intelligence_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_intelligence_asset_links" ADD CONSTRAINT "market_intelligence_asset_links_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
