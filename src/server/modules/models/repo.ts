import { z } from "zod";
import { ModelPreference, type PreferenceKind } from "../../../shared/models";
import type { ProviderId } from "../../../shared/providers";
import type { Db } from "../../db/client";

const Row = z
  .object({
    provider: z.string(),
    model: z.string(),
    favorite: z.number().int(),
    hidden: z.number().int(),
    updated_at: z.string(),
  })
  .transform(
    (r): ModelPreference =>
      ModelPreference.parse({
        provider: r.provider,
        model: r.model,
        favorite: r.favorite === 1,
        hidden: r.hidden === 1,
        updatedAt: r.updated_at,
      }),
  );

export type PreferenceFlags = { favorite?: boolean; hidden?: boolean };

const TABLES: Record<PreferenceKind, string> = {
  image: "model_preferences",
  speech: "speech_model_preferences", // kept apart from image preferences (ADR-0054)
};

/** One kind's preference store — image models in `model_preferences`, speech models in their own table. */
function createPreferenceStore(db: Db, table: string, now: () => number) {
  const listStmt = db.prepare(`SELECT * FROM ${table} WHERE provider = ? ORDER BY model`);
  const getStmt = db.prepare(`SELECT * FROM ${table} WHERE provider = ? AND model = ?`);
  const upsertStmt = db.prepare(
    `INSERT INTO ${table} (provider, model, favorite, hidden, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (provider, model) DO UPDATE SET favorite = excluded.favorite, hidden = excluded.hidden, updated_at = excluded.updated_at`,
  );
  const deleteStmt = db.prepare(`DELETE FROM ${table} WHERE provider = ? AND model = ?`);

  return {
    list(provider: ProviderId): ModelPreference[] {
      return listStmt.all(provider).map((r) => Row.parse(r));
    },

    /** Merges the named flags into the stored row: upsert, or delete when both end off. */
    set(provider: ProviderId, model: string, flags: PreferenceFlags): ModelPreference {
      const stored = getStmt.get(provider, model);
      const current = stored ? Row.parse(stored) : undefined;
      const favorite = flags.favorite ?? current?.favorite ?? false;
      const hidden = flags.hidden ?? current?.hidden ?? false;
      if (!favorite && !hidden) {
        deleteStmt.run(provider, model);
        return { provider, model, favorite, hidden, updatedAt: null };
      }
      const updatedAt = new Date(now()).toISOString();
      upsertStmt.run(provider, model, favorite ? 1 : 0, hidden ? 1 : 0, updatedAt);
      return { provider, model, favorite, hidden, updatedAt };
    },
  };
}

export type PreferenceStore = ReturnType<typeof createPreferenceStore>;

/** The image store's operations at the top level (step 9 callers), plus `kind()` for either store. */
export function createModelsRepo(db: Db, now: () => number = Date.now) {
  const stores = {
    image: createPreferenceStore(db, TABLES.image, now),
    speech: createPreferenceStore(db, TABLES.speech, now),
  };
  return { ...stores.image, kind: (k: PreferenceKind): PreferenceStore => stores[k] };
}

export type ModelsRepo = ReturnType<typeof createModelsRepo>;
