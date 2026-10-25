import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { audioDialogViews, audioViewKey, audioViewSearch, parseAudioView } from "./audioGalleryView";
import { patchRecordings } from "./patchRecordings";
import { testRecording as rec } from "./testRecording";

describe("audio gallery views (address ↔ view)", () => {
  it("round-trips All, one model and By model through the address", () => {
    for (const v of [
      { kind: "all" } as const,
      { kind: "model", model: "elevenlabs/eleven-v3.5+beta" } as const,
      { kind: "models" } as const,
    ])
      expect(parseAudioView(audioViewSearch(v))).toEqual(v);
    expect(parseAudioView("?model=")).toEqual({ kind: "all" });
    expect(parseAudioView("?view=models&model=a")).toEqual({ kind: "model", model: "a" });
  });

  it("keys every view under the recordings family", () => {
    expect(audioViewKey({ kind: "all" })).toEqual(["recordings", "list", "all"]);
    expect(audioViewKey({ kind: "model", model: "m" })).toEqual(["recordings", "list", "model", "m"]);
    expect(audioViewKey({ kind: "models" })).toEqual(["recordings", "models"]);
  });

  it("reads the views a dialog visit carries", () => {
    expect(audioDialogViews({ grid: { kind: "models" }, order: { kind: "model", model: "m" } })).toEqual({
      grid: { kind: "models" },
      order: { kind: "model", model: "m" },
    });
    expect(audioDialogViews(null)).toEqual({ grid: undefined, order: undefined });
  });
});

describe("patchRecordings — one card everywhere, no page reads", () => {
  const seed = () => {
    const qc = new QueryClient();
    qc.setQueryData(["recordings", "list", "all"], {
      pages: [
        { items: [rec(3), rec(2)], nextCursor: "x" },
        { items: [rec(1)], nextCursor: null },
      ],
      pageParams: [undefined, "x"],
    });
    qc.setQueryData(["recordings", "recent"], { items: [rec(3), rec(2), rec(1)], nextCursor: null });
    qc.setQueryData(["recordings", "models"], {
      models: [
        {
          provider: "openrouter",
          model: "elevenlabs/eleven-v3",
          modelName: "Eleven v3",
          count: 3,
          latestId: rec(3).id,
          items: [rec(3), rec(2)],
        },
      ],
    });
    qc.setQueryData(["recording", rec(2).id], rec(2));
    return qc;
  };

  it("patches a card in pages, the recent list, model groups and the detail", () => {
    const qc = seed();
    patchRecordings(qc, rec(2).id, { tags: ["intro"] });
    const pages = qc.getQueryData<{ pages: { items: { tags: string[] }[] }[] }>(["recordings", "list", "all"]);
    expect(pages?.pages[0]?.items[1]?.tags).toEqual(["intro"]);
    expect(qc.getQueryData<{ items: { tags: string[] }[] }>(["recordings", "recent"])?.items[1]?.tags).toEqual([
      "intro",
    ]);
    const groups = qc.getQueryData<{ models: { items: { tags: string[] }[] }[] }>(["recordings", "models"]);
    expect(groups?.models[0]?.items[1]?.tags).toEqual(["intro"]);
    expect(qc.getQueryData<{ tags: string[] }>(["recording", rec(2).id])?.tags).toEqual(["intro"]);
  });

  it("removes a card everywhere and lowers its model's count; an empty group disappears", () => {
    const qc = seed();
    patchRecordings(qc, rec(3).id, "remove");
    const groups = qc.getQueryData<{ models: { count: number; items: unknown[] }[] }>(["recordings", "models"]);
    expect(groups?.models[0]?.count).toBe(2);
    expect(qc.getQueryData<{ items: unknown[] }>(["recordings", "recent"])?.items).toHaveLength(2);
    qc.setQueryData(["recordings", "models"], {
      models: [{ provider: "openrouter", model: "m", modelName: "M", count: 1, latestId: rec(1).id, items: [rec(1)] }],
    });
    patchRecordings(qc, rec(1).id, "remove");
    expect(qc.getQueryData<{ models: unknown[] }>(["recordings", "models"])?.models).toEqual([]);
  });
});
