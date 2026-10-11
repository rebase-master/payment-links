import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../src/configure-app';

const CREATE = `mutation {
  createPaymentLink(input: { amount: "1", currency: "AED", idempotencyKey: "k" }) { id }
}`;

const PAY = `mutation Pay($input: PayLinkInput!) {
  payLink(input: $input) { id }
}`;

// A valid UUID that no payment link uses.
const MISSING_LINK_ID = '00000000-0000-4000-8000-000000000000';

interface GqlBody {
  errors?: { extensions?: { code?: string } }[];
}

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Importing AppModule runs environment validation, so these have to be
    // set before the import happens.
    process.env.THROTTLE_LIMIT = '3';
    process.env.THROTTLE_TTL_MS = '60000';
    const { AppModule } = await import('../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks the fourth attempt with RATE_LIMITED', async () => {
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', 'Bearer wrong-key')
        .send({ query: CREATE })
        .expect(200);
      codes.push((res.body as GqlBody).errors?.[0]?.extensions?.code);
    }

    expect(codes).toEqual([
      'UNAUTHENTICATED',
      'UNAUTHENTICATED',
      'UNAUTHENTICATED',
      'RATE_LIMITED',
    ]);
  });

  it('limits the public payLink mutation too', async () => {
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: PAY,
          variables: {
            input: {
              paymentLinkId: MISSING_LINK_ID,
              idempotencyKey: `pay-${i}`,
            },
          },
        })
        .expect(200);
      codes.push((res.body as GqlBody).errors?.[0]?.extensions?.code);
    }

    expect(codes).toEqual([
      'PAYMENT_LINK_NOT_FOUND',
      'PAYMENT_LINK_NOT_FOUND',
      'PAYMENT_LINK_NOT_FOUND',
      'RATE_LIMITED',
    ]);
  });

  it.each(['/health/live', '/health/ready', '/metrics'])(
    '%s stays available beyond the limit',
    async (path) => {
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer()).get(path).expect(200);
      }
    },
  );
});
