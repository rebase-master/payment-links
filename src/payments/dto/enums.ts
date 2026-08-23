import { registerEnumType } from '@nestjs/graphql';
import { PaymentLinkStatus, PaymentStatus } from '../../generated/prisma/enums';

// Expose the Prisma enums as GraphQL enums so the schema documents the exact
// set of values instead of an opaque String. Importing this module registers
// them (a side effect), so the DTO files import the enums from here.
registerEnumType(PaymentLinkStatus, {
  name: 'PaymentLinkStatus',
  description: 'Lifecycle state of a payment link.',
});
registerEnumType(PaymentStatus, {
  name: 'PaymentStatus',
  description: 'State of a payment attempt.',
});

export { PaymentLinkStatus, PaymentStatus };
