import { z } from "zod";

export const ProviderId = z.enum(["openrouter", "vercel"]);
export type ProviderId = z.infer<typeof ProviderId>;

export const ProvidersResponse = z.object({
  providers: z.array(z.object({ id: ProviderId, name: z.string(), configured: z.boolean() })),
});
export type ProvidersResponse = z.infer<typeof ProvidersResponse>;

/** A provider's remaining credit in USD, as the provider reports it; `null` = it couldn't be read (ADR-0055). */
export const BalanceResponse = z.strictObject({ provider: ProviderId, remainingUsd: z.number().nullable() });
export type BalanceResponse = z.infer<typeof BalanceResponse>;

/** An image model with only the optional parameters it supports — an absent key means unsupported. */
export const ImageModel = z.object({
  id: z.string(),
  name: z.string(),
  params: z.object({
    aspectRatio: z.object({ values: z.array(z.string()) }).optional(),
    seed: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional(),
    n: z.object({ max: z.number().int().min(1).max(4) }).optional(),
    /** Input-image range from the catalog (max capped at 8); absent = the model takes no input images. */
    inputs: z.object({ min: z.number().int().min(0), max: z.number().int().min(1).max(8) }).optional(),
  }),
});
export type ImageModel = z.infer<typeof ImageModel>;

export const ModelsResponse = z.object({ models: z.array(ImageModel), fetchedAt: z.string() });
export type ModelsResponse = z.infer<typeof ModelsResponse>;
