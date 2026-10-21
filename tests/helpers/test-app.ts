import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppDeps, createApp } from "../../src/server/app";
import { openDb } from "../../src/server/db/client";
import { migrateUp } from "../../src/server/db/migrate";
import type { Config } from "../../src/server/lib/config";

/** A real app over a real SQLite file in a fresh temp data dir, migrated like on boot. Call `cleanup()` after. */
export function createTestApp(overrides: Partial<Config> = {}, deps: Omit<Partial<AppDeps>, "config" | "db"> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "gen-img-test-"));
  const config: Config = {
    openRouterApiKey: undefined,
    aiGatewayApiKey: undefined,
    elevenLabsApiKey: undefined,
    dataDir,
    port: 0,
    ...overrides,
  };
  const db = openDb(dataDir);
  migrateUp(db);
  // Background price lookups must not outlive the test's DB: track them and cancel on cleanup.
  const live = new Set<ReturnType<typeof setTimeout>>();
  const timers = deps.timers ?? {
    set: (fn: () => void, ms: number) => {
      const h = setTimeout(() => {
        live.delete(h);
        fn();
      }, ms);
      live.add(h);
      return h;
    },
    clear: (h: unknown) => {
      clearTimeout(h as ReturnType<typeof setTimeout>);
      live.delete(h as ReturnType<typeof setTimeout>);
    },
  };
  const handle = {
    app: createApp({ config, db, ...deps, timers }),
    db,
    dataDir,
    /** Builds a fresh app over the same DB + data dir, like a server restart. */
    restart() {
      handle.app.stopBackground();
      handle.app = createApp({ config, db, ...deps, timers });
    },
    cleanup() {
      handle.app.stopBackground();
      for (const h of live) clearTimeout(h);
      live.clear();
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
  return handle;
}
