-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "used_refresh_token_hashes" text[] NOT NULL DEFAULT '{}';
