# Findings Log

Model: llama3.2:3b, temperature 0.2, top-3 retrieval

## AI Quality Findings

| # | Question | Answer | Expected | Type | Found |
|---|---|---|---|---|---|
| F1 | (a) "How much does Scale cost?"<br>(b) "How much does the Scale tier cost per month?" | (a) "Included in membership, no extra fee"<br>(b) "The Scale tier costs $99 per month." (correct) | $99/month or $990/year | Retrieval error → wrong answer; wording-sensitive | 2026-10-17, 8abb025 |
| F2 | Can Explorer members attend the Fundraising Workshop? | "Yes…" | Exact refusal (not in docs) | Hallucination | 2026-10-17, 8abb025 |
| F3 | Who can join Pitch Practice? | "Open to all members… not specified" | Exact refusal (not in docs) | Hallucination + self-contradiction | 2026-10-17, 8abb025 |
| F4 | Should I raise pre-seed before revenue? | Credits Ravi with a view; appends refusal sentence | Claire's and Jonah's opposing views | Misattribution + format error | 2026-10-17, 8abb025 |

## Retrieval Observations

| # | Query | Observation | Found |
|---|---|---|---|
| R1 | How much does the Scale tier cost? | Pricing thread ranked above the price table (membership doc 2nd) | 2026-10-17, 743bcf2 |
| R2 | "What is Scale?" vs "How much does Scale cost?" | First retrieves the membership doc; second misses it entirely. Hypothesis: "cost" matches the mentorship "Cost:" line, and tables embed poorly | 2026-10-17, 8abb025 |

## API Bugs

| # | Request | Actual | Expected | Found |
|---|---|---|---|---|
| B1 | POST to an unknown route | Express HTML error page | JSON 404 | 2026-10-17, 8abb025 |
| B2 | /ask while Ollama fails | Express HTML error page | JSON 503 | 2026-10-17, 8abb025 |

## Excluded

| Question | Answer | Why excluded | Found |
|---|---|---|---|
| Where is Demo Night recorded for Explorer members? | Repeats the rule that recordings are posted for paid members | Expected answer is debatable. The docs never state Explorer access to recordings, but "posted for paid members" implies Explorers don't get them, so the answer can be read as correct rather than evasive. Not a reliable test case. | 2026-10-17, 8abb025 |
