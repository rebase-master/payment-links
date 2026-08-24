import { createHmac } from 'node:crypto';

// HMAC-SHA256 keyed by the pepper — the standard keyed-hash construction. A
// fast hash (not bcrypt) is correct here because API keys are 256-bit random
// tokens, not low-entropy passwords; the pepper is defence-in-depth against a
// bare DB read.
//
// Single source of truth for the algorithm: the live service, the dev seed,
// and tests must all resolve to the same hash for the same (key, pepper), or
// a seeded key silently stops resolving. Call this everywhere instead of
// re-deriving the formula.
export function hashApiKey(apiKey: string, pepper: string): string {
  return createHmac('sha256', pepper).update(apiKey).digest('hex');
}
