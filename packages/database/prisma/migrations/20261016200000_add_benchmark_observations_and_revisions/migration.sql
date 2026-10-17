-- CreateTable
CREATE TABLE "benchmark_observations" (
    "id" UUID NOT NULL,
    "benchmark_id" VARCHAR(32) NOT NULL,
    "reference_date" DATE NOT NULL,
    "value" DECIMAL(38,18) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "frequency" VARCHAR(32) NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "provider_series_id" VARCHAR(64),
    "first_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetch_count" INTEGER NOT NULL DEFAULT 1,
    "revised_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "benchmark_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmark_observation_revisions" (
    "id" UUID NOT NULL,
    "benchmark_observation_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prior_value" DECIMAL(38,18) NOT NULL,
    "new_value" DECIMAL(38,18) NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benchmark_observation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "benchmark_observations_benchmark_date_idx" ON "benchmark_observations"("benchmark_id", "reference_date");

-- CreateIndex
CREATE INDEX "benchmark_observations_date_idx" ON "benchmark_observations"("reference_date");

-- CreateIndex
CREATE INDEX "benchmark_observations_source_idx" ON "benchmark_observations"("source");

-- CreateIndex
CREATE UNIQUE INDEX "benchmark_observations_benchmark_date_source_uniq" ON "benchmark_observations"("benchmark_id", "reference_date", "source");

-- CreateIndex
CREATE INDEX "benchmark_observation_revisions_obs_idx" ON "benchmark_observation_revisions"("benchmark_observation_id");

-- AddForeignKey
ALTER TABLE "benchmark_observation_revisions" ADD CONSTRAINT "benchmark_observation_revisions_benchmark_observation_id_fkey" FOREIGN KEY ("benchmark_observation_id") REFERENCES "benchmark_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

