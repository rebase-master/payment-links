import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Local dev credential only — resolves to the seeded demo merchant. The auth
// guard hashes an incoming key exactly the same way; see
// src/auth/api-key.service.ts.
const DEV_API_KEY = 'pl_test_acme_dev_key';
const API_KEY_PEPPER = process.env.API_KEY_PEPPER ?? '';
const MERCHANT_API_KEY_HASH = createHash('sha256')
  .update(`${DEV_API_KEY}${API_KEY_PEPPER}`)
  .digest('hex');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env first.');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const merchant = await prisma.merchant.upsert({
    where: { apiKeyHash: MERCHANT_API_KEY_HASH },
    update: {},
    create: {
      name: 'Acme Storefront',
      apiKeyHash: MERCHANT_API_KEY_HASH,
      accounts: {
        create: { type: 'MERCHANT_BALANCE', currency: 'AED' },
      },
    },
  });

  const clearing = await prisma.account.findFirst({
    where: { type: 'PLATFORM_CLEARING', currency: 'AED' },
  });
  if (!clearing) {
    await prisma.account.create({
      data: { type: 'PLATFORM_CLEARING', currency: 'AED' },
    });
  }

  const existingLink = await prisma.paymentLink.findFirst({
    where: { merchantId: merchant.id, reference: 'DEMO-0001' },
  });
  if (!existingLink) {
    await prisma.paymentLink.create({
      data: {
        merchantId: merchant.id,
        amount: 2500n,
        currency: 'AED',
        status: 'ACTIVE',
        description: 'Demo payment link',
        reference: 'DEMO-0001',
      },
    });
  }

  console.log(`Seeded merchant ${merchant.id} and a demo payment link.`);
  console.log(`Merchant API key (dev only): ${DEV_API_KEY}`);
}

async function run(): Promise<void> {
  try {
    await main();
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
