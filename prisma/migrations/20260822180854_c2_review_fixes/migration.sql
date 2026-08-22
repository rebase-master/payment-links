/*
  Warnings:

  - A unique constraint covering the columns `[merchant_id,type,currency]` on the table `accounts` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_payment_id_fkey";

-- DropIndex
DROP INDEX "accounts_merchant_id_idx";

-- DropIndex
DROP INDEX "outbox_messages_published_at_idx";

-- DropIndex
DROP INDEX "payment_links_merchant_id_idx";

-- DropIndex
DROP INDEX "payment_links_status_idx";

-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ledger_entries" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "merchants" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "outbox_messages" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "published_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "payment_links" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "provider_events" ALTER COLUMN "received_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "processed_at" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_merchant_id_type_currency_key" ON "accounts"("merchant_id", "type", "currency");

-- CreateIndex
CREATE INDEX "payment_links_merchant_id_status_idx" ON "payment_links"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "payment_links_status_expires_at_idx" ON "payment_links"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: money and format invariants Prisma's schema language cannot
-- express (CHECK constraints). Prisma does not manage these and will not
-- flag or revert them as drift.
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');

-- Hand-written: ledger_entries is append-only. The application never issues
-- UPDATE/DELETE against it, but a buggy future call site should not be able
-- to silently rewrite history — the database refuses it outright.
CREATE OR REPLACE FUNCTION ledger_entries_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_no_update
  BEFORE UPDATE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();

CREATE TRIGGER ledger_entries_no_delete
  BEFORE DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();

-- Hand-written: the (merchant_id, type, currency) unique index above does
-- not stop two PLATFORM_CLEARING accounts in the same currency, because
-- standard btree uniqueness treats every NULL merchant_id as distinct. This
-- partial index closes that gap for the NULL-merchant case specifically.
CREATE UNIQUE INDEX "accounts_platform_clearing_unique" ON "accounts"("type", "currency") WHERE "merchant_id" IS NULL;

-- Hand-written: matches the outbox relay's actual query shape
-- (WHERE published_at IS NULL ORDER BY created_at), and stays small as
-- published rows accumulate instead of indexing the whole table.
CREATE INDEX "outbox_messages_pending_idx" ON "outbox_messages"("created_at") WHERE "published_at" IS NULL;
