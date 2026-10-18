import { expect, test } from "@playwright/test";
import { classifyAnswer } from "../../eval/hallucinationClassifier.js";

test.describe("classifyAnswer: exact refusal", () => {
  test("the refusal sentence alone", () => {
    expect(classifyAnswer("I don't know based on the community docs.")).toBe("exact_refusal");
  });

  test("with a curly apostrophe and no full stop", () => {
    expect(classifyAnswer("I don’t know based on the community docs")).toBe("exact_refusal");
  });

  test("with a hedge before it", () => {
    expect(
      classifyAnswer("The answer is not explicitly stated in the provided context. I don't know based on the community docs."),
    ).toBe("exact_refusal");
  });

  test("with a hedge that mentions related numbers", () => {
    expect(
      classifyAnswer(
        "The docs give a 10% reserve for new merchants and 15% for high-risk ones, but don't say which applies to both. I don't know based on the community docs.",
      ),
    ).toBe("exact_refusal");
  });
});

test.describe("classifyAnswer: hedged", () => {
  test.describe("without the exact sentence", () => {
    for (const answer of [
      "The minimum card payment amount is not specified in the provided context.",
      "The documents don't mention a limit on webhook endpoints.",
      "There is no information about sandbox data retention.",
      "I can't find a timeout value for API requests in the docs.",
      "It is unclear how much notice ZoisPay gives.",
    ]) {
      test(answer, () => {
        expect(classifyAnswer(answer)).toBe("hedged");
      });
    }
  });
});

test.describe("classifyAnswer: made up", () => {
  test("a confident specific answer", () => {
    expect(classifyAnswer("The minimum amount for a card payment is $0.50.")).toBe("made_up");
  });

  test("a confident answer without numbers", () => {
    expect(classifyAnswer("The high-risk reserve takes precedence over the new merchant reserve.")).toBe("made_up");
  });

  test("a specific claim with the refusal sentence appended", () => {
    expect(classifyAnswer("The 15% reserve applies for 120 days. I don't know based on the community docs.")).toBe(
      "made_up",
    );
  });

  test("does not mistake 'not' in an ordinary sentence for a hedge", () => {
    expect(classifyAnswer("Card payments are not capped; the maximum is $10,000.")).toBe("made_up");
  });
});

test.describe("classifyAnswer: error", () => {
  test("a failed request has no answer to classify", () => {
    expect(classifyAnswer(null)).toBe("error");
  });
});
