import { z } from "zod";
import {
  AudioGeneration,
  AudioGenerationsResponse,
  CreditsResponse,
  SpeechModelsResponse,
  type StartSpeechRequest,
} from "../../shared/audio";
import { CommentResponse, TagsResponse } from "../../shared/curation";
import { ErrorResponse } from "../../shared/errors";
import {
  CurrentJobResponse,
  Generation,
  GenerationPage,
  JobResponse,
  type ModelFilter,
  ModelGroupsResponse,
  type PromptFilter,
  PromptGroup,
  PromptGroupPage,
  type StartGenerationRequest,
} from "../../shared/generations";
import { HealthResponse } from "../../shared/health";
import { ModelPreference, PreferencesResponse, type SetPreferenceRequest } from "../../shared/models";
import { CostHistory, PriceResponse } from "../../shared/pricing";
import { ModelsResponse, ProvidersResponse } from "../../shared/providers";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<S extends z.ZodType>(schema: S, path: string, init?: RequestInit): Promise<z.infer<S>> {
  const res = await fetch(`/api${path}`, init);
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ErrorResponse.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(res.status, code, message, details);
    }
    throw new ApiError(res.status, "HTTP_ERROR", `Request failed: ${res.status}`);
  }
  return schema.parse(body);
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  health: () => request(HealthResponse, "/health"),
  providers: () => request(ProvidersResponse, "/providers"),
  models: (providerId: string) => request(ModelsResponse, `/providers/${encodeURIComponent(providerId)}/models`),
  price: (providerId: string, model: string) =>
    request(PriceResponse, `/providers/${encodeURIComponent(providerId)}/price?model=${encodeURIComponent(model)}`),
  costHistory: (provider: string, model: string) =>
    request(
      CostHistory,
      `/generations/cost-history?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`,
    ),
  /** JSON for text-only; multipart (`request` JSON part + `inputs` files, in order) when images are attached (ADR-0010). */
  startGeneration: (body: StartGenerationRequest, files: File[] = []) => {
    if (files.length === 0) return request(JobResponse, "/generations", json("POST", body));
    const form = new FormData();
    form.append("request", JSON.stringify(body));
    for (const f of files) form.append("inputs", f, f.name);
    return request(JobResponse, "/generations", { method: "POST", body: form });
  },
  modelPreferences: (provider: string) =>
    request(PreferencesResponse, `/model-preferences?provider=${encodeURIComponent(provider)}`),
  setModelPreference: (body: SetPreferenceRequest) =>
    request(ModelPreference, "/model-preferences", json("PATCH", body)),
  currentJob: () => request(CurrentJobResponse, "/generation-job"),
  dismissJob: () => request(z.null(), "/generation-job", json("DELETE")),
  generations: ((cursor?: string, limit?: number, filter?: ModelFilter | PromptFilter) => {
    const q = new URLSearchParams();
    if (filter && "prompt" in filter) q.set("prompt", filter.prompt);
    else if (filter) {
      q.set("provider", filter.provider);
      q.set("model", filter.model);
    }
    if (cursor) q.set("cursor", cursor);
    if (limit !== undefined) q.set("limit", String(limit));
    const qs = q.toString();
    return request(GenerationPage, `/generations${qs ? `?${qs}` : ""}`);
  }) as {
    // The model-filter signature is last: mocks infer their parameters from it.
    (cursor: string | undefined, limit: number | undefined, filter: PromptFilter): Promise<GenerationPage>;
    (cursor?: string, limit?: number, filter?: ModelFilter): Promise<GenerationPage>;
  },
  promptGroups: (cursor?: string, single?: boolean) => {
    const q = new URLSearchParams();
    if (cursor) q.set("cursor", cursor);
    if (single) q.set("single", "1");
    const qs = q.toString();
    return request(PromptGroupPage, `/generations/prompts${qs ? `?${qs}` : ""}`);
  },
  promptGroup: (key: string) => request(PromptGroup, `/generations/prompts/${encodeURIComponent(key)}`),
  generationModels: (latest: number) => request(ModelGroupsResponse, `/generations/models?latest=${latest}`),
  setComment: (id: string, body: string) =>
    request(CommentResponse, `/generations/${encodeURIComponent(id)}/comment`, json("PUT", { body })),
  addTag: (id: string, tag: string) =>
    request(TagsResponse, `/generations/${encodeURIComponent(id)}/tags`, json("POST", { tag })),
  removeTag: (id: string, tag: string) =>
    request(TagsResponse, `/generations/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`, json("DELETE")),
  deleteGeneration: (id: string) => request(z.null(), `/generations/${encodeURIComponent(id)}`, json("DELETE")),
  generation: (id: string) => request(Generation, `/generations/${encodeURIComponent(id)}`),
  speechModels: () => request(SpeechModelsResponse, "/audio/models"),
  audioCredits: () => request(CreditsResponse, "/audio/credits"),
  audioGenerations: () => request(AudioGenerationsResponse, "/audio"),
  generateSpeech: (body: StartSpeechRequest) => request(AudioGeneration, "/audio", json("POST", body)),
  deleteAudio: (id: string) => request(z.null(), `/audio/${encodeURIComponent(id)}`, json("DELETE")),
};
