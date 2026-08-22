import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const MERCHANT_API_KEY_HASH =
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

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
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
