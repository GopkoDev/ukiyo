import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { Db } from "./db/client";
import { type Config, DEV_UI_PORT } from "./lib/config";
import { notFound, onError } from "./lib/errors";
import { requestGuard } from "./lib/request-guard";
import { createRecordingsRepo } from "./modules/audio/repo";
import { registerAudioRoutes } from "./modules/audio/routes";
import { createAudioService } from "./modules/audio/service";
import { createCostSync, type Timers } from "./modules/generations/cost-sync";
import { createJobSlot } from "./modules/generations/jobs";
import { createGenerationsRepo } from "./modules/generations/repo";
import { registerGenerationsRoutes } from "./modules/generations/routes";
import { createGenerationsService } from "./modules/generations/service";
import { createModelsRepo } from "./modules/models/repo";
import { registerModelsRoutes } from "./modules/models/routes";
import { createModelCatalog } from "./modules/providers/catalog";
import { createOpenRouterSpeech } from "./modules/providers/openrouter-speech";
import { createPriceCatalog } from "./modules/providers/prices";
import { createProviderRegistry } from "./modules/providers/registry";
import { registerProvidersRoutes } from "./modules/providers/routes";
import { createSpeechCatalog } from "./modules/providers/speech-catalog";
import { speechRegistryOf } from "./modules/providers/speech-port";
import { createFileStore } from "./modules/storage/file-store";
import { registerSystemRoutes } from "./modules/system/routes";

/** Everything a module needs is passed in explicitly — no global singletons, so tests build an app with fakes. */
export type AppDeps = {
  config: Config;
  db: Db;
  /** Outbound HTTP for provider adapters — tests pass a fixture-backed fake. */
  fetch?: typeof fetch;
  /** Clock (epoch ms) for caches and the cost resolver. */
  now?: () => number;
  /** Timers for background price lookups — tests pass controllable ones. */
  timers?: Timers;
  /** Provider request timeout; spec §6: 180 s. */
  generationTimeoutMs?: number;
  /** Published-price lookup timeout (default 10 s) — a hung provider must end in «couldn't load». */
  priceTimeoutMs?: number;
  /** Balance read deadline (default 10 s) — a hung provider reads as «—» (ADR-0055). */
  balanceTimeoutMs?: number;
};

export const GENERATION_TIMEOUT_MS = 180_000;

export type CreateAppOptions = {
  /** Directory of the built SPA (`dist/web`); when set, served at `/` with an index.html fallback. */
  webDir?: string;
};

export function createApp(deps: AppDeps, options: CreateAppOptions = {}) {
  const api = new Hono();
  api.use("*", requestGuard([deps.config.port, DEV_UI_PORT]));
  registerSystemRoutes(api, deps);

  const providers = createProviderRegistry(deps.config, deps.fetch);
  const catalog = createModelCatalog(providers, deps.now);
  registerProvidersRoutes(api, {
    providers,
    catalog,
    prices: createPriceCatalog(providers, catalog, deps.now, deps.priceTimeoutMs),
    balanceTimeoutMs: deps.balanceTimeoutMs,
  });

  // Speech (text-to-speech) behind its own port (ADR-0039); its catalog also checks speech-model preferences (ADR-0054).
  const speech = speechRegistryOf([
    createOpenRouterSpeech({ apiKey: deps.config.openRouterApiKey, fetch: deps.fetch ?? fetch }),
  ]);
  const speechCatalog = createSpeechCatalog(speech, deps.now);
  registerModelsRoutes(api, { repo: createModelsRepo(deps.db, deps.now), providers, catalog, speech, speechCatalog });

  const files = createFileStore(deps.config.dataDir);
  const repo = createGenerationsRepo(deps.db);
  const costSync = createCostSync({
    repo,
    lookupFor: (provider) => providers.get(provider)?.lookupCost,
    now: deps.now,
    timers: deps.timers,
  });
  const service = createGenerationsService({
    providers,
    catalog,
    repo,
    files,
    // One clock for the job's timestamps and the cost resolver's deadline (ADR-0013).
    jobs: createJobSlot(deps.config.dataDir, deps.now ? () => new Date(deps.now?.() ?? Date.now()) : undefined),
    costSync,
    timeoutMs: deps.generationTimeoutMs ?? GENERATION_TIMEOUT_MS,
  });
  repo.backfillPromptKeys(); // pre-0010 generations get their prompt key (ADR-0037)
  registerGenerationsRoutes(api, { service, files });

  // Audio: its own cost resolver over recordings (ADR-0043).
  const recordings = createRecordingsRepo(deps.db);
  const audioCostSync = createCostSync({
    repo: recordings,
    lookupFor: (provider) => speech.get(provider)?.lookupCost,
    now: deps.now,
    timers: deps.timers,
  });
  const audio = createAudioService({
    speech,
    catalog: speechCatalog,
    repo: recordings,
    files,
    costSync: audioCostSync,
    timeoutMs: deps.generationTimeoutMs ?? GENERATION_TIMEOUT_MS,
    now: deps.now,
  });
  registerAudioRoutes(api, { service: audio });
  audio.warmCatalog(); // display names for prototype recordings, in the background (ADR-0052)

  // One sweep once both repos exist: interrupted image and audio deletions are restored, leftovers dropped (ADR-0042).
  files.sweep(new Set(repo.allIds()), new Set(recordings.allIds()));
  costSync.resume(); // pending costs survive restarts (ADR-0013)
  audioCostSync.resume();

  const app = new Hono();
  app.onError(onError);
  app.notFound(notFound);
  app.route("/api", api);
  // Unmatched /api/* must 404 in the error envelope, never fall through to the SPA.
  app.all("/api/*", notFound);

  if (options.webDir) {
    const root = options.webDir;
    app.use("/*", serveStatic({ root }));
    app.get("*", serveStatic({ root, path: "index.html" }));
  }
  /** Cancels background work (pending-cost lookups) — on shutdown and before a test restart. */
  return Object.assign(app, {
    stopBackground: () => {
      costSync.stop();
      audioCostSync.stop();
    },
  });
}
