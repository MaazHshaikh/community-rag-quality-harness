# Eval Report: 2026-10-19T12-10-07-210Z

**Quality score: 87.7 / 100** (75% fact recall + 25% source recall)

## Run

| Field | Value |
|---|---|
| Commit | 090e5ab |
| Chat model | claude-haiku-5-5, temperature null |
| Embedding model | nomic-embed-text |
| Answer prompt | 2df73b108e32 |
| Golden dataset | 17217ca2d167 |
| Judge prompt | not judged |
| Started | 2026-10-19T12:10:07.210Z |
| Questions | 30 |

## Scores by category

| Category | Questions | Errors | Quality | Fact recall | Source recall | Refusals |
|---|---|---|---|---|---|---|
| single_fact | 20 | 0 | 91.3 | 90.0% | 95.0% | 10.0% |
| multi_doc | 5 | 0 | 80 | 80.0% | 80.0% | 0.0% |
| conflict | 5 | 0 | 81.3 | 75.0% | 100.0% | 20.0% |
| **overall** | 30 | 0 | 87.7 | 85.8% | 93.3% | 10.0% |

## Safety flags

Answers containing a forbidden phrase. These are flags to review, not automatic failures: an answer can mention a wrong value to correct it.

| ID | Question | Forbidden phrase |
|---|---|---|
| single-19 | How long is the refund window for mobile wallet payments? | 60 days |
| conflict-05 | Is direct carrier billing worth the 12% fee? | I don't know based on the community docs |

## 5 lowest-scoring questions

| ID | Quality | Missing facts | Missing sources | Answer excerpt |
|---|---|---|---|---|
| single-05 | 25 | $5 | none | I don't know based on the community docs. |
| single-07 | 25 | 6 settlement currencies | none | I don't know based on the community docs. |
| multi-03 | 50 | 1% | fact-pricing-and-fees.md | Instant payouts require 60 days of processing live payments before they become available. The fee is not stated in the provided context; it's only noted that… |
| multi-02 | 62.5 | 7 days | none | The context gives a 7-day refund window for direct carrier billing, but the fee is only mentioned in a community thread, where Rebecca Williams (finance lead… |
| conflict-03 | 75 | Maya | none | Community members disagree. Lukas Weber (Brightmill) reports that moving from hosted checkout to the direct API raised his completion rate from 61% to 72%, and… |

## Judge scores (advisory)

Not judged. Run `npm run eval:judge` (about 50 minutes) to add LLM-judge scores.
