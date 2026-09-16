-- AlterTable: users
ALTER TABLE "users" ADD COLUMN "password_hash" VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN "locale" VARCHAR(10) NOT NULL DEFAULT 'pt-BR';
ALTER TABLE "users" ADD COLUMN "timezone" VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE "users" ADD COLUMN "base_currency" VARCHAR(3) NOT NULL DEFAULT 'BRL';
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);

-- Remove temporary default for password_hash on future inserts
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP DEFAULT;

-- CreateTable: sessions
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "previous_refresh_token_hash" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "user_agent" VARCHAR(500),
    "ip_hash" VARCHAR(64),
    "device_name" VARCHAR(100),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: password_reset_tokens
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "password_reset_tokens_token_hash_key" UNIQUE ("token_hash"),
    CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE INDEX "sessions_revoked_at_idx" ON "sessions"("revoked_at");
CREATE INDEX "sessions_refresh_token_hash_idx" ON "sessions"("refresh_token_hash");
CREATE INDEX "sessions_prev_refresh_token_hash_idx" ON "sessions"("previous_refresh_token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");
