import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import {
  type AudioGeneration,
  type AudioGenerationsResponse,
  billedChars,
  type CreditsResponse,
  type SpeechModel,
  type SpeechModelsResponse,
  StartSpeechRequest,
  settingsFor,
} from "../../../shared/audio";
import { AppError } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { OpenRouterSpeech } from "./openrouter-speech";
import type { AudioRecord, AudioRepo } from "./repo";

export type AudioRouteDeps = { repo: AudioRepo; speech: OpenRouterSpeech; dataDir: string; now?: () => number };

const AUDIO_DIR = "audio";
const MODELS_TTL_MS = 10 * 60_000;
const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" };

const fieldsOf = (issues: { path: PropertyKey[]; message: string }[]) =>
  Object.fromEntries(issues.map((i) => [i.path.join(".") || "body", i.message]));

const toDto = (r: AudioRecord): AudioGeneration => ({
  id: r.id,
  createdAt: r.createdAt,
  model: r.model,
  voice: r.voice,
  text: r.text,
  settings: r.settings,
  mediaType: r.mediaType,
  characters: r.characters,
  costMicros: r.costMicros,
  url: `/api/audio/${r.id}/file`,
});

export function registerAudioRoutes(app: Hono, deps: AudioRouteDeps) {
  const now = deps.now ?? Date.now;
  let modelsCache: { at: number; models: SpeechModel[] } | null = null;

  async function models(): Promise<SpeechModel[]> {
    if (!modelsCache || now() - modelsCache.at > MODELS_TTL_MS)
      modelsCache = { at: now(), models: await deps.speech.models() };
    return modelsCache.models;
  }

  app.get("/audio/models", async (c) => c.json({ models: await models() } satisfies SpeechModelsResponse));

  app.get("/audio/credits", async (c) => c.json((await deps.speech.credits()) satisfies CreditsResponse));

  app.get("/audio", (c) => c.json({ items: deps.repo.list(100).map(toDto) } satisfies AudioGenerationsResponse));

  app.post("/audio", async (c) => {
    const raw: unknown = await c.req.json().catch(() => {
      throw new AppError("VALIDATION_ERROR", "Request body must be JSON", 400);
    });
    const body = StartSpeechRequest.safeParse(raw);
    if (!body.success)
      throw new AppError("VALIDATION_ERROR", "Invalid speech request", 400, { fields: fieldsOf(body.error.issues) });
    const model = (await models()).find((m) => m.id === body.data.model);
    if (!model)
      throw new AppError("VALIDATION_ERROR", `Unknown model: ${body.data.model}`, 400, {
        fields: { model: "Choose an ElevenLabs model" },
      });
    const characters = billedChars(body.data.text);
    if (characters > model.maxChars)
      throw new AppError("VALIDATION_ERROR", `${model.name} takes at most ${model.maxChars} characters`, 400, {
        fields: { text: `At most ${model.maxChars} characters` },
      });

    const settings = settingsFor(model, body.data.settings);
    const result = await deps.speech.speak({ text: body.data.text, model, voice: body.data.voice, settings });

    const at = now();
    const id = newId(at);
    const filePath = `${AUDIO_DIR}/${id}.${EXT[result.mediaType] ?? "bin"}`;
    const abs = join(deps.dataDir, filePath);
    const record: AudioRecord = {
      id,
      createdAt: new Date(at).toISOString(),
      model: model.id,
      voice: body.data.voice,
      text: body.data.text,
      settings,
      filePath,
      mediaType: result.mediaType,
      characters,
      costMicros: model.pricePerChar === null ? null : Math.round(characters * model.pricePerChar * 1_000_000),
      costRef: result.generationId,
    };
    try {
      await mkdir(join(deps.dataDir, AUDIO_DIR), { recursive: true });
      await writeFile(abs, result.bytes);
      deps.repo.insert(record);
    } catch (err) {
      await rm(abs, { force: true });
      console.error(err);
      throw new AppError("STORAGE_ERROR", "Couldn't save the audio", 500);
    }
    return c.json(toDto(record), 201);
  });

  app.get("/audio/:id/file", async (c) => {
    const record = deps.repo.get(c.req.param("id"));
    if (!record) throw new AppError("NOT_FOUND", "Audio not found", 404);
    const bytes = await readFile(join(deps.dataDir, record.filePath)).catch(() => {
      throw new AppError("NOT_FOUND", "Audio file not found", 404);
    });
    const name = `${record.voice}-${record.id}.${record.filePath.split(".").pop()}`.replace(/[^\w.-]+/g, "_");
    return c.body(bytes, 200, {
      "content-type": record.mediaType,
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, max-age=31536000, immutable",
    });
  });

  app.delete("/audio/:id", async (c) => {
    const record = deps.repo.get(c.req.param("id"));
    if (!record) throw new AppError("NOT_FOUND", "Audio not found", 404);
    deps.repo.delete(record.id);
    await rm(join(deps.dataDir, record.filePath), { force: true });
    return c.body(null, 204);
  });
}
