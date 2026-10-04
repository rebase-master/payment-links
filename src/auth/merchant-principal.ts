import type { Merchant } from '../generated/prisma/client';

// What an authenticated request knows about its merchant. Deliberately not
// the full row: apiKeyHash must never travel past the auth layer.
export type MerchantPrincipal = Pick<Merchant, 'id' | 'name'>;
