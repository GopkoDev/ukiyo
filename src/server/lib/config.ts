import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/** The only address the server binds — the API holds the provider keys' spending power (CLAUDE.md hard rule). */
export const HOST = "127.0.0.1";

/** Dev UI (Vite) port whose pages proxy to the API; allowed by the request guard alongside `PORT`. */
export const DEV_UI_PORT = 5173;

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  GEN_IMG_DATA_DIR: z.string().min(1).default("./data"),
  PORT: z.coerce.number().int().positive().default(8787),
});

export type Config = {
  openRouterApiKey: string | undefined;
  aiGatewayApiKey: string | undefined;
  elevenLabsApiKey?: string;
  dataDir: string;
  port: number;
};

/** Loads `.env.local` (if present) into process.env, then validates. Server-only — never sent to the browser. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env && existsSync(".env.local")) process.loadEnvFile(".env.local");
  const parsed = EnvSchema.parse(env);
  return {
    openRouterApiKey: parsed.OPENROUTER_API_KEY || undefined,
    aiGatewayApiKey: parsed.AI_GATEWAY_API_KEY || undefined,
    elevenLabsApiKey: parsed.ELEVENLABS_API_KEY || undefined,
    dataDir: resolve(parsed.GEN_IMG_DATA_DIR),
    port: parsed.PORT,
  };
}
