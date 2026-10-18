import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { z } from "zod";

// Lowercase, straighten apostrophes, and treat hyphens/dashes as spaces, so "7-day" matches "7 day".
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ");
}

const Phrase = z.string().trim().min(1);

// A fact is one phrase, or a list of acceptable variants where any one counts as a match
// (e.g. ["once per week", "once a week", "weekly"]).
const Fact = z.union([Phrase, z.array(Phrase).min(1)]);

const GoldenEntry = z
  .object({
    id: z.string().regex(/^(single|multi|conflict)-\d{2}$/),
    question: z.string().trim().min(10),
    category: z.enum(["single_fact", "multi_doc", "conflict"]),
    expected_facts: z.array(Fact).min(1),
    expected_sources: z.array(z.string().regex(/^[\w-]+\.md$/)).min(1),
    // Forbidden facts are flags for the LLM judge, not automatic failures. A match means
    // "look closely": a correct answer can still contain one, e.g. while contrasting it
    // with the right value ("$29, not $99"). The judge decides whether it is an error.
    forbidden_facts: z.array(Phrase).min(1),
  })
  .strict();

type Fact = z.infer<typeof Fact>;

const variants = (fact: Fact) => (Array.isArray(fact) ? fact : [fact]).map(normalize);
const label = (fact: Fact) => (Array.isArray(fact) ? fact.join(" | ") : fact);

const parsed = z.array(GoldenEntry).safeParse(JSON.parse(readFileSync("eval/golden.json", "utf8")));
// An invalid file still loads as [] so the schema test can report a readable error.
const golden = parsed.success ? parsed.data : [];
const docText = (file: string) => normalize(readFileSync(path.join("docs", file), "utf8"));
const inText = (text: string, fact: Fact) => variants(fact).some((v) => text.includes(v));

test.describe("eval/golden.json", () => {
  test("matches the entry schema", () => {
    expect(parsed.success, parsed.error ? z.prettifyError(parsed.error) : "").toBe(true);
  });

  test("has 30 entries: 20 single_fact, 5 multi_doc, 5 conflict", () => {
    const count = (category: string) => golden.filter((e) => e.category === category).length;
    expect(golden).toHaveLength(30);
    expect(count("single_fact")).toBe(20);
    expect(count("multi_doc")).toBe(5);
    expect(count("conflict")).toBe(5);
  });

  test("ids and questions are unique", () => {
    expect(new Set(golden.map((e) => e.id)).size).toBe(golden.length);
    expect(new Set(golden.map((e) => normalize(e.question))).size).toBe(golden.length);
  });

  test("id prefix matches category", () => {
    const prefix = { single_fact: "single-", multi_doc: "multi-", conflict: "conflict-" };
    for (const e of golden) expect(e.id, e.id).toMatch(new RegExp(`^${prefix[e.category]}`));
  });

  test("every expected source exists in docs/", () => {
    for (const e of golden) {
      for (const source of e.expected_sources) {
        expect(existsSync(path.join("docs", source)), `${e.id}: ${source}`).toBe(true);
      }
    }
  });

  test("multi_doc entries cite at least 2 distinct docs", () => {
    for (const e of golden.filter((e) => e.category === "multi_doc")) {
      expect(new Set(e.expected_sources).size, e.id).toBeGreaterThanOrEqual(2);
    }
  });

  test("conflict entries cite discussion threads only", () => {
    for (const e of golden.filter((e) => e.category === "conflict")) {
      for (const source of e.expected_sources) expect(source, e.id).toMatch(/^thread-/);
    }
  });

  // Guards the dataset itself: an expected fact the docs don't contain would be an unfair test.
  // For a variant list, at least one variant must appear; the others cover answer phrasings.
  test("every expected fact appears in one of its expected sources", () => {
    for (const e of golden) {
      const sources = e.expected_sources.map(docText);
      for (const fact of e.expected_facts) {
        const found = sources.some((text) => inText(text, fact));
        expect(found, `${e.id}: "${label(fact)}" not found in ${e.expected_sources.join(", ")}`).toBe(true);
      }
    }
  });

  // A multi_doc question that one doc can fully answer is really a single_fact question.
  test("no single source contains every fact of a multi_doc entry", () => {
    for (const e of golden.filter((e) => e.category === "multi_doc")) {
      for (const source of e.expected_sources) {
        const text = docText(source);
        const coversAll = e.expected_facts.every((fact) => inText(text, fact));
        expect(coversAll, `${e.id}: ${source} alone contains every expected fact`).toBe(false);
      }
    }
  });

  test("no phrase is both expected and forbidden", () => {
    for (const e of golden) {
      const forbidden = e.forbidden_facts.map(normalize);
      for (const variant of e.expected_facts.flatMap(variants)) {
        expect(forbidden, `${e.id}: "${variant}"`).not.toContain(variant);
      }
    }
  });

  test("includes both F1 wordings from findings.md", () => {
    const questions = golden.map((e) => e.question);
    expect(questions).toContain("How much does Scale cost?");
    expect(questions).toContain("How much does the Scale tier cost per month?");
  });
});
