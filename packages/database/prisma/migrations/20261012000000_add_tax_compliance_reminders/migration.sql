-- CreateTable
CREATE TABLE "tax_compliance_reminder_actions" (
    "id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "reminder_key" VARCHAR(255) NOT NULL,
    "obligation_key" VARCHAR(255) NOT NULL,
    "reminder_kind" VARCHAR(50) NOT NULL,
    "trigger_at" DATE NOT NULL,
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "action_type" VARCHAR(20) NOT NULL,
    "snoozed_until" DATE,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_compliance_reminder_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_compliance_notification_events" (
    "id" UUID NOT NULL,
    "tax_subject_id" UUID NOT NULL,
    "reminder_key" VARCHAR(255) NOT NULL,
    "source_fingerprint" VARCHAR(64) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "trigger_at" DATE NOT NULL,
    "delivered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_status" VARCHAR(30) NOT NULL DEFAULT 'DELIVERED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "dedup_key" VARCHAR(512) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_compliance_notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_compliance_reminder_preferences" (
    "tax_subject_id" UUID NOT NULL,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "upcoming_enabled" BOOLEAN NOT NULL DEFAULT true,
    "overdue_enabled" BOOLEAN NOT NULL DEFAULT true,
    "annual_enabled" BOOLEAN NOT NULL DEFAULT true,
    "lead_times" INTEGER[] NOT NULL DEFAULT ARRAY[7, 3, 1],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_compliance_reminder_preferences_pkey" PRIMARY KEY ("tax_subject_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_compliance_reminder_action_rev_uniq" ON "tax_compliance_reminder_actions"("tax_subject_id", "reminder_key", "revision");

-- CreateIndex
CREATE INDEX "tax_compliance_reminder_action_lookup_idx" ON "tax_compliance_reminder_actions"("tax_subject_id", "reminder_key");

-- CreateIndex
CREATE INDEX "tax_compliance_reminder_action_time_idx" ON "tax_compliance_reminder_actions"("tax_subject_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "tax_compliance_notification_event_dedup_uniq" ON "tax_compliance_notification_events"("tax_subject_id", "dedup_key");

-- CreateIndex
CREATE INDEX "tax_compliance_notification_event_lookup_idx" ON "tax_compliance_notification_events"("tax_subject_id", "reminder_key");

-- AddForeignKey
ALTER TABLE "tax_compliance_reminder_actions" ADD CONSTRAINT "tax_compliance_reminder_actions_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_compliance_notification_events" ADD CONSTRAINT "tax_compliance_notification_events_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_compliance_reminder_preferences" ADD CONSTRAINT "tax_compliance_reminder_preferences_tax_subject_id_fkey" FOREIGN KEY ("tax_subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
