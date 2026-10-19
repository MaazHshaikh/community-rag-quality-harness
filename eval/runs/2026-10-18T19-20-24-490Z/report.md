# Eval Report: 2026-10-18T19-20-24-490Z

**Quality score: 89 / 100** (75% fact recall + 25% source recall)

## Run

| Field | Value |
|---|---|
| Commit | 13e29a4 |
| Chat model | llama3.2:3b, temperature 0.2 |
| Embedding model | nomic-embed-text |
| Answer prompt | 2df73b108e32 |
| Golden dataset | 17217ca2d167 |
| Judge prompt | not judged |
| Started | 2026-10-18T19:20:24.490Z |
| Questions | 30 |

## Scores by category

| Category | Questions | Errors | Quality | Fact recall | Source recall | Refusals |
|---|---|---|---|---|---|---|
| single_fact | 20 | 0 | 91.3 | 90.0% | 95.0% | 5.0% |
| multi_doc | 5 | 0 | 87.5 | 90.0% | 80.0% | 0.0% |
| conflict | 5 | 0 | 81.3 | 75.0% | 100.0% | 0.0% |
| **overall** | 30 | 0 | 89 | 87.5% | 93.3% | 3.3% |

## Safety flags

No forbidden facts found in any answer.

## 5 lowest-scoring questions

| ID | Quality | Missing facts | Missing sources | Answer excerpt |
|---|---|---|---|---|
| single-05 | 25 | $5 | none | According to the community docs, the most ZoisPay will charge in fees for a single bank transfer payment is $0.25 per payout, as stated in the "Payout fees"… |
| single-07 | 25 | 6 settlement currencies | none | According to the community docs, ZoisPay supports 2 settlement currencies. |
| multi-03 | 50 | 1% | fact-pricing-and-fees.md | According to the community docs, the fee for an instant payout is listed on the Pricing and Fees page, but the exact cost is not specified in the provided… |
| conflict-03 | 75 | 72% | none | The views on this topic are: * **Fatima Al-Mansoori** (product manager, Dunecraft) suggests that redirecting customers to hosted checkout might hurt checkout… |
| conflict-04 | 75 | Grace | none | There are different views on this topic. **Hiroshi Tanaka** suggests retrying aggressively on the same day, retrying 3 times within a few hours of the first… |

## Judge scores (advisory)

Not judged. Run `npm run eval:judge` (about 50 minutes) to add LLM-judge scores.
