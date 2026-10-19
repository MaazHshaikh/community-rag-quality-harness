// Writes eval/trend.html from eval/history.jsonl: the quality score and three failure rates over
// time, with a marker wherever the prompt or chat model changed. Self-contained (inline SVG, no
// scripts or CDN), so it opens straight from disk. Run with: npm run eval:chart
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { changeMarkers, HISTORY_FILE, type HistoryEntry } from "./history.js";

const OUT_FILE = path.join("eval", "trend.html");

if (!existsSync(HISTORY_FILE)) {
  console.error(`No ${HISTORY_FILE} yet. Create one with: npm run eval:all`);
  process.exit(1);
}
const entries: HistoryEntry[] = readFileSync(HISTORY_FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const markers = changeMarkers(entries);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
const shortDate = (iso: string) => iso.slice(5, 16).replace("T", " ");

const W = 900;
const H = 260;
// Side padding leaves room for the first and last date labels, which are centred on their points.
const PAD = { left: 56, right: 44, top: 28, bottom: 44 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;
const x = (i: number) => PAD.left + (entries.length === 1 ? plotW / 2 : (i / (entries.length - 1)) * plotW);

interface Series {
  name: string;
  cls: string;
  value: (e: HistoryEntry) => number | null; // in the panel's units
  label: (e: HistoryEntry) => string;
}

function panel(title: string, max: number, unit: string, series: Series[]): string {
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const parts: string[] = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const v = t * max;
    parts.push(`<line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text class="tick" x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end">${v}${unit}</text>`);
  }
  entries.forEach((e, i) => {
    parts.push(`<text class="tick" x="${x(i)}" y="${H - PAD.bottom + 16}" text-anchor="middle">${esc(shortDate(e.date))}</text>`);
    parts.push(`<text class="tick dim" x="${x(i)}" y="${H - PAD.bottom + 30}" text-anchor="middle">${esc(e.commit)}</text>`);
  });
  for (const m of markers) {
    const mx = (x(m.index - 1) + x(m.index)) / 2;
    parts.push(
      `<g class="marker"><title>${esc(m.changes.join("; "))}</title>` +
        `<line x1="${mx}" x2="${mx}" y1="${PAD.top - 6}" y2="${PAD.top + plotH}"/>` +
        `<text x="${mx + 4}" y="${PAD.top - 10}">${esc(m.changes.map((c) => c.split(" ")[0]).join(" + "))} changed</text></g>`,
    );
  }
  for (const s of series) {
    const points = entries.map((e, i) => ({ e, i, v: s.value(e) })).filter((p) => p.v !== null) as { e: HistoryEntry; i: number; v: number }[];
    if (points.length > 1) {
      parts.push(`<polyline class="line ${s.cls}" points="${points.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}"/>`);
    }
    for (const p of points) {
      parts.push(
        `<circle class="dot ${s.cls}" cx="${x(p.i)}" cy="${y(p.v)}" r="4"><title>${esc(`${s.name}: ${s.label(p.e)}\n${p.e.date} at ${p.e.commit}`)}</title></circle>`,
      );
    }
  }
  const legend = series.map((s) => `<span class="key"><span class="swatch ${s.cls}"></span>${esc(s.name)}</span>`).join("");
  return (
    `<section><h2>${esc(title)}</h2><div class="legend">${legend}</div>` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${parts.join("")}</svg></section>`
  );
}

const quality = panel("Quality score (75% fact recall + 25% source recall)", 100, "", [
  { name: "Quality score", cls: "s1", value: (e) => e.quality_score, label: (e) => String(e.quality_score) },
]);
const failures = panel("Failure rates (lower is better)", 100, "%", [
  { name: "Retrieval miss rate", cls: "s2", value: (e) => (1 - e.retrieval_hit_rate) * 100, label: (e) => pct(1 - e.retrieval_hit_rate) },
  { name: "Made-up answer rate", cls: "s3", value: (e) => e.made_up_rate * 100, label: (e) => pct(e.made_up_rate) },
  {
    name: "Injection compliance rate",
    cls: "s4",
    value: (e) => (e.injection_compliance_rate === null ? null : e.injection_compliance_rate * 100),
    label: (e) => pct(e.injection_compliance_rate),
  },
]);

const rows = entries
  .map(
    (e) =>
      `<tr><td>${esc(e.date.slice(0, 19).replace("T", " "))}</td><td><code>${esc(e.commit)}</code></td><td>${esc(e.chat_model ?? "n/a")}</td>` +
      `<td><code>${esc(e.prompt_sha256.slice(0, 12))}</code></td><td><code>${esc(e.golden_sha256.slice(0, 12))}</code></td>` +
      `<td class="num">${e.quality_score.toFixed(1)}</td><td class="num">${pct(e.fact_recall)}</td><td class="num">${pct(e.source_recall)}</td>` +
      `<td class="num">${pct(e.retrieval_hit_rate)}</td><td class="num">${pct(e.made_up_rate)}</td>` +
      `<td class="num">${pct(e.injection_compliance_rate)}</td><td class="num">${e.unstable_questions}</td><td class="num">${e.request_errors}</td>` +
      `<td class="num">${e.estimated_cost_usd == null ? "n/a" : `$${e.estimated_cost_usd.toFixed(4)}`}</td></tr>`,
  )
  .join("\n");

const markerList = markers.length
  ? `<ul>${markers.map((m) => `<li>Before ${esc(entries[m.index].date.slice(0, 16).replace("T", " "))} (${esc(entries[m.index].commit)}): ${esc(m.changes.join("; "))}</li>`).join("")}</ul>`
  : "<p>No prompt or model changes yet: every run used the same prompt and chat model, so the spread between runs is run-to-run noise.</p>";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eval Quality Trend</title>
<style>
  :root { --bg: #fbfbfa; --fg: #1d1d1b; --dim: #6b6b66; --grid: #e4e4e0; --card: #ffffff;
          --s1: #2f6fdb; --s2: #8a8a84; --s3: #d9822b; --s4: #c23b3b; --marker: #7a4fd0; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #161615; --fg: #ececea; --dim: #9a9a94; --grid: #2e2e2b; --card: #1e1e1c;
            --s1: #6b9cf0; --s2: #a8a8a2; --s3: #f0a050; --s4: #ee6a6a; --marker: #a98bf0; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg);
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 6px; }
  p.lead { color: var(--dim); margin: 0 0 20px; }
  section { background: var(--card); border: 1px solid var(--grid); border-radius: 8px; padding: 14px; margin-bottom: 16px; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--grid); }
  .tick { fill: var(--dim); font-size: 11px; }
  .tick.dim { opacity: 0.7; }
  .line { fill: none; stroke-width: 2; }
  .dot { stroke: var(--card); stroke-width: 1.5; }
  .line.s1 { stroke: var(--s1); } .dot.s1, .swatch.s1 { fill: var(--s1); background: var(--s1); }
  .line.s2 { stroke: var(--s2); } .dot.s2, .swatch.s2 { fill: var(--s2); background: var(--s2); }
  .line.s3 { stroke: var(--s3); } .dot.s3, .swatch.s3 { fill: var(--s3); background: var(--s3); }
  .line.s4 { stroke: var(--s4); } .dot.s4, .swatch.s4 { fill: var(--s4); background: var(--s4); }
  .marker line { stroke: var(--marker); stroke-width: 1.5; stroke-dasharray: 4 3; }
  .marker text { fill: var(--marker); font-size: 11px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--dim); margin-bottom: 6px; }
  .key { display: inline-flex; align-items: center; gap: 6px; }
  .swatch { width: 12px; height: 3px; border-radius: 2px; display: inline-block; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 5px 8px; border-bottom: 1px solid var(--grid); text-align: left; white-space: nowrap; }
  th { color: var(--dim); font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  code { font-size: 12px; }
</style>
</head>
<body>
<main>
<h1>Eval quality trend</h1>
<p class="lead">${entries.length} full <code>npm run eval:all</code> runs from <code>${esc(HISTORY_FILE)}</code>. Hover a point for its value.
Dashed lines mark a prompt or chat model change.</p>
${quality}
${failures}
<section><h2>Prompt and model changes</h2>${markerList}</section>
<section><h2>All runs</h2><div class="table-wrap"><table>
<thead><tr><th>Date (UTC)</th><th>Commit</th><th>Chat model</th><th>Prompt</th><th>Golden</th><th>Quality</th><th>Fact recall</th>
<th>Source recall</th><th>Retrieval hit</th><th>Made up</th><th>Injection complied</th><th>Unstable</th><th>Request errors</th><th>Est. API cost</th></tr></thead>
<tbody>
${rows}
</tbody></table></div></section>
</main>
</body>
</html>
`;

writeFileSync(OUT_FILE, html);
console.log(`Wrote ${OUT_FILE} (${entries.length} runs, ${markers.length} prompt/model changes)`);
