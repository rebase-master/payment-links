# ADR 0001 — The money path: idempotency, atomicity, and the ledger

Status: Accepted

## Context

Paying a payment link moves money, and two failure modes dominate the design:
paying **twice** (a network retry, an impatient second tap, a provider
re-delivery) and a **partial write** (the ledger recorded but the downstream
event lost, or an event emitted for money that never actually moved). Both are
unacceptable, so the first constraint is correctness around money — not
throughput or convenience.

## Decisions

**1. Money is integer minor units (`BigInt`).** Amounts are `BIGINT` columns and
`bigint` in code — never floats. At the API boundary they are serialized as
decimal strings, which is also what lets an idempotency response be stored as
JSON and what avoids the GraphQL 53-bit `Int` limit.

**2. Idempotency is a property of the database, not the application.** Each
money-moving call carries a client key. The claim is a single
`INSERT ... ON CONFLICT (scope, key) DO NOTHING RETURNING id` inside the payment
transaction: the unique index decides the race, the application never
reads-then-writes, and `DO NOTHING` (rather than a caught unique-violation,
which would abort the transaction) lets a duplicate read back and replay the
stored response. Same key with a different request hash is rejected, not
silently replayed.

**3. One transaction for the whole effect.** The idempotency claim, the payment
row, the ledger entries, the link's status change, and the outbox row all commit
together or not at all. There is no window in which money moved but the event
was lost, or vice versa.

**4. Double payment is stopped by an atomic status transition.** Idempotency
only dedupes retries of the *same* key. Two *different* keys paying the same link
concurrently are stopped by flipping the link `ACTIVE → PAID` with a guarded
`UPDATE ... WHERE id = ? AND status = 'ACTIVE'` whose affected-row count must be
1; the loser is rejected and its transaction rolls back.

**5. Double-entry, append-only ledger.** Every payment posts two balanced
entries — debit the platform clearing account, credit the merchant's balance —
each a positive amount whose sign is carried by a `direction`. A database trigger
refuses `UPDATE`/`DELETE`/`TRUNCATE` on `ledger_entries`, so history cannot be
rewritten even by a future bug.

**6. Transactional outbox for downstream events.** The `payment.succeeded` event
is written to an outbox table in the same transaction as the money. A relay
(later phase) drains unpublished rows to Kafka. This is the standard fix for the
dual-write problem between a database and a message broker.

**7. The tenant boundary is server-set.** A merchant is resolved from a hashed
API key and attached to the request; `createPaymentLink` uses that merchant,
never a client-supplied id. Paying a link is public (a customer only holds the
link).

## Consequences

- Concurrent duplicate payments serialize on the unique index and the row lock —
  correct, at the cost of some contention on a single hot link.
- A *failed* payment (e.g. a link that is no longer active) rolls back its
  idempotency claim, so a retry re-checks rather than replaying a failure. Only
  successful effects are cached.
- Native Postgres `CHECK` constraints, the append-only trigger, and partial
  unique indexes are enforced by the database, so the invariants survive a buggy
  or entirely different client.
- `payLink` settles synchronously against a **mock provider** — no real money
  moves, and as a public mutation it is currently unthrottled. A real
  `PaymentProvider` port and rate limiting arrive with the webhook phase.
- Deferred to their own phases: the outbox → Kafka relay, provider-webhook
  ingestion (HMAC + dedupe), and a generic journal table for adjustments.
