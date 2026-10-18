# Hosted checkout or direct API?

**Doc type:** Discussion thread
**Date:** 2026-07-30

**Ahmed Raza** (founder, Kitekart, kids' clothing store):
We're a two-person team launching in the UAE and Pakistan. Should we use ZoisPay's hosted checkout page or build our own payment form on the direct API? Our designer wants the checkout to match the rest of the site.

**Maya Oduya** (developer, Lanternleaf, online bookshop):
Use hosted checkout. You get all four payment methods on day one, including carrier billing and wallets, with nothing to build. Compliance is the big reason: hosted checkout only needs PCI SAQ A, while taking raw card data through the direct API puts you on SAQ D, which is hundreds of questions and often an outside assessor. For a two-person team that's months of work for very little gain.

**Lukas Weber** (lead engineer, Brightmill, B2B software subscriptions):
I disagree. We moved from hosted checkout to the direct API and our checkout completion rate went from 61% to 72%. The redirect to another page loses people, especially on mobile. You also control the error messages and retries. Yes, SAQ D is real work, but it's a one-time cost, and the revenue difference pays for it quickly.

**Maya Oduya:**
Lukas, you have an engineering team. Ahmed has two people. An 11-point lift doesn't help if you spend the launch filling in compliance forms.

**Lukas Weber:**
Fair, but don't assume the redirect is free. Measure it.

**Fatima Al-Mansoori** (product manager, Dunecraft, home décor):
There's a middle path. Start on hosted checkout so you can launch quickly, and record your completion rate from week one. If the number disappoints, move to the direct API later with real data behind the decision. One practical tip: hosted checkout sessions expire after 30 minutes, so if customers often leave the tab open, they'll come back to an expired page. We added a "start again" link on our side to handle that.

**Ahmed Raza:**
This helps a lot. We'll launch on hosted checkout, track completion, and handle expired sessions. If the numbers look bad after a few months, we'll revisit the direct API.
