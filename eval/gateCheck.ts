// Pure comparison for the CI quality gate (eval/gate.ts), kept free of file I/O so it can be
// unit-tested. The gate fails when the quality score drops more than `tolerance` points below
// the committed baseline in eval/baseline.json.

export interface Baseline {
  quality_score: number;
  tolerance: number;
  chat_model: string;
  embed_model: string;
  prompt_sha256: string;
  golden_sha256: string;
  source: string;
  note?: string;
}

export interface GateRun {
  quality_score: number;
  chat_model: string | null;
  embed_model: string | null;
  prompt_sha256: string;
  golden_sha256: string;
  errors: number;
}

export interface GateResult {
  pass: boolean;
  threshold: number;
  delta: number;
  failures: string[]; // reasons the gate failed
  notes: string[]; // differences worth knowing that don't fail the gate
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function checkGate(baseline: Baseline, run: GateRun): GateResult {
  const threshold = round1(baseline.quality_score - baseline.tolerance);
  const delta = round1(run.quality_score - baseline.quality_score);
  const failures: string[] = [];
  const notes: string[] = [];

  // A different model isn't a regression, but the scores can't be compared either.
  if (run.chat_model !== baseline.chat_model) {
    failures.push(`Chat model ${run.chat_model} differs from the baseline's ${baseline.chat_model}; recalibrate the baseline.`);
  }
  if (run.embed_model !== baseline.embed_model) {
    failures.push(`Embedding model ${run.embed_model} differs from the baseline's ${baseline.embed_model}; recalibrate the baseline.`);
  }
  // Failed requests score 0, so an outage would look like a regression; report it as what it is.
  if (run.errors > 0) failures.push(`${run.errors} request(s) failed, so the score is incomplete.`);
  if (round1(run.quality_score) < threshold) {
    failures.push(`Quality score ${run.quality_score} is ${Math.abs(delta)} points below the baseline ${baseline.quality_score} (allowed: ${baseline.tolerance}).`);
  }

  if (run.prompt_sha256 !== baseline.prompt_sha256) notes.push("The prompt differs from the baseline's, so this run measures the prompt change.");
  if (run.golden_sha256 !== baseline.golden_sha256) {
    notes.push("eval/golden.json differs from the baseline's; if the questions changed, recalibrate the baseline.");
  }

  return { pass: failures.length === 0, threshold, delta, failures, notes };
}
