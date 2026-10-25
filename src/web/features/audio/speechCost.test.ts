import { describe, expect, it } from "vitest";
import { costText, estimateText, priceText } from "./speechCost";

const perChar = { unit: "per-character", usdPerChar: 0.00008 } as const;

describe("speech prices and costs", () => {
  it("labels a per-character estimate as an estimate, two significant digits, tiny amounts as less than", () => {
    expect(estimateText(perChar, 15)).toBe("≈ $0.0012");
    expect(estimateText(perChar, 9000)).toBe("≈ $0.72");
    expect(estimateText({ unit: "per-character", usdPerChar: 0.00000062 }, 10)).toBe("≈ < $0.0001");
    expect(estimateText(perChar, 0)).toBeNull(); // nothing typed: no estimate yet, never «$0»
  });

  it("says Free for a zero price and how other models are priced, never $0", () => {
    expect(estimateText({ unit: "free" }, 100)).toBe("Free");
    expect(estimateText({ unit: "per-output", outputLabel: "per second of audio" }, 100)).toBe(
      "priced per second of audio",
    );
    expect(estimateText({ unit: "per-output", outputLabel: "per token" }, 100)).toBe("priced per token");
    expect(estimateText({ unit: "unknown" }, 100)).toBe("price unknown");
  });

  it("shows a model's price in the model list", () => {
    expect(priceText(perChar)).toBe("$0.08 / 1K chars");
    expect(priceText({ unit: "per-character", usdPerChar: 0.00000062 })).toBe("$0.00062 / 1K chars");
    expect(priceText({ unit: "free" })).toBe("Free");
    expect(priceText({ unit: "per-output", outputLabel: "per token" })).toBe("priced per token");
    expect(priceText({ unit: "unknown" })).toBe("price unknown");
  });

  it("shows a recording's cost with its status and the estimate beside it", () => {
    expect(costText({ costStatus: "known", costMicros: 41_000, estimateMicros: 40_000 })).toBe("$0.041");
    expect(costText({ costStatus: "known", costMicros: 30, estimateMicros: null })).toBe("< $0.0001");
    expect(costText({ costStatus: "known", costMicros: 0, estimateMicros: 0 })).toBe("Free");
    // a paid model whose provider reported 0 is not «Free» (review R3)
    expect(costText({ costStatus: "known", costMicros: 0, estimateMicros: 880 })).toBe("$0.00");
    expect(costText({ costStatus: "known", costMicros: 0, estimateMicros: null })).toBe("$0.00");
    expect(costText({ costStatus: "known", costMicros: 2_500_000, estimateMicros: null })).toBe("$2.50");
    expect(costText({ costStatus: "pending", costMicros: null, estimateMicros: 41_000 })).toBe(
      "cost pending · ≈ $0.041",
    );
    expect(costText({ costStatus: "pending", costMicros: null, estimateMicros: null })).toBe("cost pending");
    expect(costText({ costStatus: "unavailable", costMicros: null, estimateMicros: 41_000 })).toBe(
      "cost unavailable · ≈ $0.041",
    );
    expect(costText({ costStatus: "unavailable", costMicros: null, estimateMicros: null })).toBe("cost unavailable");
  });
});
