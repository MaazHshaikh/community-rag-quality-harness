# Checklist for going live from sandbox?

**Doc type:** Discussion thread
**Date:** 2026-10-06

**Lina Petrova** (developer, Saffronlane, recipe meal kits):
Our integration works in the sandbox and we want to launch next week. What did you wish you'd known when you switched to live?

**Marco Bianchi** (freelance payments developer):
Here's my checklist. First, apply for live keys early. Business verification takes 2 to 3 business days, and live keys start with `zp_live_` instead of `zp_test_`. Second, register your webhook endpoint again for live. Sandbox and live endpoints are configured separately, and forgetting this is the most common launch-day bug I see. Third, remove any test amounts ending in .51, .52, or .53 from your fixtures. In live mode they're just normal prices.

**Aisha Rahman** (finance manager, Kilnworks, pottery supplies):
Plan your cash flow too. New merchants have a 10% reserve held for 90 days during the first 6 months, so your first payouts will be smaller than your sales. Cards settle in 2 business days, so with daily payouts your first money arrives later than you might expect. We nearly missed a supplier payment in our first month.

**Marco Bianchi:**
Good point. And instant payouts aren't available until you've processed live payments for 60 days, so you can't rely on them at launch.

**Joon-ho Park** (engineer, Gridfare, event ticketing):
One more: load test against your expected peak. The sandbox only allows 25 requests per second, but live allows 100, so a sandbox test can't show you whether your own code keeps up at live volume. We had a launch-day queue backlog because our sandbox tests never got close to real traffic. Also, send a `ZoisPay-Version` header and pin it, so an API update doesn't change behaviour under you.

**Lina Petrova:**
This is exactly what I needed. Applying for live keys today, then webhooks, fixtures, and a cash-flow plan for the reserve.

**Aisha Rahman:**
Good luck with the launch. Watch your dispute rate in the first few months too: above 0.9% puts you in the monitoring program and raises the reserve to 15%.
