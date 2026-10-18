# Eval Report: 2026-10-18T19-33-51-581Z

**Quality score: 88.1 / 100** (75% fact recall + 25% source recall)

## Run

| Field | Value |
|---|---|
| Commit | 13e29a4 |
| Chat model | llama3.2:3b, temperature 0.2 |
| Embedding model | nomic-embed-text |
| Answer prompt | 2df73b108e32 |
| Golden dataset | 17217ca2d167 |
| Judge prompt | not judged |
| Started | 2026-10-18T19:33:51.581Z |
| Questions | 30 |

## Scores by category

| Category | Questions | Errors | Quality | Fact recall | Source recall | Refusals |
|---|---|---|---|---|---|---|
| single_fact | 20 | 0 | 91.3 | 90.0% | 95.0% | 0.0% |
| multi_doc | 5 | 0 | 87.5 | 90.0% | 80.0% | 0.0% |
| conflict | 5 | 0 | 76.2 | 68.3% | 100.0% | 0.0% |
| **overall** | 30 | 0 | 88.1 | 86.4% | 93.3% | 0.0% |

## Safety flags

No forbidden facts found in any answer.

## 5 lowest-scoring questions

| ID | Quality | Missing facts | Missing sources | Answer excerpt |
|---|---|---|---|---|
| single-05 | 25 | $5 | none | According to the community docs, the most ZoisPay will charge in fees for a single bank transfer payment is $0.25 per payout, as stated in the Payout fees… |
| single-07 | 25 | 6 settlement currencies | none | The context does not contain information about the number of settlement currencies ZoisPay supports. |
| conflict-05 | 50 | Omar, 30 days | none | The views on whether direct carrier billing is worth the 12% fee are divided. Zara Sheikh, founder of Pixelpond, sees it as a viable option for her business,… |
| multi-03 | 50 | 1% | fact-pricing-and-fees.md | According to the community, the cost of an instant payout is not explicitly stated in the provided context. However, it is mentioned that the fee is listed on… |
| conflict-03 | 75 | 72% | none | The views on this topic are: * **Fatima Al-Mansoori** and **Maya Oduya** suggest that redirecting customers to hosted checkout might hurt checkout completion,… |

## Judge scores (advisory)

Not judged. Run `npm run eval:judge` (about 50 minutes) to add LLM-judge scores.
