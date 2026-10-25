import type { z } from "zod";
import { type SpeechModel, settingsFor } from "../../../shared/speech";
import {
  CreatePresetRequest,
  checkPresetName,
  duplicateNameMessage,
  presetNameKey,
  UpdatePresetRequest,
  type VoicePreset,
  type VoicePresetsResponse,
} from "../../../shared/voice-presets";
import { AppError } from "../../lib/errors";
import { newId as mintId } from "../../lib/ids";
import { ProviderError } from "../providers/port";
import type { SpeechCatalog } from "../providers/speech-catalog";
import type { SpeechRegistry } from "../providers/speech-port";
import { checkVoice } from "./domain";
import { DuplicatePresetName, type PresetRecord, type PresetsRepo } from "./presets-repo";
import { SPEECH_PROVIDER } from "./service";

export type PresetServiceDeps = {
  repo: PresetsRepo;
  speech: SpeechRegistry;
  catalog: SpeechCatalog;
  now?: () => number;
  newId?: (now: number) => string;
};

const fieldsOf = (issues: z.core.$ZodIssue[]) =>
  Object.fromEntries(issues.map((i) => [i.path.join(".") || "body", i.message]));
const invalid = (field: string, message: string) =>
  new AppError("VALIDATION_ERROR", message, 400, { fields: { [field]: message } });
const gone = () => new AppError("NOT_FOUND", "Voice preset not found", 404);

const toDto = (p: PresetRecord): VoicePreset => p;

/** Voice presets (spec voice-presets): save, list with stats, rename, replace the setup, delete (sad.md §4 items 3–4). */
export function createPresetService(deps: PresetServiceDeps) {
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? mintId;

  /**
   * The speech models to validate a setup against: the last catalog read even past its TTL (ADR-0052), fetched only
   * when there was none — a preset change never waits on the provider once Speech has loaded the models (spec §6).
   */
  async function models(): Promise<SpeechModel[]> {
    const p = deps.speech.get(SPEECH_PROVIDER);
    if (!p?.configured)
      throw new AppError("PROVIDER_NOT_CONFIGURED", "OpenRouter is not configured — set OPENROUTER_API_KEY", 409, {
        provider: SPEECH_PROVIDER,
      });
    const cached = deps.catalog.peek(SPEECH_PROVIDER);
    if (cached) return cached.models;
    try {
      return (await deps.catalog.models(SPEECH_PROVIDER)).models;
    } catch (err) {
      if (err instanceof ProviderError)
        throw new AppError("PROVIDER_ERROR", err.message, 502, {
          provider: err.provider,
          upstreamStatus: err.upstreamStatus,
        });
      throw err;
    }
  }

  /** A setup the catalog offers, stored as the model's accepted settings (ADR-0040). */
  async function setupOf(req: { model: string; voice: string | null; settings: Parameters<typeof settingsFor>[1] }) {
    const model = (await models()).find((m) => m.id === req.model);
    if (!model) throw invalid("model", "Choose one of the offered models");
    checkVoice(model, req.voice);
    return {
      provider: SPEECH_PROVIDER,
      model: model.id,
      modelName: model.name,
      voice: req.voice,
      settings: settingsFor(model.controls, req.settings),
    };
  }

  function nameOf(raw: string) {
    const checked = checkPresetName(raw);
    if (!checked.ok) throw invalid("name", checked.message);
    return { name: checked.name, nameKey: presetNameKey(checked.name) };
  }

  const taken = (name: string) => invalid("name", duplicateNameMessage(name));

  return {
    list(): VoicePresetsResponse {
      return { presets: deps.repo.list().map(toDto) };
    },

    get(id: string): VoicePreset {
      const p = deps.repo.get(id);
      if (!p) throw gone();
      return toDto(p);
    },

    async create(body: unknown): Promise<VoicePreset> {
      const parsed = CreatePresetRequest.safeParse(body);
      if (!parsed.success)
        throw new AppError("VALIDATION_ERROR", "Invalid voice preset", 400, { fields: fieldsOf(parsed.error.issues) });
      const name = nameOf(parsed.data.name);
      const setup = await setupOf(parsed.data);
      const at = now();
      const id = newId(at);
      try {
        deps.repo.insert(id, { ...name, ...setup }, new Date(at).toISOString());
      } catch (err) {
        if (err instanceof DuplicatePresetName) throw taken(name.name);
        throw err;
      }
      return this.get(id);
    },

    /** Rename and/or replace the setup; past recordings are never touched (spec AC-06). */
    async update(id: string, body: unknown): Promise<VoicePreset> {
      if (!deps.repo.get(id)) throw gone();
      const parsed = UpdatePresetRequest.safeParse(body);
      if (!parsed.success)
        throw new AppError("VALIDATION_ERROR", "Invalid voice preset change", 400, {
          fields: fieldsOf(parsed.error.issues),
        });
      const b = parsed.data;
      const rename = b.name !== undefined ? nameOf(b.name) : undefined;
      const setup =
        b.model !== undefined
          ? await setupOf({ model: b.model, voice: b.voice ?? null, settings: b.settings ?? {} })
          : undefined;
      try {
        if (!deps.repo.update(id, new Date(now()).toISOString(), { rename, setup })) throw gone();
      } catch (err) {
        if (err instanceof DuplicatePresetName && rename) throw taken(rename.name);
        throw err;
      }
      return this.get(id);
    },

    /** Deletes the preset and its links; its recordings stay, unlinked (spec AC-07, AC-08). */
    remove(id: string): void {
      if (!deps.repo.remove(id)) throw gone();
    },
  };
}

export type PresetService = ReturnType<typeof createPresetService>;
