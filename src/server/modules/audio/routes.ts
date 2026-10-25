import { readFile } from "node:fs/promises";
import type { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import type { PresetService } from "./presets-service";
import type { AudioService } from "./service";

export type AudioRouteDeps = { service: AudioService; presets: PresetService };

const Id = z.string().regex(/^[0-9A-Z]{26}$/);
const PageQuery = z.object({
  cursor: z
    .string()
    .regex(/^[0-9A-Z]{1,26}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  model: z.string().min(1).max(100).optional(),
});
const GroupsQuery = z.object({ latest: z.coerce.number().int().min(0).max(24).default(0) });

async function jsonBody(req: { json(): Promise<unknown> }): Promise<unknown> {
  return req.json().catch(() => {
    throw new AppError("VALIDATION_ERROR", "Request body must be JSON", 400);
  });
}

const notFound = () => new AppError("NOT_FOUND", "Recording not found", 404);
const fieldsOf = (issues: z.core.$ZodIssue[]) =>
  Object.fromEntries(issues.map((i) => [i.path.join(".") || "query", i.message]));

/** The audio contract (contracts/openapi.yaml, text-to-speech) — a thin HTTP layer over the audio service. */
export function registerAudioRoutes(app: Hono, deps: AudioRouteDeps) {
  const { service, presets } = deps;
  const presetNotFound = () => new AppError("NOT_FOUND", "Voice preset not found", 404);

  // Voice presets (contracts/openapi.yaml, voice-presets).
  app.get("/audio/presets", (c) => c.json(presets.list()));
  app.post("/audio/presets", async (c) => c.json(await presets.create(await jsonBody(c.req)), 201));
  app.get("/audio/presets/:id", (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw presetNotFound();
    return c.json(presets.get(id.data));
  });
  app.patch("/audio/presets/:id", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw presetNotFound();
    return c.json(await presets.update(id.data, await jsonBody(c.req)));
  });
  app.delete("/audio/presets/:id", (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw presetNotFound();
    presets.remove(id.data);
    return c.body(null, 204);
  });

  app.get("/audio/models", async (c) => c.json(await service.models()));

  app.get("/audio/recordings", async (c) => {
    const q = PageQuery.safeParse(c.req.query());
    if (!q.success)
      throw new AppError("VALIDATION_ERROR", "Invalid page request", 400, { fields: fieldsOf(q.error.issues) });
    return c.json(await service.list(q.data));
  });

  // Before `/audio/recordings/:id`, so «models» is never read as an id.
  app.get("/audio/recordings/models", async (c) => {
    const q = GroupsQuery.safeParse(c.req.query());
    if (!q.success)
      throw new AppError("VALIDATION_ERROR", "Invalid models query", 400, { fields: fieldsOf(q.error.issues) });
    return c.json(await service.modelGroups(q.data.latest));
  });

  app.put("/audio/recordings/:id/comment", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw notFound();
    return c.json(service.setComment(id.data, await jsonBody(c.req)));
  });

  app.post("/audio/recordings/:id/tags", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw notFound();
    return c.json(service.addTag(id.data, await jsonBody(c.req)));
  });

  app.delete("/audio/recordings/:id/tags/:tag", (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw notFound();
    return c.json(service.removeTag(id.data, c.req.param("tag")));
  });

  app.post("/audio/recordings", async (c) => {
    const body: unknown = await c.req.json().catch(() => {
      throw new AppError("VALIDATION_ERROR", "Request body must be JSON", 400);
    });
    return c.json(await service.start(body), 201);
  });

  app.get("/audio/recordings/:id", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw notFound();
    return c.json(await service.get(id.data));
  });

  app.delete("/audio/recordings/:id", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw notFound();
    await service.remove(id.data);
    return c.body(null, 204);
  });

  app.get("/audio/recordings/:id/file", async (c) => {
    const id = Id.safeParse(c.req.param("id"));
    if (!id.success) throw notFound();
    const { path, mediaType, record } = await service.file(id.data);
    const bytes = await readFile(path).catch(() => {
      throw notFound();
    });
    const ext = record.filePath.split(".").pop() ?? "mp3";
    const name = `${record.voice ?? "default"}-${record.id}.${ext}`.replace(/[^\w.-]+/g, "_");
    const disposition = c.req.query("download") === "1" ? "attachment" : "inline";
    return c.body(bytes, 200, {
      "content-type": mediaType,
      "content-disposition": `${disposition}; filename="${name}"`,
      "cache-control": "private, max-age=31536000, immutable",
    });
  });
}
