import type { Recording } from "../../../../shared/speech";

/** A test recording (no PII). */
export function testRecording(i: number, over: Partial<Recording> = {}): Recording {
  const id = `01R${String(i).padStart(23, "0")}`;
  return {
    id,
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    provider: "openrouter",
    model: "elevenlabs/eleven-v3",
    modelName: "Eleven v3",
    voice: "george",
    text: `Recording number ${i}, a short test text`,
    settings: { stability: 0.5, similarity: 0.75 },
    mediaType: "audio/mpeg",
    characters: 30,
    costMicros: 2400,
    costStatus: "known",
    estimateMicros: 2400,
    durationMs: 800,
    url: `/api/audio/recordings/${id}/file`,
    tags: [],
    comment: null,
    ...over,
  };
}
