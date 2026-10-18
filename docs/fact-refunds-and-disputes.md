# Refunds and Disputes

**Doc type:** Fact sheet
**Date:** 2026-09-15

## Refunds

Each payment method has its own refund window, counted from the date of the original payment.

| Payment method | Refund window | Partial refunds | Time to reach the customer |
|---|---|---|---|
| Cards | 180 days | Yes | 5 to 10 business days |
| Mobile wallets | 30 days | Yes | Within 24 hours |
| Bank transfers | 90 days | Yes | 1 to 3 business days |
| Direct carrier billing | 7 days | No, full refunds only | Next phone bill cycle |

Refunds are free to issue, but the original processing fee is not returned. If the payment involved currency conversion, the refund is converted at the rate on the day of the refund, so the amount in the merchant's settlement currency may differ from the original.

A refund is deducted from the merchant's ZoisPay balance. If the balance is too low, the refund stays pending for up to 5 days and then fails.

After the refund window closes, the payment can't be refunded through ZoisPay. Merchants who still want to return money can send it as a separate payout.

## Disputes

**Card chargebacks**
- Fee: **$15** per chargeback. The fee is not returned, even if the merchant wins.
- Evidence deadline: **7 calendar days** from the dispute notification.
- The disputed amount and the fee are deducted from the balance immediately and returned only if the merchant wins.

**Mobile wallet disputes**
- Fee: **$5** per dispute.
- Evidence deadline: **10 calendar days**.

**Bank transfers** have no dispute process. Fraud claims are reviewed case by case.

**Direct carrier billing** has no dispute process. Carriers can still reverse a payment for up to 60 days, and the amount is deducted from the next settlement.

Merchants who miss an evidence deadline lose the dispute automatically.

## Dispute rate limits

The dispute rate is the number of disputes in a calendar month divided by the number of successful payments in that month.

- Above **0.9%**: the merchant enters the dispute monitoring program, and its reserve rises to 15%.
- Above **1.5%** for 2 months in a row: ZoisPay may suspend the account.

Merchants leave the monitoring program after 3 months in a row below 0.9%.
