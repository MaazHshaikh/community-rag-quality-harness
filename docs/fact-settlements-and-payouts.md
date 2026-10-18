# Settlements and Payouts

**Doc type:** Fact sheet
**Date:** 2026-09-01

A **settlement** is when money from a successful payment becomes available in a merchant's ZoisPay balance. A **payout** sends available money from the balance to a bank account or mobile wallet, either the merchant's own or a third party's, such as a customer.

## Settlement timing

| Payment method | Funds available after |
|---|---|
| Cards | 2 business days (T+2) |
| Mobile wallets | 1 business day (T+1) |
| Bank transfers | 1 business day after the transfer is confirmed |
| Direct carrier billing | 30 calendar days (T+30) |

Carrier billing settles slowly because carriers first collect the money through the customer's phone bill.

## Payout schedules

Merchants choose one of three schedules:

- **Daily** (default): every business day, ZoisPay pays out the full available balance.
- **Weekly**: every Monday.
- **Manual**: the merchant requests each payout from the dashboard or API.

The daily cutoff is **14:00 UTC**. Payouts requested after the cutoff are sent the next business day. Bank payouts arrive in 1 to 2 business days. Mobile wallet payouts arrive within 30 minutes.

The **$25 minimum** (or the equivalent in the settlement currency) applies only to scheduled payouts. Smaller balances roll over to the next scheduled payout. Manual, instant, and third-party payouts have no minimum.

## Instant payouts

Instant payouts arrive within 30 minutes, at any time of day, including weekends. They become available after a merchant has processed live payments for **60 days**. The limit is **$10,000 per day**. The fee is listed on the Pricing and Fees page.

## Reserves

ZoisPay holds part of each settlement as a reserve to cover future refunds and disputes.

- **New merchants:** 10% of each settlement is held for 90 days. This rolling reserve applies during the first 6 months after going live.
- **High-risk categories** (online gaming, digital goods sold through carrier billing, and travel): 15% is held for 120 days, with no end date.
- **Dispute monitoring:** merchants placed in the dispute monitoring program move to the 15% reserve until they leave the program.

Reserved money is released automatically on the day each hold period ends.

## Negative balances

If refunds and disputes push a balance below zero, payouts pause. If the balance is still negative after **7 days**, ZoisPay debits the merchant's linked bank account for the shortfall.
