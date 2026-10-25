import { afterEach, describe, expect, it } from "vitest";
import { seedGeneration } from "../../../../tests/helpers/generations";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { promptKey } from "./promptKey";

let t: ReturnType<typeof createTestApp>;
afterEach(() => t.cleanup());

const keyOf = (id: string) => t.db.prepare("SELECT prompt_key FROM generations WHERE id = ?").pluck().get(id);

describe("prompt key persistence", () => {
  it("a saved generation carries the key of its prompt", () => {
    t = createTestApp();
    const g = seedGeneration(t.db, t.dataDir, { prompt: "a cat\n" });
    expect(keyOf(g.id)).toBe(promptKey("a cat\n"));
  });
});
