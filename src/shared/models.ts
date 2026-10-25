import { z } from "zod";
import { ProviderId } from "./providers";

const ModelId = z.string().min(1).max(200);

export const ModelPreference = z.object({
  provider: ProviderId,
  model: ModelId,
  favorite: z.boolean(),
  hidden: z.boolean(),
  /** ISO-8601 UTC; null when no row is stored (both flags off). */
  updatedAt: z.string().nullable(),
});
export type ModelPreference = z.infer<typeof ModelPreference>;

export const PreferencesResponse = z.object({ preferences: z.array(ModelPreference) });
export type PreferencesResponse = z.infer<typeof PreferencesResponse>;

/** Which picker a preference shapes: image models (default) or speech models — kept apart (ADR-0054). */
export const PreferenceKind = z.enum(["image", "speech"]);
export type PreferenceKind = z.infer<typeof PreferenceKind>;

export const PreferencesQuery = z.object({ provider: ProviderId, kind: PreferenceKind.default("image") });

/** Only the flags named change; at least one is required. */
export const SetPreferenceRequest = z
  .object({
    provider: z.string().min(1),
    kind: PreferenceKind.optional(),
    model: ModelId,
    favorite: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.favorite !== undefined || b.hidden !== undefined, { message: "Name at least one flag" });
export type SetPreferenceRequest = z.infer<typeof SetPreferenceRequest>;
