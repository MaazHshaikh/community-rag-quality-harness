# Findings Log

Model: llama3.2:3b, temperature 0.2, top-3 retrieval

> **Corpus change (2026-10-18):** F1–F4, R1–R2, and the Excluded entry were found on the old FounderHub corpus, which was replaced by the ZoisPay corpus in `ee5836c`. Their questions refer to docs that no longer exist, so they can't be re-checked against the current app; they stay here as history. The API bugs (B1–B5) are corpus-independent and still apply.

## AI Quality Findings

| # | Question | Answer | Expected | Type | Found | Status |
|---|---|---|---|---|---|---|
| F1 | (a) "How much does Scale cost?"<br>(b) "How much does the Scale tier cost per month?" | (a) "Included in membership, no extra fee"<br>(b) "The Scale tier costs $99 per month." (correct) | $99/month or $990/year | Retrieval error → wrong answer; wording-sensitive | 2026-10-17, 8abb025 | Open |
| F2 | Can Explorer members attend the Fundraising Workshop? | "Yes…" | Exact refusal (not in docs) | Hallucination | 2026-10-17, 8abb025 | Open |
| F3 | Who can join Pitch Practice? | "Open to all members… not specified" | Exact refusal (not in docs) | Hallucination + self-contradiction | 2026-10-17, 8abb025 | Open |
| F4 | Should I raise pre-seed before revenue? | Credits Ravi with a view; appends refusal sentence | Claire's and Jonah's opposing views | Misattribution + format error | 2026-10-17, 8abb025 | Open |

## Retrieval Observations

| # | Query | Observation | Found | Status |
|---|---|---|---|---|
| R1 | How much does the Scale tier cost? | Pricing thread ranked above the price table (membership doc 2nd) | 2026-10-17, 743bcf2 | Open |
| R2 | "What is Scale?" vs "How much does Scale cost?" | First retrieves the membership doc; second misses it entirely. Hypothesis: "cost" matches the mentorship "Cost:" line, and tables embed poorly | 2026-10-17, 8abb025 | Open |

## API Bugs

| # | Request | Actual | Expected | Found | Status |
|---|---|---|---|---|---|
| B1 | POST to an unknown route | Express HTML error page | JSON 404 | 2026-10-17, 8abb025 | Fixed in 4276763 |
| B2 | /ask while Ollama fails | Express HTML error page | JSON 503 | 2026-10-17, 8abb025 | Fixed in 4276763 |
| B3 | UI: Ask while Ollama fails | Error repeats itself: "LLM service is unavailable. The language model is unavailable. …" | One clear message with a hint | 2026-10-17, uncommitted (before d7308e1) | Fixed in d7308e1 |
| B4 | /search with a query that has no letters or digits (e.g. "???") in stub mode | All-zero query vector makes cosine similarity 0/0 = NaN, so ranking is undefined | Score 0 for a zero vector; stable ranking | 2026-10-18, uncommitted (before eed6b57) | Fixed in eed6b57 |
| B5 | Eval runner: `npm run dev` restarts (prompt edited) during `npm run eval:run` | While the app re-indexed, remaining questions failed in milliseconds with network errors; the final /meta call then threw and the run crashed without saving anything | Wait for /health and retry once after a restart; flag the run if the config changed; always save results | 2026-10-18, uncommitted (before 448df95) | Fixed in 448df95 |

## Excluded

| Question | Answer | Why excluded | Found |
|---|---|---|---|
| Where is Demo Night recorded for Explorer members? | Repeats the rule that recordings are posted for paid members | Expected answer is debatable. The docs never state Explorer access to recordings, but "posted for paid members" implies Explorers don't get them, so the answer can be read as correct rather than evasive. Not a reliable test case. | 2026-10-17, 8abb025 |

## Judge Calibration

The LLM judge (`npm run eval:judge`) is checked against hand scores in `eval/human-scores.json`: 6 answers from run `2026-10-18T10-14-35-044Z`, scored blind, covering good, wrong, misattributed, and trap cases. Scores are correctness / groundedness / completeness (1–5).

### v1: qwen2.5:7b, temperature 0, judge prompt `cdaf8039458a`

| ID | Case | You | Judge v1 |
|---|---|---|---|
| single-13 | Good | 5 / 5 / 5 | 5 / 5 / 5 |
| single-07 | Wrong ("2" currencies, docs say 6) | 1 / 1 / 1 | 1 / **4** / 1 |
| single-03 | Official fact credited to a forum post | 5 / 4 / 3 | **3** / 4 / **5** |
| conflict-03 | Lukas's view reversed | 1 / 3 / 2 | **3** / 3 / 3 |
| conflict-04 | Repeats Hiroshi's corrected key-reuse claim | 2 / 4 / 3 | 3 / 4 / 3 |
| single-19 | Good, avoids Bilal's "60 days" trap | 5 / 5 / 5 | 5 / 5 / 5 |

Agreement: 12/18 exact, 14/18 within 1 point, mean absolute difference 0.61. Judge run took 48 minutes for 30 answers.

| # | Judge issue | Example |
|---|---|---|
| J1 | Treats "According to the community docs" (the app's own phrasing) as misattribution, and penalises it in correctness | single-02: correct 1.5% answer scored correctness 1; multi-04: both facts right, correctness 3 |
| J2 | Applies the fact-credited-to-forum rule inconsistently, and to the wrong dimension | single-03 lost correctness for it; single-18 (same pattern, credited to Elena) got groundedness 5 |
| J3 | Reasons can be wrong even when scores look close | conflict-03: claimed "72%, not 61%" (the answer had it right) and missed the actual reversal of Lukas's view |
| J4 | Unsupported invented number not penalised in groundedness | single-07: "2 settlement currencies" appears nowhere in the docs, groundedness 4 |
