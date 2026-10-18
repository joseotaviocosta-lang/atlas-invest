-- CreateTable
CREATE TABLE "fx_observations" (
    "id" UUID NOT NULL,
    "base_currency" VARCHAR(3) NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL,
    "observation_date" DATE NOT NULL,
    "rate" DECIMAL(38,18) NOT NULL,
    "rate_type" VARCHAR(16) NOT NULL DEFAULT 'MID',
    "source" VARCHAR(64) NOT NULL,
    "provider_series_id" VARCHAR(64),
    "first_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetch_count" INTEGER NOT NULL DEFAULT 1,
    "revised_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fx_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_observation_revisions" (
    "id" UUID NOT NULL,
    "fx_observation_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prior_rate" DECIMAL(38,18) NOT NULL,
    "new_rate" DECIMAL(38,18) NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_observation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fx_observations_pair_date_idx" ON "fx_observations"("base_currency", "quote_currency", "observation_date");

-- CreateIndex
CREATE INDEX "fx_observations_date_idx" ON "fx_observations"("observation_date");

-- CreateIndex
CREATE INDEX "fx_observations_source_idx" ON "fx_observations"("source");

-- CreateIndex
CREATE UNIQUE INDEX "fx_observations_pair_date_source_type_uniq" ON "fx_observations"("base_currency", "quote_currency", "observation_date", "source", "rate_type");

-- CreateIndex
CREATE INDEX "fx_observation_revisions_obs_idx" ON "fx_observation_revisions"("fx_observation_id");

-- AddForeignKey
ALTER TABLE "fx_observation_revisions" ADD CONSTRAINT "fx_observation_revisions_fx_observation_id_fkey" FOREIGN KEY ("fx_observation_id") REFERENCES "fx_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

