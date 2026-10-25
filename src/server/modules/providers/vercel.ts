import { z } from "zod";
import { MAX_IMAGES, MAX_INPUT_IMAGES } from "../../../shared/generations";
import type { ModelPrice } from "../../../shared/pricing";
import type { ImageModel } from "../../../shared/providers";
import { sniffImage } from "./image-sniff";
import { jsonWithImageRefs, toDataUrl } from "./inline-json";
import {
  type CostLookup,
  type GenerateInput,
  type GenerationResult,
  type ImageProvider,
  ProviderError,
  type ProviderImage,
} from "./port";

const BASE = "https://ai-gateway.vercel.sh/v1";

/** How the gateway produces images for a model (ADR-0012). */
type ModelKind = "images" | "chat";

// Tolerant shapes: unknown keys pass through, so additive API changes don't break parsing.
const CatalogEntry = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  modalities: z
    .looseObject({ input: z.array(z.string()).optional(), output: z.array(z.string()).optional() })
    .optional(),
  pricing: z.looseObject({}).optional(),
});

const usd = (v: unknown): number | null => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const SizePrice = z.looseObject({ size: z.string(), cost: z.unknown() });

/** Vercel list pricing → ModelPrice (SAD §8). Ukiyo sends no size, so the default per-image price applies. */
function toPrice(pricing: Record<string, unknown> | undefined): ModelPrice {
  if (!pricing) return { kind: "unknown" };
  const image = usd(pricing.image);
  if (image !== null) return { kind: "per-image", output: { minUsd: image, maxUsd: image }, input: null };
  const sizes = (Array.isArray(pricing.image_dimension_quality_pricing) ? pricing.image_dimension_quality_pricing : [])
    .flatMap((e) => SizePrice.safeParse(e).data ?? [])
    .flatMap((e) => (usd(e.cost) === null ? [] : [{ size: e.size, cost: usd(e.cost) as number }]));
  const def = sizes.find((e) => e.size === "default");
  if (def) return { kind: "per-image", output: { minUsd: def.cost, maxUsd: def.cost }, input: null };
  if (sizes.length) {
    const costs = sizes.map((e) => e.cost);
    return { kind: "per-image", output: { minUsd: Math.min(...costs), maxUsd: Math.max(...costs) }, input: null };
  }
  if (usd(pricing.output) !== null || usd(pricing.input) !== null) return { kind: "per-token" };
  return { kind: "unknown" };
}
const Catalog = z.looseObject({ data: z.array(CatalogEntry) });
const ImagesAnswer = z.looseObject({
  id: z.string().optional(),
  data: z.array(z.looseObject({ b64_json: z.string().optional() })).default([]),
  providerMetadata: z
    .looseObject({ gateway: z.looseObject({ generationId: z.string().optional() }).optional() })
    .optional(),
});
const ChatImage = z.looseObject({ image_url: z.looseObject({ url: z.string() }) });
const ChatAnswer = z.looseObject({
  id: z.string().optional(),
  choices: z
    .array(z.looseObject({ message: z.looseObject({ images: z.array(ChatImage).optional() }).optional() }))
    .default([]),
});
const ErrorBody = z.object({ error: z.object({ message: z.string() }) });
const Lookup = z.object({
  data: z.looseObject({
    total_cost: z.number().optional(),
    upstream_inference_cost: z.number().optional(),
    is_byok: z.boolean().optional(),
  }),
});

function kindOf(entry: z.infer<typeof CatalogEntry>): ModelKind | null {
  if (entry.type === "image") return "images";
  const imageOutput = entry.tags?.includes("image-generation") || entry.modalities?.output?.includes("image");
  return entry.type === "language" && imageOutput ? "chat" : null;
}

function toModel(entry: z.infer<typeof CatalogEntry>, kind: ModelKind): ImageModel {
  const params: ImageModel["params"] = {};
  // Chat-path models make one image per request; image-only models up to Ukiyo's cap. Seed and aspect ratio
  // are not offered until a real call confirms the gateway honours them (spec §8 D4).
  if (kind === "images") params.n = { max: MAX_IMAGES };
  if (entry.modalities?.input?.includes("image")) params.inputs = { min: 0, max: MAX_INPUT_IMAGES };
  return { id: entry.id, name: entry.name ?? entry.id, params };
}

/** `data:<type>;base64,<payload>` → bytes; anything else (e.g. a remote URL) is not used. */
function fromDataUrl(url: string): Uint8Array {
  const m = /^data:[^;,]+;base64,(.*)$/s.exec(url);
  return m?.[1] ? new Uint8Array(Buffer.from(m[1], "base64")) : new Uint8Array();
}

/** A USD figure as a number or a plain numeric string ("95.50"); an empty string is not zero (review R1). */
const Credits = z.looseObject({ balance: z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]) });

export function createVercelProvider(opts: { apiKey: string | undefined; fetch: typeof fetch }): ImageProvider {
  const fail = (status: number | null, message: string) => new ProviderError("vercel", status, message);
  const kinds = new Map<string, ModelKind>();

  async function call(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
    let res: Response;
    try {
      res = await opts.fetch(url, init);
    } catch (err) {
      if (init.signal?.aborted) throw fail(null, "The provider did not answer in time");
      throw fail(null, `Could not reach Vercel AI Gateway: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ErrorBody.safeParse(body);
      throw fail(
        res.status,
        parsed.success ? parsed.data.error.message : `Vercel AI Gateway answered with status ${res.status}`,
      );
    }
    return { status: res.status, body };
  }

  const prices = new Map<string, ModelPrice>(); // from the same public listing as the models (ADR-0020)

  async function listModels(signal?: AbortSignal): Promise<ImageModel[]> {
    // The catalog is public: no key is sent (Vercel REST reference, «No authentication required»).
    const parsed = Catalog.safeParse((await call(`${BASE}/models`, { signal })).body);
    if (!parsed.success) throw fail(200, "Vercel AI Gateway returned an unexpected model list");
    const models: ImageModel[] = [];
    for (const entry of parsed.data.data) {
      const kind = kindOf(entry);
      if (!kind) continue;
      kinds.set(entry.id, kind);
      prices.set(entry.id, toPrice(entry.pricing));
      models.push(toModel(entry, kind));
    }
    return models;
  }

  /** Decodes and sniffs one image; returns its placeholder for the stored answer (ADR-0008). */
  function keep(images: ProviderImage[], bytes: Uint8Array) {
    const sniffed = sniffImage(bytes);
    if (sniffed) images.push({ ...sniffed, bytes });
    return { $image: sniffed ? images.length : null };
  }

  /** One price lookup (ADR-0013). «Not found yet», throttling, server or network trouble → try again later. */
  async function lookupCost(costRef: string, signal: AbortSignal): Promise<CostLookup> {
    if (!opts.apiKey) return { status: "unavailable" };
    let body: unknown;
    try {
      body = (
        await call(`${BASE}/generation?id=${encodeURIComponent(costRef)}`, {
          headers: { authorization: `Bearer ${opts.apiKey}` },
          signal,
        })
      ).body;
    } catch (err) {
      const status = err instanceof ProviderError ? err.upstreamStatus : null;
      const retry = status === null || status === 404 || status === 408 || status === 429 || status >= 500;
      return retry ? { status: "not-yet" } : { status: "unavailable" };
    }
    const parsed = Lookup.safeParse(body);
    if (!parsed.success) return { status: "unavailable" };
    const { total_cost, upstream_inference_cost, is_byok } = parsed.data.data;
    // Own-key (BYOK) requests: the gateway's total excludes the request; use the upstream price (spec §8 D3).
    const usd = is_byok ? upstream_inference_cost : total_cost;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0 || (is_byok && usd === 0))
      return { status: "unavailable" };
    return { status: "known", costUsd: usd };
  }

  return {
    id: "vercel",
    name: "Vercel AI Gateway",
    configured: Boolean(opts.apiKey),
    listModels,
    lookupCost,

    async balance(signal) {
      // The team's AI Gateway credit balance, a USD string such as "95.50" (ADR-0055).
      const { body } = await call(`${BASE}/credits`, { headers: { authorization: `Bearer ${opts.apiKey}` }, signal });
      const parsed = Credits.safeParse(body);
      const left = parsed.success ? Number(parsed.data.balance) : Number.NaN;
      if (!Number.isFinite(left)) throw fail(null, "Vercel AI Gateway answered a balance Ukiyo can't read");
      return left;
    },

    async priceOf(modelId, signal) {
      if (!prices.has(modelId)) await listModels(signal); // one refresh for a model the listing didn't have
      return prices.get(modelId) ?? { kind: "unknown" };
    },

    async generate(input: GenerateInput, signal: AbortSignal): Promise<GenerationResult> {
      if (!opts.apiKey) throw fail(null, "Vercel AI Gateway is not configured");
      if (!kinds.has(input.model)) await listModels(signal);
      const kind = kinds.get(input.model);
      if (!kind) throw fail(null, "This model is not offered by Vercel AI Gateway for images");

      const inputs = input.inputs ?? [];
      const headers = { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" };
      const post = (path: string, body: unknown) =>
        call(`${BASE}${path}`, {
          method: "POST",
          headers,
          body: typeof body === "string" ? body : JSON.stringify(body),
          signal,
        });
      const images: ProviderImage[] = [];

      // Route per ADR-0012: attached images → edits (D5 default), else the model kind decides.
      if (inputs.length) {
        const base = { model: input.model, prompt: input.prompt, n: input.params.n, response_format: "b64_json" };
        const body = jsonWithImageRefs(base, "images", inputs.map(toDataUrl), (url) => ({ image_url: url }));
        const answer = ImagesAnswer.safeParse((await post("/images/edits", body)).body);
        if (!answer.success) throw fail(200, "Vercel AI Gateway returned an unexpected answer");
        const data = answer.data.data.map((d) => ({
          ...d,
          b64_json: keep(images, Buffer.from(d.b64_json ?? "", "base64")),
        }));
        if (!images.length) throw fail(200, "The provider returned no usable image");
        return {
          images,
          costUsd: null,
          costRef: answer.data.id ?? answer.data.providerMetadata?.gateway?.generationId ?? null,
          acceptedParams: null,
          rawRequest: {
            method: "POST",
            url: `${BASE}/images/edits`,
            body: { ...base, images: inputs.map((_, i) => ({ image_url: { $input: i + 1 } })) },
          },
          rawResponse: { ...answer.data, data },
        };
      }

      if (kind === "images") {
        const body = { model: input.model, prompt: input.prompt, n: input.params.n, response_format: "b64_json" };
        const answer = ImagesAnswer.safeParse((await post("/images/generations", body)).body);
        if (!answer.success) throw fail(200, "Vercel AI Gateway returned an unexpected answer");
        const data = answer.data.data.map((d) => ({
          ...d,
          b64_json: keep(images, Buffer.from(d.b64_json ?? "", "base64")),
        }));
        if (!images.length) throw fail(200, "The provider returned no usable image");
        return {
          images,
          costUsd: null,
          costRef: answer.data.id ?? answer.data.providerMetadata?.gateway?.generationId ?? null,
          acceptedParams: null,
          rawRequest: { method: "POST", url: `${BASE}/images/generations`, body },
          rawResponse: { ...answer.data, data },
        };
      }

      const body = {
        model: input.model,
        messages: [{ role: "user", content: input.prompt }],
        modalities: ["text", "image"],
        stream: false,
      };
      const answer = ChatAnswer.safeParse((await post("/chat/completions", body)).body);
      if (!answer.success) throw fail(200, "Vercel AI Gateway returned an unexpected answer");
      const choices = answer.data.choices.map((c) =>
        c.message?.images
          ? {
              ...c,
              message: {
                ...c.message,
                images: c.message.images.map((img) => ({
                  ...img,
                  image_url: { ...img.image_url, url: keep(images, fromDataUrl(img.image_url.url)) },
                })),
              },
            }
          : c,
      );
      if (!images.length) throw fail(200, "The provider returned no usable image");
      return {
        images,
        costUsd: null,
        costRef: answer.data.id ?? null, // chat answers carry the generation id (Vercel REST reference)
        acceptedParams: null,
        rawRequest: { method: "POST", url: `${BASE}/chat/completions`, body },
        rawResponse: { ...answer.data, choices },
      };
    },
  };
}
