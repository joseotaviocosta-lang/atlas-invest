-- Phase 5D — Canonical Macroeconomic Series Observations & Revisions
CREATE TABLE "macro_observations" (
    "id" UUID NOT NULL,
    "series_id" VARCHAR(32) NOT NULL,
    "reference_date" DATE NOT NULL,
    "value" DECIMAL(38,18) NOT NULL,
    "unit" VARCHAR(32) NOT NULL,
    "frequency" VARCHAR(32) NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "first_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetch_count" INTEGER NOT NULL DEFAULT 1,
    "revised_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "macro_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "macro_observations_series_date_source_uniq" ON "macro_observations"("series_id", "reference_date", "source");
CREATE INDEX "macro_observations_series_date_idx" ON "macro_observations"("series_id", "reference_date");
CREATE INDEX "macro_observations_date_idx" ON "macro_observations"("reference_date");
CREATE INDEX "macro_observations_source_idx" ON "macro_observations"("source");

CREATE TABLE "macro_observation_revisions" (
    "id" UUID NOT NULL,
    "macro_observation_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prior_value" DECIMAL(38,18) NOT NULL,
    "new_value" DECIMAL(38,18) NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_observation_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "macro_observation_revisions_macro_obs_fkey" FOREIGN KEY ("macro_observation_id") REFERENCES "macro_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "macro_observation_revisions_obs_idx" ON "macro_observation_revisions"("macro_observation_id");
