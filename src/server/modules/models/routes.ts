import type { Hono } from "hono";
import { PreferencesQuery, type PreferencesResponse, SetPreferenceRequest } from "../../../shared/models";
import type { ProviderId } from "../../../shared/providers";
import { AppError } from "../../lib/errors";
import type { ModelCatalog } from "../providers/catalog";
import { ProviderError } from "../providers/port";
import type { ProviderRegistry } from "../providers/registry";
import { providerAppError } from "../providers/routes";
import type { SpeechCatalog } from "../providers/speech-catalog";
import type { SpeechRegistry } from "../providers/speech-port";
import type { ModelsRepo } from "./repo";

export type ModelsRouteDeps = {
  repo: ModelsRepo;
  providers: ProviderRegistry;
  catalog: ModelCatalog;
  /** Speech-model preferences are checked against the speech catalog (ADR-0054). */
  speech: SpeechRegistry;
  speechCatalog: SpeechCatalog;
};

/** Is `model` offered by the provider for this kind? `null` = the list couldn't be loaded. */
async function offered(deps: ModelsRouteDeps, kind: "image" | "speech", provider: ProviderId, model: string) {
  if (kind === "image") return deps.catalog.find(provider, model);
  try {
    return (await deps.speechCatalog.models(provider)).models.some((m) => m.id === model);
  } catch (err) {
    if (err instanceof ProviderError) return null;
    throw err;
  }
}

const fieldsOf = (issues: { path: PropertyKey[]; message: string }[]) =>
  Object.fromEntries(issues.map((i) => [i.path.join(".") || "body", i.message]));

export function registerModelsRoutes(app: Hono, deps: ModelsRouteDeps) {
  app.get("/model-preferences", (c) => {
    const q = PreferencesQuery.safeParse(c.req.query());
    if (!q.success)
      throw new AppError("VALIDATION_ERROR", "Invalid preferences query", 400, { fields: fieldsOf(q.error.issues) });
    const { provider, kind } = q.data;
    if (kind === "speech" && !deps.speech.get(provider))
      return c.json({ preferences: [] } satisfies PreferencesResponse);
    return c.json({ preferences: deps.repo.kind(kind).list(provider) } satisfies PreferencesResponse);
  });

  app.patch("/model-preferences", async (c) => {
    const raw: unknown = await c.req.json().catch(() => {
      throw new AppError("VALIDATION_ERROR", "Request body must be JSON", 400);
    });
    const body = SetPreferenceRequest.safeParse(raw);
    if (!body.success)
      throw new AppError("VALIDATION_ERROR", "Invalid preference", 400, { fields: fieldsOf(body.error.issues) });
    const { provider: providerId, kind = "image", model, favorite, hidden } = body.data;

    const provider = kind === "speech" ? deps.speech.get(providerId) : deps.providers.get(providerId);
    if (!provider) throw new AppError("NOT_FOUND", `Unknown provider: ${providerId}`, 404);
    const store = deps.repo.kind(kind);
    // Turning flags off never needs the provider or its catalog (ADR-0029); only a write that
    // turns a flag on is checked against what the provider offers.
    if (favorite !== true && hidden !== true) return c.json(store.set(provider.id, model, { favorite, hidden }));
    if (!provider.configured)
      throw new AppError("PROVIDER_NOT_CONFIGURED", `${provider.name} is not configured`, 409, {
        provider: provider.id,
      });
    const found = await offered(deps, kind, provider.id, model);
    const list = kind === "speech" ? "speech model list" : "model list";
    if (found === null)
      throw providerAppError(new ProviderError(provider.id, null, `Couldn't load the ${provider.name} ${list}`));
    if (!found) throw new AppError("NOT_FOUND", `Unknown model: ${model}`, 404);

    return c.json(store.set(provider.id, model, { favorite, hidden }));
  });
}
