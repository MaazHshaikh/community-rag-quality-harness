# API and Integration

**Doc type:** Fact sheet
**Date:** 2026-08-20

ZoisPay offers two integration options. **Hosted checkout** redirects the customer to a ZoisPay payment page that supports all four payment methods. A hosted checkout session expires after **30 minutes**. The **direct API** lets merchants build their own payment form. Collecting raw card data directly requires the merchant to complete the full PCI DSS SAQ D questionnaire. Hosted checkout only requires SAQ A.

## Keys and environments

Sandbox keys start with `zp_test_` and live keys start with `zp_live_`. Live keys are issued after business verification, which takes 2 to 3 business days.

Every request should send a `ZoisPay-Version` header. Each API version is supported for 12 months after a newer version replaces it.

## Rate limits

- **Live:** 100 requests per second per account.
- **Sandbox:** 25 requests per second per account.
- **Payouts endpoint:** 10 requests per second, in both environments.

Requests over the limit receive HTTP **429** with a `Retry-After` header giving the number of seconds to wait.

## Idempotency keys

All POST requests accept an `Idempotency-Key` header of up to 255 characters. ZoisPay stores each key for **24 hours**.

- Same key, same request body: ZoisPay returns the original response without processing the request again.
- Same key, different body: ZoisPay returns HTTP **422** with the error `idempotency_mismatch`.

A retry of a declined payment is a new attempt and needs a new key. Reusing the old key returns the original decline.

## Webhooks

Each webhook event is signed with HMAC-SHA256 in the `ZoisPay-Signature` header. Merchants should reject events with a timestamp older than **5 minutes**.

The endpoint must return a 2xx status within **10 seconds**. Otherwise ZoisPay retries the event after 1 minute, 5 minutes, 30 minutes, 2 hours, 8 hours, and 24 hours: **6 retries over about 35 hours**. After the last retry fails, the event is marked failed and can be resent from the dashboard for 30 days. An endpoint that fails every delivery for 5 days in a row is disabled, and the account owner is emailed.

Events can arrive more than once and out of order. Merchants should deduplicate by event ID.

## Sandbox test amounts

In the sandbox, the amount's last two digits trigger outcomes: **.51** declines for insufficient funds, **.52** times out, and **.53** requires 3-D Secure.
