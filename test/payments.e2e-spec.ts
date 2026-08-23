import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

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
    payLink(input: $input) { paymentId status amount currency }
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
      payLink: { paymentId: string; status: string; amount: string };
    }>(PAY, { input: { paymentLinkId: link?.id, idempotencyKey: payKey } });

    expect(paid.data?.payLink.status).toBe('SUCCEEDED');
    expect(paid.data?.payLink.amount).toBe('2500');

    // Same idempotency key replays the same payment rather than paying twice.
    const replay = await gql<{ payLink: { paymentId: string } }>(PAY, {
      input: { paymentLinkId: link?.id, idempotencyKey: payKey },
    });
    expect(replay.data?.payLink.paymentId).toBe(paid.data?.payLink.paymentId);
  });

  it('rejects createPaymentLink without an API key', async () => {
    const res = await gql<{ createPaymentLink: unknown }>(CREATE, {
      input: { amount: '100', currency: 'AED', idempotencyKey: randomUUID() },
    });

    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.message).toContain('API key');
  });
});
