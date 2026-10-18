# Eval Report: 2026-10-18T10-14-35-044Z

**Quality score: 87.1 / 100** (75% fact recall + 25% source recall)

> **Warning:** judge.json was produced with a different golden file than scores.json.

## Run

| Field | Value |
|---|---|
| Commit | ee5836c |
| Chat model | llama3.2:3b, temperature 0.2 |
| Embedding model | nomic-embed-text |
| Answer prompt | 2df73b108e32 |
| Golden dataset | 17217ca2d167 |
| Judge prompt | 775fae122dfc (qwen2.5:7b) |
| Started | 2026-10-18T10:14:35.044Z |
| Questions | 30 |

## Scores by category

| Category | Questions | Errors | Quality | Fact recall | Source recall | Refusals |
|---|---|---|---|---|---|---|
| single_fact | 20 | 0 | 89.4 | 87.5% | 95.0% | 0.0% |
| multi_doc | 5 | 0 | 87.5 | 90.0% | 80.0% | 0.0% |
| conflict | 5 | 0 | 77.5 | 70.0% | 100.0% | 20.0% |
| **overall** | 30 | 0 | 87.1 | 85.0% | 93.3% | 3.3% |

## Safety flags

Answers containing a forbidden phrase. These are flags to review, not automatic failures: an answer can mention a wrong value to correct it.

| ID | Question | Forbidden phrase |
|---|---|---|
| conflict-03 | Does redirecting customers to hosted checkout hurt checkout completion? | I don't know based on the community docs |
| conflict-04 | Should failed subscription payments be retried on the same day or spread over several days? | same idempotency key on every retry |

## 5 lowest-scoring questions

| ID | Quality | Missing facts | Missing sources | Answer excerpt |
|---|---|---|---|---|
| single-05 | 25 | $5 | none | According to the community docs, the most ZoisPay will charge in fees for a single bank transfer payment is $0.25 per payout, as stated in the Payout fees… |
| single-07 | 25 | 6 settlement currencies | none | According to the community docs, ZoisPay supports 2 settlement currencies. |
| conflict-05 | 50 | Omar, 30 days | none | The views on whether direct carrier billing is worth the 12% fee are divided. Zara Sheikh, founder of Pixelpond, sees it as a convenient option for players… |
| multi-03 | 50 | 1% | fact-pricing-and-fees.md | According to the community docs, the fee for instant payouts is listed on the Pricing and Fees page, but the exact cost is not specified in the provided… |
| single-16 | 62.5 | new key | none | According to the community docs, **Grace Mwangi** states that reusing the same idempotency key within 24 hours would result in the original decline being… |

## Judge scores (advisory)

Scores from 1 to 5 by qwen2.5:7b. **Advisory only**: the judge agrees with hand scores on about 2 in 3 scores and sometimes gives wrong reasons (see Judge Calibration in findings.md). The quality score above does not use them.

| Category | Judged | Correctness | Groundedness | Completeness |
|---|---|---|---|---|
| single_fact | 20 | 4.40 | 4.80 | 4.50 |
| multi_doc | 5 | 4.60 | 5.00 | 4.60 |
| conflict | 5 | 3.20 | 3.60 | 3.60 |
| **overall** | 30 | 4.23 | 4.63 | 4.37 |
