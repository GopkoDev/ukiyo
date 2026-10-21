import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import {
  type AudioGeneration,
  type AudioGenerationsResponse,
  type CreditsResponse,
  StartSpeechRequest,
  settingsFor,
  speechModel,
  type Voice,
  type VoicesResponse,
} from "../../../shared/audio";
import { AppError } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { ElevenLabs } from "./elevenlabs";
import type { AudioRecord, AudioRepo } from "./repo";

export type AudioRouteDeps = { repo: AudioRepo; elevenLabs: ElevenLabs; dataDir: string; now?: () => number };

const AUDIO_DIR = "audio";
const VOICES_TTL_MS = 10 * 60_000;
const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" };

const fieldsOf = (issues: { path: PropertyKey[]; message: string }[]) =>
  Object.fromEntries(issues.map((i) => [i.path.join(".") || "body", i.message]));

const toDto = (r: AudioRecord): AudioGeneration => ({
  id: r.id,
  createdAt: r.createdAt,
  model: r.model,
  voiceId: r.voiceId,
  voiceName: r.voiceName,
  text: r.text,
  settings: r.settings,
  mediaType: r.mediaType,
  characters: r.characters,
  url: `/api/audio/${r.id}/file`,
});

export function registerAudioRoutes(app: Hono, deps: AudioRouteDeps) {
  const now = deps.now ?? Date.now;
  let voicesCache: { at: number; voices: Voice[] } | null = null;

  app.get("/audio/voices", async (c) => {
    if (!voicesCache || now() - voicesCache.at > VOICES_TTL_MS || c.req.query("refresh") === "1")
      voicesCache = { at: now(), voices: await deps.elevenLabs.voices() };
    return c.json({ voices: voicesCache.voices } satisfies VoicesResponse);
  });

  app.get("/audio/credits", async (c) => c.json((await deps.elevenLabs.credits()) satisfies CreditsResponse));

  app.get("/audio", (c) => c.json({ items: deps.repo.list(100).map(toDto) } satisfies AudioGenerationsResponse));

  app.post("/audio", async (c) => {
    const raw: unknown = await c.req.json().catch(() => {
      throw new AppError("VALIDATION_ERROR", "Request body must be JSON", 400);
    });
    const body = StartSpeechRequest.safeParse(raw);
    if (!body.success)
      throw new AppError("VALIDATION_ERROR", "Invalid speech request", 400, { fields: fieldsOf(body.error.issues) });
    const model = speechModel(body.data.model);
    if (!model)
      throw new AppError("VALIDATION_ERROR", `Unknown model: ${body.data.model}`, 400, {
        fields: { model: "Choose an ElevenLabs model" },
      });
    if (body.data.text.length > model.maxChars)
      throw new AppError("VALIDATION_ERROR", `${model.name} takes at most ${model.maxChars} characters`, 400, {
        fields: { text: `At most ${model.maxChars} characters` },
      });

    const settings = settingsFor(model, body.data.settings);
    const result = await deps.elevenLabs.speak({ text: body.data.text, model, voiceId: body.data.voiceId, settings });

    const at = now();
    const id = newId(at);
    const filePath = `${AUDIO_DIR}/${id}.${EXT[result.mediaType] ?? "bin"}`;
    const abs = join(deps.dataDir, filePath);
    const record: AudioRecord = {
      id,
      createdAt: new Date(at).toISOString(),
      model: model.id,
      voiceId: body.data.voiceId,
      voiceName: body.data.voiceName,
      text: body.data.text,
      settings,
      filePath,
      mediaType: result.mediaType,
      characters: result.characters,
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
    const name = `${record.voiceName}-${record.id}.${record.filePath.split(".").pop()}`.replace(/[^\w.-]+/g, "_");
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
