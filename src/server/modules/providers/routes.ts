import type { Hono } from "hono";
import type { PriceResponse } from "../../../shared/pricing";
import type { BalanceResponse, ModelsResponse, ProvidersResponse } from "../../../shared/providers";
import { AppError } from "../../lib/errors";
import type { ModelCatalog } from "./catalog";
import { ProviderError } from "./port";
import type { PriceCatalog } from "./prices";
import type { ProviderRegistry } from "./registry";

export type ProvidersRouteDeps = {
  providers: ProviderRegistry;
  catalog: ModelCatalog;
  prices: PriceCatalog;
  /** Deadline of one balance read (default 10 s, spec §6). */
  balanceTimeoutMs?: number;
};

export const BALANCE_TIMEOUT_MS = 10_000;

export function providerAppError(err: ProviderError): AppError {
  return new AppError("PROVIDER_ERROR", err.message, 502, {
    provider: err.provider,
    upstreamStatus: err.upstreamStatus,
  });
}

export function registerProvidersRoutes(app: Hono, deps: ProvidersRouteDeps) {
  app.get("/providers", (c) =>
    c.json({
      providers: deps.providers.list().map((p) => ({ id: p.id, name: p.name, configured: p.configured })),
    } satisfies ProvidersResponse),
  );

  app.get("/providers/:providerId/models", async (c) => {
    const provider = deps.providers.get(c.req.param("providerId"));
    if (!provider) throw new AppError("NOT_FOUND", `Unknown provider: ${c.req.param("providerId")}`, 404);
    if (!provider.configured)
      throw new AppError("PROVIDER_NOT_CONFIGURED", `${provider.name} is not configured`, 409, {
        provider: provider.id,
      });
    try {
      const { models, fetchedAt } = await deps.catalog.models(provider.id);
      return c.json({ models, fetchedAt: new Date(fetchedAt).toISOString() } satisfies ModelsResponse);
    } catch (err) {
      if (err instanceof ProviderError) throw providerAppError(err);
      throw err;
    }
  });

  // One provider's remaining credit; a failed, late or unreadable read is `null` (ADR-0055) — never an error answer.
  app.get("/providers/:providerId/balance", async (c) => {
    const provider = deps.providers.get(c.req.param("providerId"));
    if (!provider) throw new AppError("NOT_FOUND", `Unknown provider: ${c.req.param("providerId")}`, 404);
    if (!provider.configured)
      throw new AppError("PROVIDER_NOT_CONFIGURED", `${provider.name} is not configured`, 409, {
        provider: provider.id,
      });
    let remainingUsd: number | null = null;
    try {
      remainingUsd =
        (await provider.balance?.(AbortSignal.timeout(deps.balanceTimeoutMs ?? BALANCE_TIMEOUT_MS))) ?? null;
    } catch (err) {
      if (!(err instanceof ProviderError)) throw err;
    }
    return c.json({ provider: provider.id, remainingUsd } satisfies BalanceResponse);
  });

  app.get("/providers/:providerId/price", async (c) => {
    const provider = deps.providers.get(c.req.param("providerId"));
    if (!provider) throw new AppError("NOT_FOUND", `Unknown provider: ${c.req.param("providerId")}`, 404);
    const model = c.req.query("model") ?? "";
    if (model.length < 1 || model.length > 200)
      throw new AppError("VALIDATION_ERROR", "Choose a model", 400, { fields: { model: "Choose a model" } });
    if (!provider.configured)
      throw new AppError("PROVIDER_NOT_CONFIGURED", `${provider.name} is not configured`, 409, {
        provider: provider.id,
      });
    try {
      return c.json((await deps.prices.price(provider.id, model)) satisfies PriceResponse);
    } catch (err) {
      if (err instanceof ProviderError) throw providerAppError(err);
      throw err;
    }
  });
}
