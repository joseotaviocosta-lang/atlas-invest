-- Phase 5D — Official Calendar Days
CREATE TABLE "calendar_days" (
    "id" UUID NOT NULL,
    "calendar_type" VARCHAR(32) NOT NULL,
    "date" DATE NOT NULL,
    "is_open" BOOLEAN NOT NULL,
    "reason" VARCHAR(255),
    "source" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_days_type_date_uniq" ON "calendar_days"("calendar_type", "date");
CREATE INDEX "calendar_days_type_date_idx" ON "calendar_days"("calendar_type", "date");
CREATE INDEX "calendar_days_date_idx" ON "calendar_days"("date");
