import { z } from "zod";
import { MAX_IMAGES, MAX_INPUT_IMAGES } from "../../../shared/generations";
import type { ModelPrice } from "../../../shared/pricing";
import type { ImageModel } from "../../../shared/providers";
import { sniffImage } from "./image-sniff";
import { jsonWithImageRefs, toDataUrl } from "./inline-json";
import {
  type GenerateInput,
  type GenerationResult,
  type ImageProvider,
  ProviderError,
  type ProviderImage,
} from "./port";

const BASE = "https://openrouter.ai/api/v1";

// Tolerant shapes: unknown keys pass through, so additive API changes don't break parsing.
const Descriptor = z.looseObject({
  type: z.string().optional(),
  values: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
const CatalogEntry = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  architecture: z.looseObject({ output_modalities: z.array(z.string()).optional() }).optional(),
  supported_parameters: z.record(z.string(), Descriptor).optional(),
});
const Catalog = z.looseObject({ data: z.array(CatalogEntry) });
const ImagesResponse = z.looseObject({
  data: z.array(z.looseObject({ b64_json: z.string().optional(), media_type: z.string().optional() })).default([]),
  usage: z.looseObject({ cost: z.number().nullable().optional() }).optional(),
});
const ErrorBody = z.object({
  error: z.object({
    message: z.string(),
    metadata: z.looseObject({ reasons: z.array(z.string()).optional() }).optional(),
  }),
});

const PriceItem = z.looseObject({ billable: z.string(), unit: z.string(), cost_usd: z.number() });
const Endpoints = z.looseObject({
  endpoints: z.array(z.looseObject({ pricing: z.array(z.unknown()).default([]) })).default([]),
});

const range = (xs: number[]) => (xs.length ? { minUsd: Math.min(...xs), maxUsd: Math.max(...xs) } : null);

/** OpenRouter endpoints pricing → ModelPrice (SAD §8): per-image wins over per-token; nothing usable → unknown. */
function toPrice(body: z.infer<typeof Endpoints>): ModelPrice {
  const items = body.endpoints.flatMap((e) => e.pricing.flatMap((p) => PriceItem.safeParse(p).data ?? []));
  const usd = (billable: string, unit: string) =>
    items.filter((p) => p.billable === billable && p.unit === unit && p.cost_usd >= 0).map((p) => p.cost_usd);
  const output = range(usd("output_image", "image"));
  if (output) return { kind: "per-image", output, input: range(usd("input_image", "image")) };
  if (usd("output_image", "token").length) return { kind: "per-token" };
  return { kind: "unknown" };
}

function toModel(entry: z.infer<typeof CatalogEntry>): ImageModel {
  const sp = entry.supported_parameters ?? {};
  const params: ImageModel["params"] = {};
  if (sp.aspect_ratio?.values?.length) params.aspectRatio = { values: sp.aspect_ratio.values };
  if (sp.n) params.n = { max: Math.max(1, Math.min(MAX_IMAGES, sp.n.max ?? 1)) };
  if (sp.seed) params.seed = sp.seed.type === "range" ? { min: sp.seed.min, max: sp.seed.max } : {};
  const refs = sp.input_references;
  if (refs && (refs.max ?? 0) >= 1)
    params.inputs = { min: Math.max(0, refs.min ?? 0), max: Math.min(MAX_INPUT_IMAGES, refs.max ?? 0) };
  return { id: entry.id, name: entry.name ?? entry.id, params };
}

const Credits = z.looseObject({ data: z.looseObject({ total_credits: z.number(), total_usage: z.number() }) });

export function createOpenRouterProvider(opts: { apiKey: string | undefined; fetch: typeof fetch }): ImageProvider {
  const fail = (status: number | null, message: string) => new ProviderError("openrouter", status, message);

  async function call(url: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await opts.fetch(url, init);
    } catch (err) {
      if (init.signal?.aborted) throw fail(null, "The provider did not answer in time");
      throw fail(null, `Could not reach OpenRouter: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ErrorBody.safeParse(body);
      const reasons = parsed.success ? parsed.data.error.metadata?.reasons : undefined;
      const message = parsed.success ? parsed.data.error.message : `OpenRouter answered with status ${res.status}`;
      throw fail(res.status, reasons?.length ? `${message} (${reasons.join(", ")})` : message);
    }
    return body;
  }

  return {
    id: "openrouter",
    name: "OpenRouter",
    configured: Boolean(opts.apiKey),

    async balance(signal) {
      // The key's account credits (same read as step 18's speech line): purchased minus used (ADR-0055).
      const parsed = Credits.safeParse(
        await call(`${BASE}/credits`, { headers: { authorization: `Bearer ${opts.apiKey}` }, signal }),
      );
      const left = parsed.success ? parsed.data.data.total_credits - parsed.data.data.total_usage : Number.NaN;
      if (!Number.isFinite(left)) throw fail(null, "OpenRouter answered credits Ukiyo can't read");
      return left;
    },

    async priceOf(modelId, signal) {
      // Public listing — no key (ADR-0020). Each part of the id is encoded; ids come from the catalog (prices.ts).
      const path = modelId.split("/").map(encodeURIComponent).join("/");
      const parsed = Endpoints.safeParse(await call(`${BASE}/images/models/${path}/endpoints`, { signal }));
      return parsed.success ? toPrice(parsed.data) : { kind: "unknown" };
    },

    async listModels(signal) {
      const parsed = Catalog.safeParse(await call(`${BASE}/images/models`, { signal }));
      if (!parsed.success) throw fail(200, "OpenRouter returned an unexpected model list");
      return parsed.data.data.filter((e) => e.architecture?.output_modalities?.includes("image") ?? true).map(toModel);
    },

    async generate(input: GenerateInput, signal: AbortSignal): Promise<GenerationResult> {
      if (!opts.apiKey) throw fail(null, "OpenRouter is not configured");
      const url = `${BASE}/images`;
      const inputs = input.inputs ?? [];
      const reference = (url: unknown) => ({ type: "image_url", image_url: { url } });
      const base = {
        model: input.model,
        prompt: input.prompt,
        n: input.params.n,
        ...(input.params.aspectRatio !== undefined ? { aspect_ratio: input.params.aspectRatio } : {}),
        ...(input.params.seed !== undefined ? { seed: input.params.seed } : {}),
      };
      const body = inputs.length
        ? jsonWithImageRefs(base, "input_references", inputs.map(toDataUrl), reference)
        : JSON.stringify(base);
      // The stored request keeps a placeholder per input; `generations` links it to the stored copy (ADR-0008).
      const redactedBody = inputs.length
        ? { ...base, input_references: inputs.map((_, i) => reference({ $input: i + 1 })) }
        : base;
      const raw = await call(url, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body,
        signal,
      });
      const parsed = ImagesResponse.safeParse(raw);
      if (!parsed.success) throw fail(200, "OpenRouter returned an unexpected answer");

      const images: ProviderImage[] = [];
      const redacted = parsed.data.data.map((item) => {
        const bytes = item.b64_json ? new Uint8Array(Buffer.from(item.b64_json, "base64")) : new Uint8Array();
        const sniffed = sniffImage(bytes);
        if (sniffed) images.push({ ...sniffed, bytes });
        return { ...item, b64_json: { $image: sniffed ? images.length : null } };
      });
      if (images.length === 0) throw fail(200, "The provider returned no usable image");

      const cost = parsed.data.usage?.cost;
      return {
        images,
        costUsd: typeof cost === "number" ? cost : null,
        acceptedParams: null, // the Image API reports no applied parameters (fact-check 2026-10-18)
        rawRequest: { method: "POST", url, body: redactedBody },
        rawResponse: { ...parsed.data, data: redacted },
      };
    },
  };
}
