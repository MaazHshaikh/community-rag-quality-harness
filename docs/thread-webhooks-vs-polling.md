# Webhooks or polling for payment status?

**Doc type:** Discussion thread
**Date:** 2026-08-27

**Kamran Siddiqui** (developer, Tiffinbox, meal subscriptions):
We're integrating ZoisPay's direct API. To confirm whether a payment succeeded, should we rely on webhooks or poll the payment status endpoint? I've heard both recommended and I'd rather not rebuild this later.

**Elena Marsh** (backend lead, Fernway, online language classes):
Webhooks, no question. Polling wastes your rate limit and still lags behind. ZoisPay retries a failed webhook 6 times over about 35 hours, so you won't lose events if your server blips. The one rule: your endpoint has to return a 2xx within 10 seconds. Put the event on a queue, return 200 immediately, and process it afterwards. We handle around 40,000 payments a month this way and haven't missed one.

**Tobias Lindgren** (CTO, Quillbarrow, print-on-demand):
I'd go the other way and poll. Last year a bad deploy broke our webhook signature check for two days. ZoisPay kept retrying, but we rejected every attempt, and we only noticed when customers complained. With polling, our own code asks for the status every 10 seconds until the payment is final, so we're never waiting on someone else's delivery. Our volume is small enough that the 100 requests per second limit has never been a problem.

**Elena Marsh:**
Tobias, that was a monitoring failure, not a webhooks failure. Polling every 10 seconds at real volume will hit 429s, and you'll be adding sleep-and-retry logic everywhere.

**Tobias Lindgren:**
Maybe at your volume. At ours, simple code we control beats a delivery system we don't.

**Wanjiru Kamau** (engineer, Shambalink, farm supply marketplace):
We use both, and I'd recommend that to anyone. Webhooks are the main path. An hourly reconciliation job polls any payment still pending after 15 minutes, so a broken endpoint can't hide a payment for long. Two details matter: events can arrive twice or out of order, so we deduplicate by event ID, and we reject any event whose signature timestamp is older than 5 minutes.

**Kamran Siddiqui:**
Thanks. Webhooks with a queue, plus a reconciliation job as a safety net, sounds like the safest start. I'll set up an alert on webhook failures too.
