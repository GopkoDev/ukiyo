import { AddTagRequest, checkComment, normalizeTag, SetCommentRequest } from "../../../shared/curation";
import { checkInputFile, type InputSlot, MAX_INPUT_BYTES, MAX_INPUT_IMAGES } from "../../../shared/generations";
import type { ImageModel } from "../../../shared/providers";
import { AppError } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { ModelCatalog } from "../providers/catalog";
import { ProviderError } from "../providers/port";
import type { ProviderRegistry } from "../providers/registry";
import type { FileStore } from "../storage/file-store";
import type { CostSync } from "./cost-sync";
import { checkAgainstModel, costFromResult, type FieldErrors, parseStartRequest } from "./domain";
import type { JobSlot, JobState } from "./jobs";
import type { GenerationsRepo, ImageRecord, InputRecord } from "./repo";

/** An attached file as it arrived (bytes + the name the Owner's machine gave it). */
export type InputFile = { bytes: Uint8Array; name: string };
type CheckedInput = {
  bytes: Uint8Array;
  name: string;
  mediaType: InputRecord["mediaType"];
  width: number;
  height: number;
};

export type GenerationsServiceDeps = {
  providers: ProviderRegistry;
  catalog: ModelCatalog;
  repo: GenerationsRepo;
  files: FileStore;
  jobs: JobSlot;
  /** Resolves `pending` costs in the background (ADR-0013); `forget` cancels one on deletion. */
  costSync: Pick<CostSync, "track" | "forget">;
  timeoutMs: number;
};

const invalid = (fields: FieldErrors) => new AppError("VALIDATION_ERROR", "Some fields need fixing", 400, { fields });
const gone = () => new AppError("NOT_FOUND", "Generation not found", 404);
const NOT_STORED = "Not an image stored by Ukiyo"; // one answer for every miss — no existence leak (AC-13)
const SOURCE_GONE = "The source generation no longer exists";

/** Swaps the adapter's `{ "$image": N }` / `{ "$input": N }` placeholders for references to the stored files (ADR-0008). */
function linkFiles(value: unknown, outputs: string[], inputs: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((v) => linkFiles(v, outputs, inputs));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && (keys[0] === "$image" || keys[0] === "$input")) {
      const n = obj[keys[0]];
      const paths = keys[0] === "$image" ? outputs : inputs;
      return { $file: typeof n === "number" ? (paths[n - 1] ?? null) : null };
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, linkFiles(v, outputs, inputs)]));
  }
  return value;
}

/** Each file must be a usable picture within the size limit; failures are keyed `inputs.N` (1-based). */
function checkFiles(files: InputFile[]): { inputs: CheckedInput[]; fields: FieldErrors } {
  const fields: FieldErrors = {};
  const inputs: CheckedInput[] = [];
  if (files.length > MAX_INPUT_IMAGES) fields.inputs = `At most ${MAX_INPUT_IMAGES} input images per generation`;
  for (const [i, f] of files.entries()) {
    const checked = checkInputFile(f.bytes, f.name);
    if (checked.ok) inputs.push({ bytes: f.bytes, name: f.name, ...checked.image });
    else fields[`inputs.${i + 1}`] = checked.message;
  }
  return { inputs, fields };
}

export function createGenerationsService(deps: GenerationsServiceDeps) {
  let running: Promise<void> = Promise.resolve();

  async function run(
    job: JobState,
    input: ReturnType<typeof parseStartRequest> & { ok: true },
    inputs: CheckedInput[],
  ) {
    const req = input.value;
    const provider = deps.providers.get(req.provider);
    if (!provider) return deps.jobs.fail({ code: "NOT_FOUND", message: `Unknown provider: ${req.provider}` });
    const id = newId(Date.parse(job.startedAt));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new DOMException("timed out", "TimeoutError")), deps.timeoutMs);

    let result: Awaited<ReturnType<typeof provider.generate>>;
    const sentAt = performance.now();
    try {
      result = await provider.generate(
        {
          model: req.model,
          prompt: req.prompt,
          params: req.params,
          ...(inputs.length ? { inputs: inputs.map((i) => ({ bytes: i.bytes, mediaType: i.mediaType })) } : {}),
        },
        ctrl.signal,
      );
    } catch (err) {
      const timedOut = ctrl.signal.aborted;
      const pe = err instanceof ProviderError ? err : new ProviderError(provider.id, null, String(err));
      deps.jobs.fail({
        code: "PROVIDER_ERROR",
        message: timedOut ? `The provider did not answer within ${deps.timeoutMs / 1000} s` : pe.message,
        details: { provider: pe.provider, upstreamStatus: pe.upstreamStatus },
      });
      return;
    } finally {
      clearTimeout(timer);
    }
    const durationMs = Math.round(performance.now() - sentAt);
    const cost = costFromResult(result.costUsd, result.costRef);

    try {
      const paths = await deps.files.stage(id, result.images);
      const inputPaths = await deps.files.stageInputs(id, inputs);
      const inputRecords: InputRecord[] = inputs.map((img, i) => ({
        position: i + 1,
        path: inputPaths[i] ?? "",
        mediaType: img.mediaType,
        width: img.width,
        height: img.height,
        byteSize: img.bytes.byteLength,
        originalName: img.name.slice(0, 255) || null, // client-supplied: bounded, display-only
      }));
      const images: ImageRecord[] = result.images.map((img, i) => ({
        position: i + 1,
        path: paths[i] ?? "",
        mediaType: img.mediaType,
        width: img.width,
        height: img.height,
        byteSize: img.bytes.byteLength,
      }));
      deps.repo.insertAtomic(
        {
          id,
          provider: provider.id,
          model: req.model,
          prompt: req.prompt,
          requestedParams: req.params,
          acceptedParams: result.acceptedParams,
          imagesRequested: req.params.n,
          ...cost,
          createdAt: job.startedAt,
          durationMs,
          ...(req.source
            ? { sourceId: req.source.id, sourceRelation: req.source.relation, sourceOutput: req.source.output ?? null }
            : {}),
          rawRequest: linkFiles(result.rawRequest, paths, inputPaths),
          rawResponse: linkFiles(result.rawResponse, paths),
        },
        images,
        () => deps.files.commitSync(id),
        inputRecords,
      );
    } catch (err) {
      deps.files.discard(id);
      deps.jobs.fail({
        code: "STORAGE_ERROR",
        message: `The images could not be stored: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    deps.jobs.succeed(id);
    if (cost.costStatus === "pending")
      deps.costSync.track({
        id,
        provider: provider.id,
        costRef: cost.costRef,
        answeredAt: Date.parse(job.startedAt) + durationMs,
      });
  }

  /** Validates and starts a job; `model` (when known) narrows the parameters and input count to what it supports. */
  function startGeneration(body: unknown, model?: ImageModel | null, files: InputFile[] = []): JobState {
    const parsed = parseStartRequest(body);
    const checked = checkFiles(files);
    if (!parsed.ok) throw invalid({ ...parsed.fields, ...checked.fields });
    if (Object.keys(checked.fields).length) throw invalid(checked.fields);
    // Lineage is recorded only to a generation that exists when generating starts (spec AC-08).
    checkSource(parsed.value.source);
    const provider = deps.providers.get(parsed.value.provider);
    if (!provider) throw new AppError("NOT_FOUND", `Unknown provider: ${parsed.value.provider}`, 404);
    if (!provider.configured)
      throw new AppError("PROVIDER_NOT_CONFIGURED", `${provider.name} is not configured`, 409, {
        provider: provider.id,
      });
    if (model) {
      const fields = checkAgainstModel(parsed.value.params, model, checked.inputs.length);
      if (Object.keys(fields).length) throw invalid(fields);
    }
    const job = deps.jobs.start();
    running = run(job, parsed, checked.inputs).catch((err) => {
      try {
        deps.jobs.fail({ code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) });
      } catch (inner) {
        console.error("generations: job failed and could not be recorded", err, inner); // never crash the server
      }
    });
    return job;
  }

  /**
   * Orders the inputs as the request lists them: stored references are read from recorded rows + files
   * (ADR-0017), upload slots pick the n-th file, each used exactly once. No `inputs` → uploads in order.
   */
  /** The lineage a request claims must be real: the source exists and, for a reuse, has that output (AC-03, AC-08). */
  function checkSource(source: { id: string; relation: string; output?: number } | undefined): void {
    if (!source) return;
    if (!deps.repo.exists(source.id)) throw invalid({ source: SOURCE_GONE });
    if (
      source.relation === "reuse" &&
      source.output !== undefined &&
      !deps.repo.storedImage(source.id, "output", source.output)
    )
      throw invalid({ source: `Output ${source.output} doesn't exist in the source generation` });
  }

  async function resolveInputs(slots: InputSlot[] | undefined, files: InputFile[]): Promise<InputFile[]> {
    if (slots === undefined) return files;
    const fields: FieldErrors = {};
    const used = new Set<number>();
    // Stored files are read in parallel; the order of `slots` is kept.
    const resolved = await Promise.all(
      slots.map(async (slot, i): Promise<InputFile | null> => {
        if ("upload" in slot) {
          const file = files[slot.upload - 1];
          if (!file || used.has(slot.upload)) {
            fields.inputs = "Every attached file must be used once";
            return null;
          }
          used.add(slot.upload);
          return file;
        }
        const { generationId, kind, position } = slot.stored;
        const rec = deps.repo.storedImage(generationId, kind, position);
        if (!rec) {
          fields[`inputs.${i + 1}`] = NOT_STORED; // one answer for every unknown reference (AC-13)
          return null;
        }
        // A recorded image whose file is gone belongs to a generation being deleted (ADR-0014, sad §11).
        const size = await deps.files.sizeRecorded(rec.path);
        if (size !== null && size > MAX_INPUT_BYTES) {
          fields[`inputs.${i + 1}`] = `${rec.name} — larger than 10 MB`;
          return null;
        }
        const bytes = size === null ? null : await deps.files.readRecorded(rec.path).catch(() => null);
        if (!bytes) {
          fields[`inputs.${i + 1}`] = SOURCE_GONE;
          return null;
        }
        return { bytes, name: rec.name };
      }),
    );
    const out = resolved.filter((f): f is InputFile => f !== null);
    if (used.size !== files.length) fields.inputs = "Every attached file must be used once";
    if (Object.keys(fields).length) throw invalid(fields);
    return out;
  }

  return {
    startGeneration,

    /** Route entry: looks the model up in the catalog first (unknown model → field error; catalog down → provider decides). */
    async startGenerationChecked(body: unknown, files: InputFile[] = []): Promise<JobState> {
      const parsed = parseStartRequest(body);
      if (!parsed.ok) throw invalid(parsed.fields);
      // Refuse before reading any stored file while the single slot is busy (ADR-0005, spec AC-14).
      if (deps.jobs.current()?.status === "running")
        throw new AppError(
          "GENERATION_IN_PROGRESS",
          "A generation is already in progress — wait until it finishes",
          409,
        );
      checkSource(parsed.value.source);
      const inputs = await resolveInputs(parsed.value.inputs, files);
      const provider = deps.providers.get(parsed.value.provider);
      const model = provider?.configured ? await deps.catalog.find(parsed.value.provider, parsed.value.model) : null;
      if (model === undefined) throw invalid({ model: "This model is not offered by the provider" });
      return startGeneration(body, model, inputs);
    },

    /** Replaces the comment; blank text removes it; last save wins (ADR-0016). */
    setComment(id: string, body: unknown, now: Date = new Date()) {
      const parsed = SetCommentRequest.safeParse(body);
      if (!parsed.success) throw invalid({ body: "Comment must be text" });
      const checked = checkComment(parsed.data.body);
      if (!checked.ok) throw invalid({ body: checked.message });
      const res = deps.repo.setComment(id, checked.body, now.toISOString());
      if (res.status === "missing") throw gone();
      return { comment: res.comment };
    },

    /** Adds one normalized tag; a duplicate leaves the list unchanged; at most 10 (ADR-0015, ADR-0016). */
    addTag(id: string, body: unknown) {
      const parsed = AddTagRequest.safeParse(body);
      if (!parsed.success) throw invalid({ tag: parsed.error.issues[0]?.message ?? "Tag must be text" });
      const normalized = normalizeTag(parsed.data.tag);
      if (!normalized.ok) throw invalid({ tag: normalized.message });
      const res = deps.repo.addTag(id, normalized.tag);
      if (res.status === "missing") throw gone();
      if (res.status === "limit") throw invalid({ tag: "A generation can have at most 10 tags" });
      return { tags: res.tags };
    },

    /** Removes one tag by its normalized value; absent → unchanged list. */
    removeTag(id: string, raw: string) {
      const normalized = normalizeTag(raw);
      const res = deps.repo.removeTag(id, normalized.ok ? normalized.tag : raw);
      if (res.status === "missing") throw gone();
      return { tags: res.tags };
    },

    /**
     * Deletes a generation all-or-nothing (ADR-0014): rows and the directory move share one transaction; then the
     * moved files are purged, its cost lookup cancelled and it stops being the latest result.
     */
    deleteGeneration(id: string): void {
      let deleted: boolean;
      try {
        deleted = deps.repo.deleteAtomic(id, () => deps.files.trashSync(id));
      } catch (err) {
        // The transaction rolled back, so the generation still exists — its files must come back with it.
        try {
          deps.files.restoreSync(id);
        } catch (restoreErr) {
          console.error(`generations: could not restore files of ${id}; the boot sweep will retry`, restoreErr);
        }
        throw new AppError(
          "STORAGE_ERROR",
          `The generation could not be deleted: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
      }
      if (!deleted) throw gone();
      try {
        deps.files.purge(id);
      } catch (err) {
        console.error(`generations: purge of deleted ${id} failed — the boot sweep will finish it`, err);
      }
      deps.costSync.forget(id);
      deps.jobs.forgetGeneration(id);
    },

    getJob: () => deps.jobs.current(),
    dismissJob: () => deps.jobs.dismiss(),
    list: (q: { cursor?: string; limit: number; provider?: string; model?: string; promptKey?: string }) =>
      deps.repo.listPage(q),
    promptGroups: (q: { cursor?: string; limit: number; single: boolean }) => deps.repo.promptGroups(q),
    promptGroup: (key: string) => deps.repo.promptGroup(key),
    models: (latest: number) => deps.repo.modelGroups({ latest }),
    costHistory: (provider: string, model: string) => deps.repo.costHistory(provider, model),
    get: (id: string) => deps.repo.get(id),
    exists: (id: string) => deps.repo.exists(id),
    promptOf: (id: string) => deps.repo.promptOf(id),
    derivedOf: (id: string) => deps.repo.derivedOf(id),
    recordedImage: (path: string) => deps.repo.recordedImage(path),
    /** Resolves when the in-flight job (if any) has finished — for tests and graceful shutdown. */
    whenIdle: () => running,
  };
}

export type GenerationsService = ReturnType<typeof createGenerationsService>;
