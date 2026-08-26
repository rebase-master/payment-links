# payment-links

A small backend service where a merchant creates a payment link, a customer pays it, a payment provider confirms the payment through a webhook, and that confirmation is propagated to other services. It is built with the stack from Ziina's Backend Engineer role — TypeScript, Nest.js, PostgreSQL, GraphQL, and Kafka — and treats correctness around money as its first constraint.

It is the applied companion to [account-ledger-core](https://github.com/rebase-master/account-ledger-core), a separate repository that works out the ledger logic on its own: money as integer minor units, append-only entries, and value-dated corrections. Where that project is the reasoning in isolation, this one puts the same reasoning inside a running service.

## Status

Built and covered by tests today:

- Merchant API-key auth (HMAC-SHA256 lookup) and the GraphQL API: `createPaymentLink`, `paymentLink`, `payLink`
- The money path, inside one Postgres transaction: database-enforced idempotency, an atomic `ACTIVE → PAID` transition, balanced double-entry ledger entries, and a transactional-outbox write
- Operational plumbing: correlation-id logging, liveness/readiness checks, Prometheus metrics

Planned next:

- Provider webhook ingestion behind a `PaymentProvider` port — today `payLink` settles synchronously against a mock provider (the `provider_events` table and its dedupe key are already in the schema)
- The outbox relay that drains events to Kafka, and a consumer building a read model from them
- Rate limiting on the public `payLink` mutation

The architecture below shows the target; the design notes mark the planned pieces.

## Architecture

![Payment link request lifecycle](diagrams/paylink-request-lifecycle.png)

In the target architecture, a request arrives either through the GraphQL API, where a merchant acts on their own links, or through a webhook, where a payment provider confirms a payment. Both funnel into one payments service that does its work inside a single database transaction and defers any asynchronous follow-up to an outbox. A relay drains that outbox to Kafka, and downstream consumers build their own read models from the resulting events. The webhook path, the relay, and the consumer are the pieces still to come.

For a detailed walk of what's already built — one `payLink` request through the transaction, including the idempotency claim, the double-pay guard, and where the not-yet-built pieces pick up — see [diagrams/paylink-request-lifecycle.svg](diagrams/paylink-request-lifecycle.svg) (also available as [PNG](diagrams/paylink-request-lifecycle.png)).

## Design notes

**Idempotency.** Creating or paying a link is safe to retry. Each request carries an idempotency key that the service stores before it does any work, so a duplicate request — a network retry, an impatient second tap — returns the original outcome instead of repeating the effect.

**Transactional outbox.** When a payment is recorded, the ledger entries and the event that announces the payment are committed together, in the same transaction; a relay — not yet built — then publishes those events afterwards. This closes the gap in the naive approach, where writing to the database and publishing to Kafka are two separate steps and a failure between them either loses an event or invents one.

**Webhook verification (planned).** When provider callbacks land, they will be verified against the raw request body before being trusted, survive a rotation of the signing secret, and ignore repeat deliveries. Their responses will be chosen so that a provider retries only when retrying could actually change the outcome.

**Observability.** Every request is logged with a correlation id, health is exposed as separate liveness and readiness checks, and operational counters are published in Prometheus format. The service is meant to be watched in production, not only to pass its tests.

## Project structure

The code is organised by domain rather than by technical layer. Each area — auth, payments, idempotency, the outbox — is its own Nest module, and cross-cutting concerns such as configuration, database access, logging, health checks, and metrics live in their own modules and are shared through dependency injection. Webhook ingestion and the outbox relay will arrive as modules of the same shape.

## Running locally

```bash
npm install
cp .env.example .env
docker compose up -d      # PostgreSQL
npm run db:generate       # generate the Prisma client
npm run db:migrate        # apply migrations (seeding is a separate, explicit step in Prisma 7)
npm run db:seed           # seed the database
npm run start:dev
```

- `npm test` — unit tests, no database required
- `npm run test:e2e` — end-to-end tests against the app; requires Postgres running, migrated, and seeded (`npm run db:seed`)
- `POST /graphql` — the GraphQL API. `createPaymentLink` requires `Authorization: Bearer <api key>` (the seeded dev merchant's key is `pl_test_acme_dev_key`); `paymentLink` and `payLink` are public. See [docs/api/create-payment-link.md](docs/api/create-payment-link.md) for a full request/response walkthrough.
- `GET /health/live`, `GET /health/ready` — liveness, and readiness (which checks the database)
- `GET /metrics` — Prometheus-format metrics. Scrape from an internal network only; it exposes process internals and should not sit behind the public ingress.

## Deliberately out of scope

Redis, Elasticsearch, Kubernetes, and Terraform are part of the target stack but are intentionally left out. Nothing here is read-heavy enough to warrant a cache, there is no search surface to index, and the orchestration and infrastructure-as-code layers are better demonstrated against a real deployment than mocked up in a sample.
