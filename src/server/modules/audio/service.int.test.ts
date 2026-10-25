import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedRecording } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import type { SpeechModel } from "../../../shared/speech";
import { controlsFor } from "../../../shared/speech-models";
import { AppError } from "../../lib/errors";
import { createCostSync, type Timers } from "../generations/cost-sync";
import { type CostLookup, ProviderError } from "../providers/port";
import { createSpeechCatalog } from "../providers/speech-catalog";
import type { SpeechInput, SpeechProvider, SpeechResult } from "../providers/speech-port";
import { speechRegistryOf } from "../providers/speech-port";
import { createFileStore } from "../storage/file-store";
import { createPresetsRepo } from "./presets-repo";
import { createRecordingsRepo } from "./repo";
import { createAudioService } from "./service";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2]);

const model = (over: Partial<SpeechModel> & { id: string }): SpeechModel => ({
  name: over.id,
  maker: "ElevenLabs",
  maxChars: 5000,
  maxCharsSource: "family",
  voiceMode: "required",
  voices: ["george", "sarah"],
  price: { unit: "per-character", usdPerChar: 0.00008 },
  controls: controlsFor(over.id),
  ...over,
});

const MODELS: SpeechModel[] = [
  model({ id: "elevenlabs/eleven-v3", name: "Eleven v3" }),
  model({ id: "fish-audio/s1", name: "S1", maker: "Fish Audio", voiceMode: "optional", voices: [] }),
  model({ id: "google/gemini-3.8-flash-tts", name: "Gemini TTS", maker: "Google", voices: ["Kore"] }),
];

type Speak = (input: SpeechInput, signal: AbortSignal) => Promise<SpeechResult>;

/** A fake speech provider; `speak` is swappable per test, and every input it receives is recorded. */
function fakeProvider(opts: { configured?: boolean; speak?: Speak; lookup?: CostLookup } = {}) {
  const inputs: SpeechInput[] = [];
  let speak: Speak =
    opts.speak ?? (async () => ({ bytes: MP3, mediaType: "audio/mpeg", costUsd: null, costRef: "gen-tts-1" }));
  const p: SpeechProvider = {
    id: "openrouter",
    name: "OpenRouter",
    configured: opts.configured ?? true,
    listModels: async () => MODELS,
    speak: (input, signal) => {
      inputs.push(input);
      return speak(input, signal);
    },
    lookupCost: async () => opts.lookup ?? { status: "not-yet" },
  };
  return { p, inputs, setSpeak: (s: Speak) => (speak = s) };
}

/** Timers the test fires by hand. */
function manualTimers() {
  const queue: (() => void)[] = [];
  const timers: Timers = { set: (fn) => queue.push(fn), clear: () => {} };
  const fireAll = () => {
    for (const f of queue.splice(0)) f();
  };
  return { timers, fireAll };
}

function setup(opts: Parameters<typeof fakeProvider>[0] & { timeoutMs?: number } = {}) {
  t = createTestApp();
  const fake = fakeProvider(opts);
  const speech = speechRegistryOf([fake.p]);
  const repo = createRecordingsRepo(t.db);
  const files = createFileStore(t.dataDir);
  const clock = manualTimers();
  const costSync = createCostSync({
    repo,
    lookupFor: (id) => speech.get(id)?.lookupCost,
    timers: clock.timers,
  });
  const service = createAudioService({
    presets: createPresetsRepo(t.db),
    speech,
    catalog: createSpeechCatalog(speech),
    repo,
    files,
    costSync,
    timeoutMs: opts.timeoutMs ?? 180_000,
  });
  return { service, repo, fake, clock };
}

let t: ReturnType<typeof createTestApp>;
afterEach(() => t.cleanup());

async function appError(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("expected an AppError");
}

const audioFiles = () => (existsSync(join(t.dataDir, "audio")) ? readdirSync(join(t.dataDir, "audio")) : []);
const staged = () => readdirSync(join(t.dataDir, ".staging"));

describe("audio service — generate", () => {
  it("saves the recording with its file, sent settings, billed characters, estimate and a pending cost", async () => {
    const { service, repo, fake } = setup();
    const r = await service.start({
      text: "  Hello there  ",
      model: "elevenlabs/eleven-v3",
      voice: "george",
      settings: { stability: 0.4, similarity: 0.8, speed: 1.1, instructions: "slow" },
    });
    expect(fake.inputs[0]?.settings).toEqual({ stability: 0.5, similarity: 0.8, style: 0 }); // v3: steps, no speed
    expect(r).toMatchObject({
      provider: "openrouter",
      model: "elevenlabs/eleven-v3",
      modelName: "Eleven v3",
      voice: "george",
      text: "Hello there",
      settings: { stability: 0.5, similarity: 0.8, style: 0 },
      mediaType: "audio/mpeg",
      characters: 11,
      costMicros: null,
      costStatus: "pending",
      estimateMicros: 880,
      url: `/api/audio/recordings/${r.id}/file`,
    });
    expect(repo.get(r.id)).toMatchObject({ costRef: "gen-tts-1", filePath: `audio/${r.id}.mp3` });
    expect(audioFiles()).toEqual([`${r.id}.mp3`]);
    expect(staged()).toEqual([]);
  });

  it("resolves the pending cost through the provider's lookup", async () => {
    const { service, repo, clock } = setup({ lookup: { status: "known", costUsd: 0.00088 } });
    const r = await service.start({ text: "Hello there", model: "elevenlabs/eleven-v3", voice: "george" });
    clock.fireAll();
    await new Promise((res) => setTimeout(res, 10));
    expect(repo.get(r.id)).toMatchObject({ costStatus: "known", costMicros: 880 });
  });

  it("records a stated price as known, and no reference as unavailable", async () => {
    const stated = setup({
      speak: async () => ({ bytes: MP3, mediaType: "audio/mpeg", costUsd: 0.001, costRef: "gen-x" }),
    });
    expect(await stated.service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" })).toMatchObject({
      costStatus: "known",
      costMicros: 1000,
    });
    stated.fake.setSpeak(async () => ({ bytes: MP3, mediaType: "audio/mpeg", costUsd: null, costRef: null }));
    expect(await stated.service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" })).toMatchObject({
      costStatus: "unavailable",
      costMicros: null,
    });
  });

  it("wraps raw PCM as a WAV file and records it as such", async () => {
    const { service } = setup({
      speak: async () => ({
        bytes: new Uint8Array(480),
        mediaType: "audio/pcm;rate=24000;channels=1",
        costUsd: null,
        costRef: "g",
      }),
    });
    const r = await service.start({ text: "Hi", model: "google/gemini-3.8-flash-tts", voice: "Kore" });
    expect(r.mediaType).toBe("audio/wav");
    expect(audioFiles()).toEqual([`${r.id}.wav`]);
  });

  it("sends no voice for the provider default, or a typed one, on a model without listed voices", async () => {
    const { service, fake } = setup();
    const a = await service.start({ text: "Hi", model: "fish-audio/s1" });
    expect(fake.inputs[0]?.voice).toBeNull();
    expect(a.voice).toBeNull();
    const b = await service.start({ text: "Hi", model: "fish-audio/s1", voice: "my-voice-id" });
    expect(b.voice).toBe("my-voice-id");
  });
});

describe("audio service — refusals and failures", () => {
  it("refuses blank text, an unknown model, text over the model's limit and a voice the model doesn't offer", async () => {
    const { service, fake } = setup();
    const blank = await appError(service.start({ text: "   ", model: "elevenlabs/eleven-v3", voice: "george" }));
    expect(blank).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      details: { fields: { text: expect.any(String) } },
    });
    const unknown = await appError(service.start({ text: "Hi", model: "nobody/nothing", voice: "x" }));
    expect(unknown).toMatchObject({ code: "VALIDATION_ERROR", details: { fields: { model: expect.any(String) } } });
    const long = await appError(
      service.start({ text: "a".repeat(5001), model: "elevenlabs/eleven-v3", voice: "george" }),
    );
    expect(long.message).toBe("Eleven v3 takes at most 5 000 characters");
    expect(long.details).toEqual({ fields: { text: "At most 5 000 characters" } });
    expect(
      await service.start({ text: "a".repeat(5000), model: "elevenlabs/eleven-v3", voice: "george" }),
    ).toBeTruthy();
    const voice = await appError(service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "nobody" }));
    expect(voice).toMatchObject({ code: "VALIDATION_ERROR", details: { fields: { voice: expect.any(String) } } });
    const noVoice = await appError(service.start({ text: "Hi", model: "elevenlabs/eleven-v3" }));
    expect(noVoice.details).toEqual({ fields: { voice: "Choose a voice" } });
    expect(fake.inputs).toHaveLength(1); // only the 5 000-character request reached the provider
  });

  it("says OpenRouter is not configured, and sends nothing", async () => {
    const { service, fake } = setup({ configured: false });
    const err = await appError(service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }));
    expect(err).toMatchObject({ code: "PROVIDER_NOT_CONFIGURED", status: 409, details: { provider: "openrouter" } });
    expect(fake.inputs).toHaveLength(0);
  });

  it("passes the provider's refusal through and saves nothing", async () => {
    const { service } = setup({
      speak: async () => {
        throw new ProviderError("openrouter", 402, "Insufficient credits");
      },
    });
    const err = await appError(service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }));
    expect(err).toMatchObject({
      code: "PROVIDER_ERROR",
      status: 502,
      message: "Insufficient credits",
      details: { provider: "openrouter", upstreamStatus: 402 },
    });
    expect(audioFiles()).toEqual([]);
  });

  it("ends a request with no answer after the time limit and warns it may still be charged", async () => {
    const { service, repo } = setup({
      timeoutMs: 30,
      speak: (_input, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new ProviderError("openrouter", null, "did not answer in time")),
          ),
        ),
    });
    const err = await appError(service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }));
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).toBe("The provider did not answer within 0.03 s — the provider may still charge for it");
    expect(repo.allIds()).toEqual([]);
  });

  it("refuses audio it can't make playable as a save failure, leaving nothing behind", async () => {
    const { service, repo } = setup({
      speak: async () => ({ bytes: MP3, mediaType: "audio/ogg", costUsd: null, costRef: "g" }),
    });
    const err = await appError(service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }));
    expect(err).toMatchObject({
      code: "STORAGE_ERROR",
      status: 500,
      message: "The audio arrived but couldn't be saved — the provider may still charge for it",
    });
    expect(repo.allIds()).toEqual([]);
    expect(audioFiles()).toEqual([]);
    expect(staged()).toEqual([]);
  });

  it("leaves no row and no file when the file can't be put in place", async () => {
    const { service, repo } = setup();
    const first = await service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" });
    // Same id minted again → the commit finds the file already there and throws inside the transaction.
    const clash = createAudioService({
      presets: createPresetsRepo(t.db),
      ...{ speech: speechRegistryOf([fakeProvider().p]) },
      catalog: createSpeechCatalog(speechRegistryOf([fakeProvider().p])),
      repo,
      files: createFileStore(t.dataDir),
      costSync: createCostSync({ repo, lookupFor: () => undefined }),
      timeoutMs: 1000,
      newId: () => first.id,
    });
    const err = await appError(clash.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }));
    expect(err.code).toBe("STORAGE_ERROR");
    expect(repo.allIds()).toEqual([first.id]);
    expect(audioFiles()).toEqual([`${first.id}.mp3`]);
    expect(staged()).toEqual([]);
  });
});

describe("audio service — list, delete, file", () => {
  it("lists the latest recordings with the model name from the catalog when none was stored", async () => {
    const { service } = setup();
    seedRecording(t.db, t.dataDir, { modelName: null, model: "elevenlabs/eleven-v3" });
    seedRecording(t.db, t.dataDir, { modelName: null, model: "retired/model" });
    // A read never waits on the catalog (audio-gallery ADR-0052): before any catalog read, the id shows.
    expect((await service.list({ limit: 10 })).items.map((r) => r.modelName)).toEqual([
      "retired/model",
      "elevenlabs/eleven-v3",
    ]);
    await service.models(); // the Speech page reads the catalog; its names are kept
    const page = await service.list({ limit: 10 });
    expect(page.items.map((r) => r.modelName)).toEqual(["retired/model", "Eleven v3"]);
    expect(page.nextCursor).toBeNull();
  });

  it("deletes a recording and its file together and stops waiting for its cost", async () => {
    const { service, repo } = setup();
    const r = await service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" });
    await service.remove(r.id);
    expect(repo.get(r.id)).toBeUndefined();
    expect(audioFiles()).toEqual([]);
    expect(staged()).toEqual([]);
    expect((await appError(service.remove(r.id))).code).toBe("NOT_FOUND");
  });

  it("serves a recording's file from inside the data dir, and not-found for a missing one", async () => {
    const { service } = setup();
    const rec = seedRecording(t.db, t.dataDir);
    const file = await service.file(rec.id);
    expect(file.mediaType).toBe("audio/mpeg");
    expect(file.path).toBe(join(t.dataDir, rec.filePath));
    expect((await appError(service.file("01NOSUCHRECORDING000000000"))).code).toBe("NOT_FOUND");
  });

  it("keeps the recording and its file when the deletion fails, answers a storage error, and still awaits its cost", async () => {
    t = createTestApp();
    const fake = fakeProvider();
    const speech = speechRegistryOf([fake.p]);
    const repo = createRecordingsRepo(t.db);
    const real = createFileStore(t.dataDir);
    const files = {
      ...real,
      trashAudioSync: (path: string) => {
        real.trashAudioSync(path);
        throw new Error("rename failed half-way");
      },
    } as typeof real;
    const forgotten: string[] = [];
    const costSync = createCostSync({ repo, lookupFor: () => undefined });
    const service = createAudioService({
      presets: createPresetsRepo(t.db),
      speech,
      catalog: createSpeechCatalog(speech),
      repo,
      files,
      costSync: { ...costSync, forget: (id: string) => forgotten.push(id) } as typeof costSync,
      timeoutMs: 1000,
    });
    const rec = seedRecording(t.db, t.dataDir, { tags: ["intro"], comment: "keep" });
    const err = await appError(service.remove(rec.id));
    expect(err).toMatchObject({ code: "STORAGE_ERROR", status: 500, message: "Couldn't delete this recording" });
    expect(repo.get(rec.id)).toBeDefined();
    // its tags and comment stay with it (audio-gallery AC-12)
    expect(repo.curationOf([rec.id]).get(rec.id)).toMatchObject({ tags: ["intro"], comment: { body: "keep" } });
    expect(existsSync(join(t.dataDir, rec.filePath))).toBe(true);
    expect(forgotten).toEqual([]);
  });

  it("stops waiting for a deleted recording's cost", async () => {
    t = createTestApp();
    const fake = fakeProvider();
    const speech = speechRegistryOf([fake.p]);
    const repo = createRecordingsRepo(t.db);
    const forgotten: string[] = [];
    const costSync = createCostSync({ repo, lookupFor: () => undefined });
    const service = createAudioService({
      presets: createPresetsRepo(t.db),
      speech,
      catalog: createSpeechCatalog(speech),
      repo,
      files: createFileStore(t.dataDir),
      costSync: { ...costSync, forget: (id: string) => forgotten.push(id) } as typeof costSync,
      timeoutMs: 1000,
    });
    const rec = seedRecording(t.db, t.dataDir);
    await service.remove(rec.id);
    expect(forgotten).toEqual([rec.id]);
  });

  it("drops a partly written staged file when staging fails", async () => {
    t = createTestApp();
    const fake = fakeProvider();
    const speech = speechRegistryOf([fake.p]);
    const repo = createRecordingsRepo(t.db);
    const real = createFileStore(t.dataDir);
    const files = {
      ...real,
      stageAudio: async (id: string, bytes: Uint8Array, mediaType: string) => {
        await real.stageAudio(id, bytes.slice(0, 2), mediaType); // half the bytes reached the disk
        throw new Error("ENOSPC");
      },
    } as typeof real;
    const service = createAudioService({
      presets: createPresetsRepo(t.db),
      speech,
      catalog: createSpeechCatalog(speech),
      repo,
      files,
      costSync: createCostSync({ repo, lookupFor: () => undefined }),
      timeoutMs: 1000,
    });
    const err = await appError(service.start({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }));
    expect(err.code).toBe("STORAGE_ERROR");
    expect(staged()).toEqual([]);
    expect(repo.allIds()).toEqual([]);
  });
});
