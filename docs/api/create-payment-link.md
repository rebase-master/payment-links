# Creating a payment link

How a merchant creates a payment link via the GraphQL API.

## Endpoint

```
POST /graphql
Content-Type: application/json
Authorization: Bearer <merchant api key>
```

There is no separate REST route — every operation, including this one, goes through the single `/graphql` endpoint as a `createPaymentLink` mutation.

## Authentication

Required. The API key is looked up by its HMAC-SHA256 hash (see [`ApiKeyService`](../../src/auth/api-key.service.ts)); an invalid or missing key fails the whole request before any input is read, with GraphQL error code `UNAUTHENTICATED`.

In a local dev environment seeded with `npm run db:seed`, the demo merchant's key is `pl_test_acme_dev_key`.

## Request

```graphql
mutation CreateLink($input: CreatePaymentLinkInput!) {
  createPaymentLink(input: $input) {
    id
    status
    amount
    currency
    description
    reference
    expiresAt
    createdAt
  }
}
```

### `CreatePaymentLinkInput` fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | `String!` | yes | Minor units (e.g. fils, cents) as a positive integer string, e.g. `"5000"` for 50.00 |
| `currency` | `String!` | yes | 3-letter ISO code, e.g. `"AED"`. Must have a platform clearing account configured, or the request fails with `UNSUPPORTED_CURRENCY` |
| `idempotencyKey` | `String!` | yes | 1–200 chars, client-generated. Retrying with the same key returns the original link instead of creating a duplicate — see below |
| `description` | `String` | no | Max 255 chars |
| `reference` | `String` | no | Max 80 chars — your own order/invoice reference |
| `expiresAt` | `String` | no | Must be a future ISO date-time string, or the field is rejected |

## Example

```bash
curl http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pl_test_acme_dev_key" \
  -d '{
    "query": "mutation CreateLink($input: CreatePaymentLinkInput!) { createPaymentLink(input: $input) { id status amount currency createdAt } }",
    "variables": {
      "input": {
        "amount": "5000",
        "currency": "AED",
        "description": "Invoice #1042",
        "idempotencyKey": "merchant-generated-key-001"
      }
    }
  }'
```

### Success

`200 OK`, with the new link under `data`:

```json
{
  "data": {
    "createPaymentLink": {
      "id": "b2b5e2b0-....-uuid",
      "status": "ACTIVE",
      "amount": "5000",
      "currency": "AED",
      "createdAt": "2026-08-25T10:15:00.000Z"
    }
  }
}
```

### Errors

GraphQL always responds `200 OK`; failures appear in the `errors` array, with a stable machine-readable `extensions.code`:

| `extensions.code` | Cause |
|---|---|
| `UNAUTHENTICATED` | Missing or invalid `Authorization` bearer token |
| `BAD_USER_INPUT` / `GRAPHQL_VALIDATION_FAILED` | Input fails validation (bad amount format, malformed currency, key too long, `expiresAt` not in the future, etc.) |
| `UNSUPPORTED_CURRENCY` | No platform clearing account exists for the given `currency` |
| `IDEMPOTENCY_KEY_CONFLICT` | The same `idempotencyKey` was already used with a *different* request body — regenerate the key for genuinely new requests |

```json
{
  "errors": [
    {
      "message": "Currency XYZ is not supported (no clearing account)",
      "extensions": { "code": "UNSUPPORTED_CURRENCY" }
    }
  ]
}
```

## Idempotency

`idempotencyKey` is scoped per-merchant, not global. Sending the same key twice returns the *same* link rather than creating a second one — safe for network retries or a double-tapped submit button. Generate a fresh key (e.g. a UUID) per genuinely new payment link; reuse a key only when retrying an attempt that may not have completed.

## See also

- `paymentLink(id: ID!)` — public query to look up a link by id (no auth required)
- `payLink(input: PayLinkInput!)` — the customer-facing mutation that pays a link; unauthenticated, since the payer is not the merchant
