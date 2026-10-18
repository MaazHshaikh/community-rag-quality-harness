# How should we retry failed subscription payments?

**Doc type:** Discussion thread
**Date:** 2026-09-09

**Daniel Okafor** (founder, Gymflow, fitness class subscriptions):
About 8% of our monthly card renewals fail. Right now we try once and then email the customer. What retry strategy works best with ZoisPay?

**Hiroshi Tanaka** (engineer, Brewlane, coffee subscriptions):
Retry aggressively on the same day. We retry 3 times within a few hours of the first failure, and that recovers about 40% of failed renewals. Most failures are temporary, like a bank's fraud system being cautious, and customers tend to fix their balance quickly. Also, reuse the same idempotency key on every retry so you can never charge a customer twice.

**Grace Mwangi** (payments lead, Sokoni Box, grocery delivery):
Both of those are risky. First, the idempotency key: ZoisPay stores a key for 24 hours and returns the original response for the same key. If you reuse it within 24 hours, you don't get a new attempt. You just get the original decline back. Each retry needs a new key. Second, same-day retries mostly fail for the same reason. We retry on days 1, 3, and 5 after the failure, and never retry hard declines such as a stolen or closed card. Our recovery rate is about 55%.

**Hiroshi Tanaka:**
Good catch on the key, we'll fix that. But I'm not convinced about waiting days. Our numbers on same-day retries are solid, and waiting means the customer loses access in the meantime.

**Grace Mwangi:**
Then keep access open for a short grace period. Hammering a card several times in one day also looks suspicious to issuing banks.

**Rohan Pillai** (developer, Notewell, note-taking app):
Whatever schedule you pick, spread retries out across the day instead of firing them all at midnight. We triggered 429 errors by retrying 3,000 renewals at once. Live accounts are limited to 100 requests per second, and the response includes a Retry-After header, so respect it.

**Daniel Okafor:**
Thanks, all. We'll use a new idempotency key per attempt, skip hard declines, and spread retries out. I'll compare same-day retries against a day 1, 3, 5 schedule on half our customers each.
