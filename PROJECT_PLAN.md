# Community Knowledge Q&A + AI Quality Harness — Project Plan

## Goal
A portfolio project for a remote Sr. AI QA Engineer role: a small retrieval-based Q&A assistant over community documents, plus a test harness that measures AI output quality and a CI gate that blocks regressions.

## Constraints
- **Timeline:** about 4 evenings
- **Budget:** $10 max for the Claude API; Ollama for all development
- **Workflow:** code written with Claude Code, one phase at a time

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (app and tests) |
| App | Node.js + Express, plain HTML UI |
| Retrieval | Ollama embeddings (`nomic-embed-text`), in-memory cosine similarity |
| LLM | Ollama (dev) → Claude Haiku (final runs), switched by env var |
| Tests | Playwright Test (API + UI) |
| Eval harness | TypeScript scripts + JSON golden dataset |
| Trend chart | JSON run history + static Chart.js page |
| CI | GitHub Actions |

---

## Phase 0 — Environment Setup *(Evening 1)*
- Install Node.js (LTS), Git, and Ollama
- Pull a small chat model (e.g. `llama3.2:3b`) and `nomic-embed-text`
- Create a GitHub repo, clone it locally, open Claude Code in that folder

**Done when:** `node -v`, `git --version`, and `ollama run llama3.2:3b` all work.

## Phase 1 — App Under Test *(Evening 1)*
- Scaffold a TypeScript Express app with a `/health` route
- Add 8–10 short Markdown docs about a fictional community
- On startup: chunk docs, embed them, keep vectors in memory
- `POST /ask`: retrieve top 3 chunks, generate an answer, return `{ answer, sources }`
- Bearer-token auth middleware; clear errors for empty, oversized, and unauthenticated requests
- Simple HTML page showing the answer and cited sources
- LLM provider, model, and prompt file set via env vars

**Done when:** the UI returns a grounded answer with sources using Ollama.

## Phase 2 — Traditional Automation *(Evening 2)*
- Playwright Test setup with separate API and UI projects
- API tests: happy path, response schema (contract), missing/invalid token, invalid input
- UI tests: ask a question, answer and sources render, errors display
- Assert on structure and behavior, not exact AI wording
- HTML test report

**Done when:** all tests pass locally and the report is generated.

## Phase 3 — Golden Dataset + Rubric Scoring *(Evening 2)*
- `golden.json`: 30 questions, each with expected facts, expected source docs, and a category
- Deterministic checks: expected facts present, cited sources match expected
- LLM-as-judge: rubric prompt scoring correctness, groundedness, completeness (1–5, JSON output)
- Combine into per-question and overall scores

**Done when:** `npm run eval` prints a score report and saves results as JSON.

## Phase 4 — AI Failure-Mode Suites *(Evening 3)*
- **Hallucination:** ~5 unanswerable questions; pass if the assistant declines
- **Consistency:** same question run 5 times; measure score variance
- **Retrieval:** correct doc appears in the top 3 (hit rate)
- **Prompt injection:** malicious instructions in a question or doc; pass if ignored

**Done when:** each suite reports a pass rate in the eval report.

## Phase 5 — Quality Over Time *(Evening 3)*
- Append each run's summary to a history file: timestamp, commit, model, prompt version, scores
- Static chart page plotting each metric across runs

**Done when:** the chart shows at least 3 runs.

## Phase 6 — CI Quality Gate *(Evening 4)*
- GitHub Actions workflow on pull requests: install, start app, run Playwright tests, run eval
- Gate fails if the average score is below a threshold or drops from the baseline
- Branch protection requires the check to pass
- Decision point: which LLM runs in CI (Ollama in the runner vs. Claude)

**Done when:** a deliberately bad PR is blocked.

## Phase 7 — Final Runs + Demo *(Evening 4)*
- Switch to Claude Haiku via env var; set a $10 spending limit and cap output tokens
- Run the full eval 2–3 times to set a real baseline
- README: what it is, how to run it, test strategy, results, chart screenshot
- Loom: passing state → change the prompt → push → gate blocks → chart shows the drop

**Done when:** Loom is recorded and the repo is public.

---

## Budget Rules
- Ollama for Phases 0–6; Claude only in Phase 7
- 30 questions, not 50
- Spending limit set in the Claude Console before the first API call
- Max output tokens capped on every call

## JD Coverage

| JD requirement | Phase |
|---|---|
| UI, API, E2E automation in CI/CD | 2, 6 |
| API contracts, auth, error handling | 2 |
| Golden datasets, rubric scoring | 3 |
| Hallucination, variance, retrieval errors, unsafe behavior | 4 |
| Track quality over time | 5 |
| CI gates on AI output quality | 6 |
| Clear documentation | 7 |

## Progress
- [x] Phase 0 — Setup
- [x] Phase 1 — App under test
- [x] Phase 2 — Traditional automation
- [x] Phase 3 — Golden dataset + rubric
- [x] Phase 4 — Failure-mode suites
- [x] Phase 5 — Quality over time
- [x] Phase 6 — CI quality gate
- [ ] Phase 7 — Final runs + demo
