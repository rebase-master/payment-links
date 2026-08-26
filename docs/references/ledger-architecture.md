# Reference: ledger & clearing-account architecture

Supporting research for the account model in [ADR 0001](../adr/0001-money-path.md) —
specifically the `PLATFORM_CLEARING` / `MERCHANT_BALANCE` split in
[`schema.prisma`](../../prisma/schema.prisma) (`Account.merchantId` nullable,
partial unique index `accounts_platform_clearing_unique`). Confirms the split
against how real ledger systems, payment platforms, and banks structure money
movement, and where this repo's implementation is a deliberate simplification.

## Ledger fundamentals: the invariants a production ledger holds

A production ledger is generally held to four invariants: sum-to-zero postings
(debits = credits per transaction), append-only entries, idempotent writes,
and balances *derived* from postings rather than stored as a column. This repo
implements three directly — the `ledger_entries` append-only trigger, the
idempotency service, and an `Account` model with no `balance` column — and
documents the fourth (sum-to-zero) as enforced by service-code discipline, not
the database, per ADR 0001's Consequences section.

- [Core Banking System Architecture: Reference Model — Formance](https://www.formance.com/blog/financial-operations/core-banking-system-architecture)
- [Double-Entry Accounting — VoPay](https://vopay.com/learn/double-entry-accounting/)
- [Subledger vs. general ledger: Why financial institutions need both — SAP Fioneer](https://www.sapfioneer.com/blog/subledger-vs-general-ledger-why-financial-institutions-need-both/)

## Clearing accounts — what `PLATFORM_CLEARING` models

A clearing account is standard terminology for a temporary holding account
that funds pass through in transit, bridging timing gaps and supporting
reconciliation before money reaches its final destination. That's the role of
the single, currency-scoped `PLATFORM_CLEARING` row here.

- [Clearing Accounts Explained: What They Are and How They Work — VoPay](https://vopay.com/learn/clearing-accounts-explained/)

## Omnibus / FBO accounts — what the `merchantId`-null split models

The closer real-world analogue for the two-account-type split: a bank sees one
pooled ("omnibus") account in the platform's name, while the platform's own
ledger tracks each participant's individual share internally, invisible to the
bank. `PLATFORM_CLEARING` (one row, `merchantId = null`) is the pooled account;
the many `MERCHANT_BALANCE` rows are the sub-ledger tracking who owns what
slice of it.

- [Comprehensive Guide to FBO, Omnibus, and OBO Accounts in Financial Services — Faisal Khan](https://faisalkhan.com/knowledge-center/industry-perspective-commentary/comprehensive-guide-to-fbo-omnibus-and-obo-accounts-in-financial-services/)
- [Demand deposit accounts (DDAs) vs. for-benefit-of (FBO) accounts — Mercury](https://mercury.com/blog/demand-depost-accounts-vs-for-benefit-of-accounts)

## Historical precedent: correspondent banking

The same mechanism — paired ledger entries settling a balance with no physical
money movement — predates fintech by decades: nostro/vostro accounts between
correspondent banks work the same way our debit-clearing / credit-merchant-balance
pair does, just at the interbank level.

- [Nostro, Vostro and Loro Accounts: The Clearing Infrastructure Behind Cross-Border Payments — Finextra](https://www.finextra.com/blogposting/30703/nostro-vostro-and-loro-accounts-the-clearing-infrastructure-behind-cross-border-payments)

## Commercial productization: platform/marketplace payments

The scenario this repo models — a platform collecting money from customers and
owing portions of it to many separate merchants — is exactly what Stripe
Connect and Adyen for Platforms sell as infrastructure, under the
payment-facilitator (PayFac) model.

- [Marketplace Payments: Stripe Connect and Adyen for Platforms — Hyperswitch Wiki](https://github.com/juspay/hyperswitch/wiki/Marketplace-Payments:-Split-Payments,-Seller-Payouts,-and-How-Stripe-Connect-and-Adyen-for-Platforms-Work-as-Underlying-Infrastructure)
- [Payfacs: A guide to payment facilitation — Stripe](https://stripe.com/guides/payfacs)

## The regulatory layer this repo doesn't model

Real payment institutions run a second book above the operational ledger:
safeguarded customer funds sit as a matched **asset** (cash at a partner bank)
against a **liability** (amounts owed to customers) on the institution's own
balance sheet, reconciled daily against the operational ledger. This repo
models the operational layer only.

- [Safeguarding requirements for payment institutions and e-money institutions — FCA](https://www.fca.org.uk/firms/emi-payment-institutions-safeguarding-requirements)
- [CBUAE issues a new regulation on Stored Value Facilities](https://www.centralbank.ae/media/4gfbssqb/cbuae-issues-a-new-regulation-on-stored-value-facilities-to-support-the-development-of-digital-payment-services-in-the-uae-en.pdf)
- [Navigating the CBUAE Stored Value Facilities License — Zerafa](https://zerafa.ae/navigating-the-cbuae-stored-value-facilities-license-a-regulatory-overview/)

## See also

- [ADR 0001 — The money path](../adr/0001-money-path.md)
