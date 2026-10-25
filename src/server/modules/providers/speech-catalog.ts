import type { SpeechModel } from "../../../shared/speech";
import { CATALOG_TTL_MS } from "./catalog";
import { ProviderError } from "./port";
import type { SpeechRegistry } from "./speech-port";

type Entry = { models: SpeechModel[]; fetchedAt: number };

/** Per-provider speech model list, cached in memory for 10 minutes like the image catalog; failures are never cached. */
export function createSpeechCatalog(providers: SpeechRegistry, now: () => number = Date.now) {
  const cache = new Map<string, Entry>();
  const loading = new Map<string, Promise<Entry>>();

  async function models(providerId: string): Promise<Entry> {
    const hit = cache.get(providerId);
    if (hit && now() - hit.fetchedAt < CATALOG_TTL_MS) return hit;
    const provider = providers.get(providerId);
    if (!provider) throw new ProviderError("openrouter", null, `Unknown speech provider: ${providerId}`);
    const pending = loading.get(providerId);
    if (pending) return pending;
    const load = provider
      .listModels()
      .then((list) => {
        const fresh = { models: list, fetchedAt: now() };
        cache.set(providerId, fresh);
        return fresh;
      })
      .finally(() => loading.delete(providerId));
    loading.set(providerId, load);
    return load;
  }

  /** The last successful read, even past its TTL; never fetches (ADR-0052). */
  function peek(providerId: string): Entry | undefined {
    return cache.get(providerId);
  }

  return {
    models,
    peek,
  };
}

export type SpeechCatalog = ReturnType<typeof createSpeechCatalog>;
