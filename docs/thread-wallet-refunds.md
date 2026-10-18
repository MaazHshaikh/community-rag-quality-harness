# Customer wants a refund on an old wallet payment

**Doc type:** Discussion thread
**Date:** 2026-09-24

**Nora Klein** (owner, Fernhollow, handmade ceramics):
A customer paid with a mobile wallet 45 days ago and asked for a refund because the vase arrived cracked. The refund button in the dashboard is greyed out. Is this a bug?

**Bilal Chaudhry** (developer, Chaibox, tea subscriptions):
Strange. I thought wallet payments could be refunded for 60 days, so it should still work. Maybe try the API instead of the dashboard?

**Amara Eze** (support lead, Lagoonleaf, skincare):
Bilal, I think that's out of date. The Refunds and Disputes page says mobile wallet payments have a 30-day refund window. Cards have 180 days and bank transfers 90, which might be where the confusion comes from. At 45 days, Nora's payment is past the window, so the API won't allow it either. What you can do is send the money back as a separate payout to the customer's mobile wallet. It costs $0.50 and arrives within 30 minutes.

**Bilal Chaudhry:**
You're right, I was mixing it up with another provider. Thanks for correcting me.

**Sami Haddad** (operations manager, Tealbridge, kitchenware):
A few more things for next time. Wallet refunds support partial amounts, so if only part of an order is damaged, you don't have to refund all of it. Wallet refunds also reach the customer within 24 hours, much faster than cards. And note that ZoisPay doesn't return the original processing fee when you refund, so you lose the 2.2% plus 20 cents either way.

**Nora Klein:**
That explains it. I'll send the payout today. For future orders, I'll ask customers to report damage within a week, so we stay well inside the 30 days.

**Amara Eze:**
Good plan. If a customer ever opens a dispute with their wallet provider instead, you'll have 10 days to respond, and there's a $5 fee. A quick refund is usually cheaper than a dispute.
