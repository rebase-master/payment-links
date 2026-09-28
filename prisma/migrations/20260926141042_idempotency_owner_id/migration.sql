/*
  Warnings:

  - A unique constraint covering the columns `[scope,owner_id,key]` on the table `idempotency_keys` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `owner_id` to the `idempotency_keys` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "idempotency_keys_scope_key_key";

-- AlterTable: add nullable first so existing rows can be backfilled
ALTER TABLE "idempotency_keys" ADD COLUMN "owner_id" UUID;

-- Backfill: old keys were stored as "<owner uuid>:<client key>"
UPDATE "idempotency_keys"
SET "owner_id" = split_part("key", ':', 1)::uuid,
    "key"      = substr("key", 38);

ALTER TABLE "idempotency_keys" ALTER COLUMN "owner_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_owner_id_key_key" ON "idempotency_keys"("scope", "owner_id", "key");
