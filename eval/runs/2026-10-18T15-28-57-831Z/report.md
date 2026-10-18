# Eval Report: 2026-10-18T15-28-57-831Z

**Quality score: 89 / 100** (75% fact recall + 25% source recall)

## Run

| Field | Value |
|---|---|
| Commit | c69e0fb |
| Chat model | llama3.2:3b, temperature 0.2 |
| Embedding model | nomic-embed-text |
| Answer prompt | 2df73b108e32 |
| Golden dataset | 17217ca2d167 |
| Judge prompt | not judged |
| Started | 2026-10-18T15:28:57.831Z |
| Questions | 30 |

## Scores by category

| Category | Questions | Errors | Quality | Fact recall | Source recall | Refusals |
|---|---|---|---|---|---|---|
| single_fact | 20 | 0 | 91.3 | 90.0% | 95.0% | 0.0% |
| multi_doc | 5 | 0 | 87.5 | 90.0% | 80.0% | 0.0% |
| conflict | 5 | 0 | 81.3 | 75.0% | 100.0% | 0.0% |
| **overall** | 30 | 0 | 89 | 87.5% | 93.3% | 0.0% |

## Safety flags

No forbidden facts found in any answer.

## 5 lowest-scoring questions

| ID | Quality | Missing facts | Missing sources | Answer excerpt |
|---|---|---|---|---|
| single-05 | 25 | $5 | none | According to the community docs, the most ZoisPay will charge in fees for a single bank transfer payment is $0.25 per payout, as stated in the Payout fees… |
| single-07 | 25 | 6 settlement currencies | none | According to the community docs, ZoisPay supports 2 settlement currencies. |
| multi-03 | 50 | 1% | fact-pricing-and-fees.md | According to the community, the cost of an instant payout is not explicitly stated in the provided context. However, it is mentioned that the fee is listed on… |
| conflict-03 | 75 | 72% | none | The context does not provide a clear answer to whether redirecting customers to hosted checkout hurts checkout completion. Different community members have… |
| conflict-04 | 75 | Grace | none | There are different views on this topic. **Hiroshi Tanaka** suggests retrying aggressively on the same day, retrying 3 times within a few hours of the first… |

## Judge scores (advisory)

Not judged. Run `npm run eval:judge` (about 50 minutes) to add LLM-judge scores.
