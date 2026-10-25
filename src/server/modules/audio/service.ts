import type { z } from "zod";
import {
  AddTagRequest,
  type CommentResponse,
  checkComment,
  normalizeTag,
  SetCommentRequest,
  type TagsResponse,
} from "../../../shared/curation";
import {
  billedChars,
  estimateMicros,
  type Recording,
  type RecordingModelGroupsResponse,
  type RecordingPage,
  type SpeechModel,
  type SpeechModelsResponse,
  StartSpeechRequest,
  settingsFor,
} from "../../../shared/speech";
import { AppError } from "../../lib/errors";
import { newId as mintId } from "../../lib/ids";
import type { CostSync } from "../generations/cost-sync";
import { ProviderError } from "../providers/port";
import type { SpeechCatalog } from "../providers/speech-catalog";
import type { SpeechProvider, SpeechRegistry, SpeechResult } from "../providers/speech-port";
import type { FileStore } from "../storage/file-store";
import { costFromResult, groupDigits, toRecordingDto } from "./domain";
import type { RecordingRecord, RecordingsRepo } from "./repo";
import { AudioConversionError, toPlayable } from "./wav";

export const SPEECH_PROVIDER = "openrouter";

export type AudioServiceDeps = {
  speech: SpeechRegistry;
  catalog: SpeechCatalog;
  repo: RecordingsRepo;
  files: FileStore;
  costSync: CostSync;
  /** Provider request timeout (spec §6: 180 s, same as images). */
  timeoutMs: number;
  now?: () => number;
  /** Id minting — injectable so a test can force a clash. */
  newId?: (now: number) => string;
};

const SAVE_FAILED = "The audio arrived but couldn't be saved — the provider may still charge for it";

const fieldsOf = (issues: z.core.$ZodIssue[]) =>
  Object.fromEntries(issues.map((i) => [i.path.join(".") || "body", i.message]));

const providerFailure = (err: ProviderError, message = err.message) =>
  new AppError("PROVIDER_ERROR", message, 502, { provider: err.provider, upstreamStatus: err.upstreamStatus });

/**
 * Text-to-speech recordings (spec text-to-speech): validate against the model, speak through the port, save the
 * audio and the row atomically, resolve the cost later, delete atomically. Never branches on the provider.
 */
export function createAudioService(deps: AudioServiceDeps) {
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? mintId;

  function provider(): SpeechProvider {
    const p = deps.speech.get(SPEECH_PROVIDER);
    if (!p?.configured)
      throw new AppError("PROVIDER_NOT_CONFIGURED", "OpenRouter is not configured — set OPENROUTER_API_KEY", 409, {
        provider: SPEECH_PROVIDER,
      });
    return p;
  }

  async function catalogModels(): Promise<{ models: SpeechModel[]; fetchedAt: number }> {
    try {
      return await deps.catalog.models(SPEECH_PROVIDER);
    } catch (err) {
      if (err instanceof ProviderError) throw providerFailure(err);
      throw err;
    }
  }

  /**
   * One display name per model id: the name stored with its newest recording that has one, else the last catalog
   * read, else the id. Pure SQL plus an in-memory lookup — a read never waits on the provider (ADR-0052).
   */
  function displayNames(models: readonly string[]): Map<string, string> {
    const stored = deps.repo.storedNames(models);
    const cached = deps.catalog.peek(SPEECH_PROVIDER)?.models;
    const names = new Map<string, string>();
    for (const m of new Set(models)) names.set(m, stored.get(m) ?? cached?.find((c) => c.id === m)?.name ?? m);
    return names;
  }

  /** Recordings as the browser sees them: one name per model, their tags and comment (ADR-0051). */
  function toDtos(records: readonly RecordingRecord[]): Recording[] {
    const names = displayNames(records.map((r) => r.model));
    const curation = deps.repo.curationOf(records.map((r) => r.id));
    return records.map((r) => toRecordingDto(r, names.get(r.model), curation.get(r.id)));
  }

  const invalid = (field: string, message: string) =>
    new AppError("VALIDATION_ERROR", message, 400, { fields: { [field]: message } });
  const gone = () => new AppError("NOT_FOUND", "Recording not found", 404);

  function checkVoice(model: SpeechModel, voice: string | null): void {
    if (voice === null && model.voiceMode === "required")
      throw new AppError("VALIDATION_ERROR", "Choose a voice", 400, { fields: { voice: "Choose a voice" } });
    if (voice !== null && model.voiceMode === "required" && !model.voices.includes(voice))
      throw new AppError("VALIDATION_ERROR", `${model.name} doesn't offer the voice «${voice}»`, 400, {
        fields: { voice: "Choose one of this model's voices" },
      });
  }

  async function speak(p: SpeechProvider, input: Parameters<SpeechProvider["speak"]>[0]): Promise<SpeechResult> {
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort(new DOMException("timeout", "TimeoutError"));
    }, deps.timeoutMs);
    try {
      return await p.speak(input, ac.signal);
    } catch (err) {
      if (timedOut)
        throw new AppError(
          "PROVIDER_ERROR",
          `The provider did not answer within ${deps.timeoutMs / 1000} s — the provider may still charge for it`,
          502,
          { provider: p.id, upstreamStatus: null },
        );
      if (err instanceof ProviderError) throw providerFailure(err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async models(): Promise<SpeechModelsResponse> {
      const { models, fetchedAt } = await catalogModels();
      return { models, fetchedAt: new Date(fetchedAt).toISOString() };
    },

    /** Generates one recording and saves it with its file; the answer is the saved recording (ADR-0045). */
    async start(body: unknown): Promise<Recording> {
      const parsed = StartSpeechRequest.safeParse(body);
      if (!parsed.success)
        throw new AppError("VALIDATION_ERROR", "Invalid speech request", 400, {
          fields: fieldsOf(parsed.error.issues),
        });
      const req = parsed.data;
      const p = provider();
      const model = (await catalogModels()).models.find((m) => m.id === req.model);
      if (!model)
        throw new AppError("VALIDATION_ERROR", `Unknown speech model: ${req.model}`, 400, {
          fields: { model: "Choose one of the offered models" },
        });
      const characters = billedChars(req.text);
      if (characters > model.maxChars)
        throw new AppError(
          "VALIDATION_ERROR",
          `${model.name} takes at most ${groupDigits(model.maxChars)} characters`,
          400,
          {
            fields: { text: `At most ${groupDigits(model.maxChars)} characters` },
          },
        );
      checkVoice(model, req.voice);
      const settings = settingsFor(model.controls, req.settings);

      const startedAt = now();
      const sentAt = performance.now();
      const result = await speak(p, { model, text: req.text, voice: req.voice, settings });
      const durationMs = Math.round(performance.now() - sentAt);

      let audio: ReturnType<typeof toPlayable>;
      try {
        audio = toPlayable(result.bytes, result.mediaType);
      } catch (err) {
        if (err instanceof AudioConversionError) {
          console.error(`audio: ${model.id} answered unplayable audio (${result.mediaType})`);
          throw new AppError("STORAGE_ERROR", SAVE_FAILED, 500);
        }
        throw err;
      }

      const id = newId(startedAt);
      const record: RecordingRecord = {
        id,
        provider: p.id,
        model: model.id,
        modelName: model.name,
        voice: req.voice,
        text: req.text,
        settings,
        filePath: `audio/${id}.${audio.mediaType === "audio/wav" ? "wav" : "mp3"}`,
        mediaType: audio.mediaType,
        characters,
        ...costFromResult(result.costUsd, result.costRef),
        estimateMicros: estimateMicros(characters, model.price),
        createdAt: new Date(startedAt).toISOString(),
        durationMs,
      };
      try {
        await deps.files.stageAudio(id, audio.bytes, audio.mediaType);
        deps.repo.insertAtomic(record, () => deps.files.commitAudioSync(record.filePath));
      } catch (err) {
        // The staged copy (even a partly written one) is always this request's. A file already in place is
        // dropped only when no row owns it (a failed COMMIT after the rename) — with a clashing id it is another's.
        if (deps.repo.get(id)) deps.files.discardStagedAudio(record.filePath);
        else deps.files.discardAudio(record.filePath);
        console.error(`audio: could not save ${id}`, err);
        throw new AppError("STORAGE_ERROR", SAVE_FAILED, 500);
      }
      if (record.costStatus === "pending")
        deps.costSync.track({
          id,
          provider: p.id,
          costRef: record.costRef,
          answeredAt: startedAt + durationMs,
        });
      return toRecordingDto(record, model.name);
    },

    /** Newest first, all or one exact model id (audio-gallery AC-13). */
    async list(q: { cursor?: string; limit: number; model?: string }): Promise<RecordingPage> {
      const page = deps.repo.list(q);
      return { items: toDtos(page.items), nextCursor: page.nextCursor };
    },

    async get(id: string): Promise<Recording> {
      const rec = deps.repo.get(id);
      if (!rec) throw gone();
      return toDtos([rec])[0] as Recording;
    },

    /** Every model with recordings, newest model first, with its count and latest `latest` recordings (AC-14). */
    async modelGroups(latest: number): Promise<RecordingModelGroupsResponse> {
      const groups = deps.repo.modelGroups({ latest });
      const names = displayNames(groups.map((g) => g.model));
      const items = toDtos(groups.flatMap((g) => g.items));
      return {
        models: groups.map((g) => ({
          provider: g.provider,
          model: g.model,
          modelName: names.get(g.model) ?? g.model,
          count: g.count,
          latestId: g.latestId,
          items: items.filter((r) => r.model === g.model),
        })),
      };
    },

    /** Replaces the comment; blank removes it (shared rules, audio-gallery AC-07/AC-08). */
    setComment(id: string, body: unknown): CommentResponse {
      const parsed = SetCommentRequest.safeParse(body);
      if (!parsed.success) throw invalid("body", "Comment must be text");
      const checked = checkComment(parsed.data.body);
      if (!checked.ok) throw invalid("body", checked.message);
      const res = deps.repo.setComment(id, checked.body, new Date(now()).toISOString());
      if (res.status === "missing") throw gone();
      return { comment: res.comment };
    },

    /** Adds one normalized tag; a duplicate leaves the list unchanged; at most 10. */
    addTag(id: string, body: unknown): TagsResponse {
      const parsed = AddTagRequest.safeParse(body);
      if (!parsed.success) throw invalid("tag", parsed.error.issues[0]?.message ?? "Tag must be text");
      const normalized = normalizeTag(parsed.data.tag);
      if (!normalized.ok) throw invalid("tag", normalized.message);
      const res = deps.repo.addTag(id, normalized.tag);
      if (res.status === "missing") throw gone();
      if (res.status === "limit") throw invalid("tag", "A recording can have at most 10 tags");
      return { tags: res.tags };
    },

    removeTag(id: string, raw: string): TagsResponse {
      const normalized = normalizeTag(raw);
      const res = deps.repo.removeTag(id, normalized.ok ? normalized.tag : raw);
      if (res.status === "missing") throw gone();
      return { tags: res.tags };
    },

    /** Reads the catalog once in the background when some recording has no stored name (ADR-0052). Never throws. */
    warmCatalog(): void {
      if (!deps.repo.hasUnnamed()) return;
      deps.catalog.models(SPEECH_PROVIDER).catch(() => {});
    },

    /** Deletes the recording and its file together (AC-16): the file moves to trash as the transaction's last step. */
    async remove(id: string): Promise<void> {
      const rec = deps.repo.get(id);
      if (!rec) throw new AppError("NOT_FOUND", "Recording not found", 404);
      try {
        if (!deps.repo.deleteAtomic(id, (path) => deps.files.trashAudioSync(path)))
          throw new AppError("NOT_FOUND", "Recording not found", 404);
      } catch (err) {
        if (err instanceof AppError) throw err;
        try {
          deps.files.restoreAudioSync(rec.filePath);
        } catch (restoreErr) {
          console.error(`audio: could not restore the file of ${id}; the boot sweep will retry`, restoreErr);
        }
        console.error(`audio: deletion of ${id} failed`, err);
        throw new AppError("STORAGE_ERROR", "Couldn't delete this recording", 500);
      }
      deps.costSync.forget(id);
      try {
        deps.files.purgeAudio(rec.filePath);
      } catch (err) {
        console.error(`audio: purge of deleted ${id} failed — the boot sweep will finish it`, err);
      }
    },

    /** The recording's file on disk, for serving; not found when the row or the file is gone. */
    async file(id: string): Promise<{ path: string; mediaType: Recording["mediaType"]; record: RecordingRecord }> {
      const rec = deps.repo.get(id);
      const size = rec ? await deps.files.sizeRecorded(rec.filePath) : null;
      if (!rec || size === null) throw new AppError("NOT_FOUND", "Recording not found", 404);
      return { path: deps.files.resolveRecorded(rec.filePath), mediaType: rec.mediaType, record: rec };
    },

    allIds: () => deps.repo.allIds(),
  };
}

export type AudioService = ReturnType<typeof createAudioService>;
