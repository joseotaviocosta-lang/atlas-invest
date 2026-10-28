-- Phase 6B — LGPD & Legal Compliance Readiness
-- Adds legal_document_acceptances, user_consents, data_subject_requests, and users.deactivated_at.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "deactivated_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "legal_document_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "document_version" VARCHAR(20) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_ip" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" VARCHAR(100) NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "granted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "client_ip" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "details" VARCHAR(2000),
    "response_notes" VARCHAR(2000),
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_doc_acceptances_user_idx" ON "legal_document_acceptances"("user_id");

-- CreateIndex
CREATE INDEX "legal_doc_acceptances_doc_ver_idx" ON "legal_document_acceptances"("document_type", "document_version");

-- CreateIndex
CREATE UNIQUE INDEX "user_consents_user_purpose_uniq" ON "user_consents"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "user_consents_user_idx" ON "user_consents"("user_id");

-- CreateIndex
CREATE INDEX "dsr_user_idx" ON "data_subject_requests"("user_id");

-- CreateIndex
CREATE INDEX "dsr_status_idx" ON "data_subject_requests"("status");

-- AddForeignKey
ALTER TABLE "legal_document_acceptances" ADD CONSTRAINT "legal_document_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

