import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';

// Resolves to the seeded demo merchant (see prisma/seed.ts). Run
// `npm run db:seed` against the test database first.
const DEV_API_KEY = 'pl_test_acme_dev_key';

interface GqlError {
  message: string;
  extensions?: { code?: string };
}
interface GqlBody<T> {
  data?: T;
  errors?: GqlError[];
}

const CREATE = `
  mutation Create($input: CreatePaymentLinkInput!) {
    createPaymentLink(input: $input) { id amount currency status }
  }
`;
const PAY = `
  mutation Pay($input: PayLinkInput!) {
    payLink(input: $input) { id status amount currency }
  }
`;
const LINK = `
  query Link($id: ID!){
    paymentLink(id: $id) { id status }
  }
`;

describe('Money path (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function gql<T>(
    query: string,
    variables: Record<string, unknown>,
    apiKey?: string,
  ): Promise<GqlBody<T>> {
    let req = request(app.getHttpServer()).post('/graphql');
    if (apiKey) {
      req = req.set('Authorization', `Bearer ${apiKey}`);
    }
    const res = await req.send({ query, variables });
    return res.body as GqlBody<T>;
  }

  async function createExpiredLink(): Promise<string> {
    const prisma = app.get(PrismaService);
    const merchant = await prisma.merchant.findFirstOrThrow();
    const link = await prisma.paymentLink.create({
      data: {
        merchantId: merchant.id,
        amount: 2500n,
        currency: 'AED',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    return link.id;
  }

  it('creates a link (authenticated) and pays it, idempotently', async () => {
    const created = await gql<{
      createPaymentLink: { id: string; amount: string; status: string };
    }>(
      CREATE,
      {
        input: {
          amount: '2500',
          currency: 'AED',
          idempotencyKey: randomUUID(),
        },
      },
      DEV_API_KEY,
    );

    const link = created.data?.createPaymentLink;
    expect(link?.status).toBe('ACTIVE');
    expect(link?.amount).toBe('2500');

    const payKey = randomUUID();
    const paid = await gql<{
      payLink: { id: string; status: string; amount: string };
    }>(PAY, { input: { paymentLinkId: link?.id, idempotencyKey: payKey } });

    expect(paid.data?.payLink.status).toBe('SUCCEEDED');
    expect(paid.data?.payLink.amount).toBe('2500');

    // Same idempotency key replays the same payment rather than paying twice.
    const replay = await gql<{ payLink: { id: string } }>(PAY, {
      input: { paymentLinkId: link?.id, idempotencyKey: payKey },
    });
    expect(replay.data?.payLink.id).toBe(paid.data?.payLink.id);
  });

  it('reports a link past its expiry as EXPIRED', async () => {
    const id = await createExpiredLink();
    const res = await gql<{ paymentLink: { status: string } }>(LINK, { id });

    expect(res.data?.paymentLink.status).toBe('EXPIRED');
  });

  it('refuses to pay a link past its expiry', async () => {
    const id = await createExpiredLink();
    const res = await gql<{ payLink: unknown }>(PAY, {
      input: { paymentLinkId: id, idempotencyKey: randomUUID() },
    });

    expect(res.errors?.[0]?.extensions?.code).toBe('PAYMENT_LINK_NOT_PAYABLE');
  });

  it('rejects createPaymentLink without an API key', async () => {
    const res = await gql<{ createPaymentLink: unknown }>(CREATE, {
      input: { amount: '100', currency: 'AED', idempotencyKey: randomUUID() },
    });

    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.message).toContain('API key');
  });

  it('rejects a non-UUID paymentLink id as a client error, not a 500', async () => {
    const res = await gql<{ paymentLink: unknown }>(LINK, { id: 'not-a-UUID' });
    expect(res.errors?.[0]?.extensions?.code).toBe('BAD_REQUEST');
  });

  it('rejects reusing a createPaymentLink key with a different body', async () => {
    const key = randomUUID();
    const first = await gql<{ createPaymentLink: { id: string } }>(
      CREATE,
      { input: { amount: '2500', currency: 'AED', idempotencyKey: key } },
      DEV_API_KEY,
    );
    expect(first.data?.createPaymentLink.id).toBeDefined();

    const second = await gql<{ createPaymentLink: unknown }>(
      CREATE,
      { input: { amount: '9900', currency: 'AED', idempotencyKey: key } },
      DEV_API_KEY,
    );
    expect(second.errors?.[0]?.extensions?.code).toBe(
      'IDEMPOTENCY_KEY_CONFLICT',
    );
  });

  it('accepts a max-length (200 char) idempotency key without a server error', async () => {
    const body = await gql<{ createPaymentLink: { id: string } }>(
      CREATE,
      {
        input: {
          amount: '2500',
          currency: 'AED',
          idempotencyKey: `${randomUUID()}${'k'.repeat(164)}`,
        },
      },
      DEV_API_KEY,
    );
    expect(body.errors).toBeUndefined();
    expect(body.data?.createPaymentLink.id).toBeDefined();
  });

  it('allows only one of two concurrent different-key payments of a link', async () => {
    const created = await gql<{ createPaymentLink: { id: string } }>(
      CREATE,
      {
        input: {
          amount: '2500',
          currency: 'AED',
          idempotencyKey: randomUUID(),
        },
      },
      DEV_API_KEY,
    );
    const linkId = created.data?.createPaymentLink.id;

    const outcomes = await Promise.all([
      gql<{ payLink: { id: string } }>(PAY, {
        input: { paymentLinkId: linkId, idempotencyKey: randomUUID() },
      }),
      gql<{ payLink: { id: string } }>(PAY, {
        input: { paymentLinkId: linkId, idempotencyKey: randomUUID() },
      }),
    ]);

    const succeeded = outcomes.filter((r) => r.data?.payLink.id).length;
    const notPayable = outcomes.filter(
      (r) => r.errors?.[0]?.extensions?.code === 'PAYMENT_LINK_NOT_PAYABLE',
    ).length;
    expect(succeeded).toBe(1);
    expect(notPayable).toBe(1);
  });
});
