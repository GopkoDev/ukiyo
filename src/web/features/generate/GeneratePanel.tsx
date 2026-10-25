import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GALLERY_QUERY_KEY } from "@/features/gallery/Gallery";
import { ApiError, api } from "@/lib/api";
import { Link, replace, useRoute } from "@/lib/router";
import {
  carryParams,
  checkAgainstModel,
  checkInputFile,
  type FieldErrors,
  type Generation,
  type InputSlot,
  type Job,
  MAX_INPUT_BYTES,
  MAX_INPUT_IMAGES,
  type RequestedParams,
  type SourceRef,
  StartGenerationRequest,
} from "../../../shared/generations";
import { arrangeModels, hiddenSuitable, pickModel } from "../../../shared/model-groups";
import type { ImageModel, ProviderId } from "../../../shared/providers";
import { refreshBalances } from "../balances/balances";
import { useModelPreferences } from "../models/preferences";
import { type Attachment, InputImages } from "./InputImages";
import { JOB_QUERY_KEY } from "./job";
import { ModelPicker } from "./ModelPicker";
import { EstimateLine, PriceLine } from "./PricePreview";

/** The env var that configures each provider's key — shown when a provider isn't configured. */
const KEY_VARS: Record<ProviderId, string> = { openrouter: "OPENROUTER_API_KEY", vercel: "AI_GATEWAY_API_KEY" };
const PROVIDER_STORAGE = "gen-img:provider";

function rememberedProvider(): ProviderId | null {
  try {
    const v = sessionStorage.getItem(PROVIDER_STORAGE);
    return v === "openrouter" || v === "vercel" ? v : null;
  } catch {
    return null;
  }
}

/** The draft's source (ADR-0019): what «Started from …» shows and the lineage the request carries. */
type DraftSource = SourceRef & { prompt: string };
type PendingSource = { relation: "rerun" | "reuse"; model?: string };

/** `/?rerun=<id>` or `/?reuse=<id>&output=<n>` — applied on each arrival at Generate (ADR-0019, ADR-0023). */
function sourceFromAddress(search: string): { id: string; relation: "rerun" | "reuse"; output?: number } | null {
  const q = new URLSearchParams(search);
  const rerun = q.get("rerun");
  if (rerun) return { id: rerun, relation: "rerun" };
  const reuse = q.get("reuse");
  const output = Number(q.get("output"));
  if (reuse && Number.isInteger(output) && output >= 1) return { id: reuse, relation: "reuse", output };
  return null;
}

const excerpt = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);
const DEFAULT_ASPECT = "__default__";
const PREFS_WAIT_MS = 1500;

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function Notice({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <p className="font-medium">{title}</p>
      {children}
      {action && <div className="self-end">{action}</div>}
    </div>
  );
}

function LatestResult({ generationId }: { generationId: string }) {
  const q = useQuery({ queryKey: ["generation", generationId], queryFn: () => api.generation(generationId) });
  // Deleted meanwhile (curate-gallery AC-12): never show a broken result.
  if (q.error instanceof ApiError && q.error.code === "NOT_FOUND") return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>Saved to gallery</span>
        <Link to={`/generations/${generationId}`} className="underline underline-offset-4">
          Open
        </Link>
      </div>
      {q.data && (
        <div className="flex gap-2 overflow-x-auto">
          {q.data.images.map((img) => (
            <Link
              key={img.position}
              to={`/generations/${generationId}`}
              className="shrink-0"
              aria-label={`Open output ${img.position}`}
            >
              <img src={img.url} alt="" className="h-20 w-20 rounded-md border object-cover" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** SCR-01 — pick a model, write a prompt, set supported parameters, generate. */
export function GeneratePanel() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  // The Owner's choice (remembered for the browser session), else the first configured provider (OpenRouter first).
  const [chosen, setChosen] = useState<ProviderId | null>(rememberedProvider);
  const list = providers.data?.providers ?? [];
  const providerId: ProviderId = chosen ?? list.find((p) => p.configured)?.id ?? "openrouter";
  const provider = list.find((p) => p.id === providerId);
  const models = useQuery({
    queryKey: ["models", providerId],
    queryFn: () => api.models(providerId),
    enabled: provider?.configured === true,
  });
  // Preferences steer the automatic model choices; unreadable → a plain list. Never blocks the panel: the first
  // automatic pick waits for them only briefly.
  const prefsQ = useModelPreferences(providerId, provider?.configured === true);
  const prefs = prefsQ.isError ? null : (prefsQ.data?.preferences ?? null);
  const [waitedFor, setWaitedFor] = useState<ProviderId | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setWaitedFor(providerId), PREFS_WAIT_MS);
    return () => clearTimeout(timer);
  }, [providerId]);
  const prefsReady = !prefsQ.isPending || waitedFor === providerId;
  const jobQ = useQuery({
    queryKey: JOB_QUERY_KEY,
    queryFn: api.currentJob,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.job?.status === "running" ? 1000 : false),
  });
  const job: Job | null = jobQ.data?.job ?? null;
  const running = job?.status === "running";

  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT);
  const [seed, setSeed] = useState("");
  const [n, setN] = useState("1");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [refused, setRefused] = useState<string[]>([]);
  const [draftSource, setDraftSource] = useState<DraftSource | null>(null);
  const [sourceGone, setSourceGone] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [pending, setPending] = useState<PendingSource | null>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  // The last reuse found no visible model that takes input images (AC-13); the notice is derived from the live
  // preferences at render, so un-hiding elsewhere removes it. Cleared when the Owner switches provider or model.
  const [reuseNeedsInputs, setReuseNeedsInputs] = useState(false);
  const [removedNote, setRemovedNote] = useState<string | null>(null);
  const [carryOnLoad, setCarryOnLoad] = useState(false);
  // Set when no visible model suited an automatic choice: the model stays empty until the Owner picks one.
  const noAutoPick = useRef(false);
  // Set when an automatic choice was made before slow preferences arrived: the rule it used, so it can be redone.
  const slowPick = useRef<{ suitable?: (m: ImageModel) => boolean } | null>(null);

  // Thumbnails use object URLs; release the remaining ones when the panel goes away.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  useEffect(
    () => () => {
      for (const a of attachmentsRef.current) if (a.file) URL.revokeObjectURL(a.url);
    },
    [],
  );

  function replaceAttachments(next: Attachment[]) {
    for (const a of attachmentsRef.current) if (a.file) URL.revokeObjectURL(a.url);
    setAttachments(next);
  }

  /** Re-run: same provider, model, prompt, parameters and stored inputs; reuse: one output, empty prompt (ADR-0019). */
  function applySource(g: Generation, relation: "rerun" | "reuse", output?: number) {
    slowPick.current = null;
    setSourceGone(false);
    setModelNotice(null);
    setReuseNeedsInputs(false);
    setRemovedNote(null);
    setErrors({});
    setRefused([]);
    if (relation === "rerun") {
      setChosen(g.provider);
      setModelId(g.model);
      setPrompt(g.prompt);
      setAspectRatio(g.requestedParams.aspectRatio ?? DEFAULT_ASPECT);
      setSeed(g.requestedParams.seed === undefined ? "" : String(g.requestedParams.seed));
      setN(String(g.requestedParams.n));
      replaceAttachments(
        g.inputs.map((i) => ({
          id: crypto.randomUUID(),
          url: i.url,
          name: i.originalName ?? `input-${i.position}`,
          stored: { generationId: g.id, kind: "input", position: i.position },
        })),
      );
      setDraftSource({ id: g.id, relation, prompt: g.prompt });
      setPending({ relation, model: g.model });
      return;
    }
    const img = g.images.find((i) => i.position === output);
    if (!img || output === undefined) return setSourceGone(true);
    setPrompt("");
    setAspectRatio(DEFAULT_ASPECT);
    setSeed("");
    setN("1");
    replaceAttachments([
      {
        id: crypto.randomUUID(),
        url: img.url,
        name: `output-${img.position}`,
        stored: { generationId: g.id, kind: "output", position: img.position },
      },
    ]);
    setDraftSource({ id: g.id, relation, output, prompt: g.prompt });
    setPending({ relation });
  }

  // Apply what the address carries on each arrival at Generate — a re-run / reuse source or a request to focus
  // the prompt — then clean the address (ADR-0019, ADR-0023). The page stays mounted, so this is not a mount effect.
  const route = useRoute();
  const onGenerate = route.name === "page" && route.pathname === "/";
  const carried = onGenerate ? route.search : "";
  const [focusPrompt, setFocusPrompt] = useState(false);
  // Each arrival (and each departure) gets a new number; a source load only applies if its arrival is still current.
  const arrival = useRef(0);
  const qcRef = useRef(qc);
  qcRef.current = qc;
  useEffect(() => {
    if (onGenerate) return;
    arrival.current++;
    setFocusPrompt(false);
    setLoadingSource(false);
  }, [onGenerate]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the carried address; applySource reads the latest state
  useEffect(() => {
    if (!carried) return;
    const mine = ++arrival.current;
    replace("/"); // taken from the address at once, so Back never applies it again
    if (new URLSearchParams(carried).get("focus") === "prompt") return setFocusPrompt(true);
    const src = sourceFromAddress(carried);
    if (!src) return;
    const current = () => arrival.current === mine;
    setLoadingSource(true);
    qcRef.current
      .fetchQuery({ queryKey: ["generation", src.id], queryFn: () => api.generation(src.id) })
      .then((g) => current() && applySource(g, src.relation, src.output))
      .catch(() => current() && setSourceGone(true))
      .finally(() => current() && setLoadingSource(false));
  }, [carried]);
  // Focus the prompt once the panel has settled (providers, and the model list of a configured provider);
  // if the prompt can't take focus then (no key, a generation running), drop the request rather than jump later.
  const settling = providers.isPending || (provider?.configured === true && models.isPending);
  useEffect(() => {
    if (!focusPrompt || settling) return;
    document.getElementById("prompt")?.focus();
    setFocusPrompt(false);
  });

  async function addFiles(files: File[]) {
    const accepted: Attachment[] = [];
    const reasons: string[] = [];
    for (const file of files) {
      // Refuse oversized files before reading them — a dropped multi-GB video must not be loaded into memory.
      const checked =
        file.size > MAX_INPUT_BYTES
          ? ({ ok: false, message: `${file.name} — larger than 10 MB` } as const)
          : checkInputFile(new Uint8Array(await file.arrayBuffer()), file.name);
      if (checked.ok) accepted.push({ id: crypto.randomUUID(), file, name: file.name, url: URL.createObjectURL(file) });
      else reasons.push(checked.message);
    }
    setRefused(reasons);
    setAttachments((prev) => [...prev, ...accepted]);
    setErrors(({ inputs: _drop, ...rest }) => rest);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      if (gone?.file) URL.revokeObjectURL(gone.url);
      return prev.filter((a) => a.id !== id);
    });
  }

  // A dismiss error is about the notice it failed on — drop it once the job changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed on the job identity, not read from it
  useEffect(() => setDismissError(null), [job?.id, job?.status]);

  // Re-render every second while a generation runs, so «Started N s ago» counts up between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const takesInputs = (x: ImageModel) => x.params.inputs !== undefined;
  // Nothing selected because the Owner hid what would have been picked: say so instead of "none" (AC-13).
  const hiddenNotice =
    modelId || pending || !prefsReady
      ? null
      : reuseNeedsInputs && models.data && hiddenSuitable(models.data.models, prefs, takesInputs)
        ? `The ${provider?.name ?? "provider"} models that take input images are hidden — show one on the`
        : !modelNotice && models.data && hiddenSuitable(models.data.models, prefs)
          ? `All ${provider?.name ?? "provider"} models are hidden — show one on the`
          : null;

  const model: ImageModel | undefined = models.data?.models.find((x) => x.id === modelId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: carries over only when a new list arrives, not on each keystroke
  useEffect(() => {
    if (pending) return; // a draft source decides the model once the list is in
    if (modelId || !models.data || !prefsReady || noAutoPick.current) return;
    const first = pickModel(arrangeModels(models.data.models, prefs));
    if (first) {
      if (prefsQ.isPending) slowPick.current = {};
      setModelId(first.id);
      if (carryOnLoad) {
        setCarryOnLoad(false);
        carryTo(first);
      }
    }
  }, [modelId, models.data, pending, prefsReady]);

  // Slow preferences: an automatic choice made from the plain list is redone once they arrive, unless the Owner
  // has chosen since (selectModel clears it). Same suitability rule as the original choice; once only.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the first preferences arrive
  useEffect(() => {
    const rule = slowPick.current;
    if (!rule || prefsQ.isPending || !models.data || pending || !modelId) return;
    slowPick.current = null;
    if (prefs === null) return;
    const list = models.data.models;
    const ideal = pickModel(arrangeModels(list, prefs, modelId), rule.suitable);
    const hidden = prefs.some((p) => p.model === modelId && p.hidden);
    const favorite = prefs.some((p) => p.model === ideal?.id && p.favorite);
    if (!ideal || ideal.id === modelId || !(hidden || favorite)) return;
    setModelId(ideal.id);
    carryTo(ideal);
    setModelNotice((n) => (n?.startsWith("Switched to ") ? `Switched to ${ideal.name} — it takes input images.` : n));
  }, [prefsQ.isPending, prefsQ.data, modelId, models.data, pending]);

  // Once the model list of the draft's provider is in, check the source's model (AC-10) or find one that takes inputs (AC-11).
  // biome-ignore lint/correctness/useExhaustiveDependencies: settles the pending source once per model list
  useEffect(() => {
    const list = models.data?.models;
    if (!pending || !list || !prefsReady) return;
    setPending(null);
    if (pending.relation === "rerun") {
      if (pending.model && !list.some((x) => x.id === pending.model)) {
        setModelNotice(
          `The original model ${pending.model} isn't available — choose another. The prompt, parameters and images are kept.`,
        );
        // Same rule as a manual switch: carry supported parameters over, name what was dropped (AC-05, AC-10).
        const fallback = pickModel(arrangeModels(list, prefs));
        if (fallback) {
          setModelId(fallback.id);
          carryTo(fallback);
        } else {
          noAutoPick.current = true;
          setModelId("");
        }
      }
      setCarryOnLoad(false); // the draft settled the model; a later list load must not re-carry
      return;
    }
    const arranged = arrangeModels(list, prefs, modelId);
    const current = list.find((x) => x.id === modelId);
    if (current?.params.inputs) return setModelId(current.id);
    const withInputs = pickModel(arranged, takesInputs);
    if (withInputs) {
      if (prefsQ.isPending) slowPick.current = { suitable: takesInputs };
      setModelId(withInputs.id);
      setModelNotice(`Switched to ${withInputs.name} — it takes input images.`);
    } else {
      noAutoPick.current = true;
      setModelId("");
      if (hiddenSuitable(list, prefs, takesInputs)) setReuseNeedsInputs(true);
      else setModelNotice(`No ${provider?.name ?? "provider"} model takes input images — switch provider.`);
    }
  }, [models.data, pending, prefsReady]);

  // When a generation finishes, the gallery has a new item.
  const lastStatus = useRef<Job["status"] | undefined>(undefined);
  useEffect(() => {
    // Any end of a generation may have spent credit: the navigation bar's balances are read again (AC-13).
    if (lastStatus.current === "running" && job?.status !== "running") refreshBalances(qc);
    if (lastStatus.current === "running" && job?.status === "succeeded") {
      qc.invalidateQueries({ queryKey: GALLERY_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["generation"] }); // a source's detail lists its new derived generation
      qc.invalidateQueries({ queryKey: ["cost-history"] }); // a new known cost refines per-token estimates
    }
    lastStatus.current = job?.status;
  }, [job?.status, qc]);

  const start = useMutation({
    mutationFn: ({ body, files }: { body: StartGenerationRequest; files: File[] }) =>
      files.length ? api.startGeneration(body, files) : api.startGeneration(body),
    onSuccess: (res) => {
      qc.setQueryData(JOB_QUERY_KEY, { job: res.job });
      qc.invalidateQueries({ queryKey: JOB_QUERY_KEY });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && err.details?.fields) {
        const fields = err.details.fields as FieldErrors;
        const GONE = "The source generation no longer exists";
        if (fields.source === GONE) setSourceGone(true); // only a lineage claim makes the «source» notice
        // Stored images whose generation is gone can't be sent any more: find their generations from the
        // failing positions (the link may already be removed), take them off the draft and say so (sad §11).
        const goneIds = new Set(
          Object.entries(fields)
            .filter(([k, v]) => k.startsWith("inputs.") && v === GONE)
            .map(([k]) => attachments[Number(k.slice("inputs.".length)) - 1]?.stored?.generationId)
            .filter((id): id is string => id !== undefined),
        );
        if (fields.source === GONE && draftSource) goneIds.add(draftSource.id);
        if (goneIds.size) {
          setAttachments(attachments.filter((a) => !a.stored || !goneIds.has(a.stored.generationId)));
          setRemovedNote("Images from a deleted generation were removed.");
        }
        setErrors(
          Object.fromEntries(Object.entries(fields).filter(([k, v]) => !(k.startsWith("inputs.") && v === GONE))),
        );
      } else if (err instanceof ApiError && err.code === "GENERATION_IN_PROGRESS")
        qc.invalidateQueries({ queryKey: JOB_QUERY_KEY });
      else setRequestError(err instanceof Error ? err.message : String(err));
    },
  });
  const dismiss = useMutation({
    mutationFn: () => api.dismissJob(),
    onMutate: () => setDismissError(null),
    onSuccess: () => qc.setQueryData(JOB_QUERY_KEY, { job: null }),
    onError: (err) => {
      setDismissError(err instanceof Error ? err.message : String(err));
      qc.invalidateQueries({ queryKey: JOB_QUERY_KEY });
    },
  });

  function selectProvider(id: string) {
    if (id !== "openrouter" && id !== "vercel") return;
    setChosen(id);
    try {
      sessionStorage.setItem(PROVIDER_STORAGE, id);
    } catch {}
    selectModel(""); // the first model of the new list is preselected; prompt and attachments are kept
  }

  /** Model switch (SAD §4 choice 4): keep what the new model supports, remove and name the rest. */
  function carryTo(next: ImageModel) {
    const current: RequestedParams = {
      n: Math.max(1, Number(n) || 1),
      ...(aspectRatio !== DEFAULT_ASPECT ? { aspectRatio } : {}),
      ...(seed.trim() !== "" && Number.isInteger(Number(seed)) ? { seed: Number(seed) } : {}),
    };
    const { params, removed } = carryParams(current, next);
    setAspectRatio(params.aspectRatio ?? DEFAULT_ASPECT);
    setSeed(params.seed === undefined ? "" : String(params.seed));
    setN(String(params.n));
    const names = removed.filter((r) => !r.startsWith("images lowered"));
    const lowered = removed.find((r) => r.startsWith("images lowered"));
    const parts = [
      ...(names.length ? [`Not supported by this model: ${names.join(", ")}.`] : []),
      ...(lowered ? [`Images lowered to ${params.n}.`] : []),
    ];
    setRemovedNote(parts.length ? parts.join(" ") : null);
  }

  function selectModel(id: string) {
    setReuseNeedsInputs(false);
    noAutoPick.current = false;
    slowPick.current = null;
    setModelId(id);
    setErrors({});
    setRefused([]);
    const next = models.data?.models.find((x) => x.id === id);
    if (next) carryTo(next);
    else setCarryOnLoad(true); // provider switch: the new list's first model is checked once it loads
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setRequestError(null);
    const body = {
      provider: providerId,
      model: modelId,
      prompt,
      params: {
        n: Number(n),
        ...(aspectRatio !== DEFAULT_ASPECT ? { aspectRatio } : {}),
        ...(seed.trim() !== "" ? { seed: Number(seed) } : {}),
      },
    };
    const parsed = StartGenerationRequest.safeParse(body);
    const fields: FieldErrors = {};
    if (!parsed.success) for (const i of parsed.error.issues) fields[i.path.join(".")] ??= i.message;
    else if (model) Object.assign(fields, checkAgainstModel(parsed.data.params, model, attachments.length));
    setErrors(fields);
    if (Object.keys(fields).length > 0 || !parsed.success) return;
    // Stored images ride as references, uploads as upload slots, in the order shown (ADR-0017).
    const files = attachments.flatMap((a) => (a.file ? [a.file] : []));
    let upload = 0;
    const inputs: InputSlot[] | undefined = attachments.some((a) => a.stored)
      ? attachments.map((a) => (a.stored ? { stored: a.stored } : { upload: ++upload }))
      : undefined;
    const source: SourceRef | undefined = draftSource
      ? draftSource.relation === "reuse"
        ? { id: draftSource.id, relation: "reuse", output: draftSource.output }
        : { id: draftSource.id, relation: "rerun" }
      : undefined;
    start.mutate({ body: { ...parsed.data, ...(source ? { source } : {}), ...(inputs ? { inputs } : {}) }, files });
  }

  let body: ReactNode;
  if (providers.isPending) body = <p className="text-muted-foreground text-sm">Loading…</p>;
  else if (providers.isError) body = <Notice title="Couldn't reach the Ukiyo server" />;
  else if (!provider?.configured)
    body = (
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium">{provider?.name ?? "This provider"} is not configured.</p>
        <p className="text-muted-foreground">
          Add <code>{KEY_VARS[providerId]}</code> to <code>.env.local</code> and restart Ukiyo. Your gallery is still
          available.
        </p>
      </div>
    );
  else if (models.isError)
    body = (
      <Notice
        title="Model list unavailable"
        action={
          <Button variant="outline" size="sm" onClick={() => models.refetch()}>
            Retry
          </Button>
        }
      >
        <p>{models.error.message}</p>
      </Notice>
    );
  else {
    const disabled = running || start.isPending || models.isPending;
    // The picker appears once the automatic choice is made, so it never shows a model that is about to change.
    const choosing =
      models.isPending ||
      !prefsReady ||
      pending !== null ||
      (!modelId &&
        !noAutoPick.current &&
        models.data &&
        pickModel(arrangeModels(models.data.models, prefs)) !== undefined);
    const inputRange = model?.params.inputs
      ? { min: model.params.inputs.min, max: Math.min(model.params.inputs.max, MAX_INPUT_IMAGES) }
      : undefined;
    const overLimit = attachments.length > (inputRange?.max ?? 0);
    const maxN = model?.params.n?.max ?? 1;
    const invalid = (k: string) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {});
    body = (
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field id="model" label="Model" error={errors.model}>
          {choosing ? (
            <p id="model" className="flex h-9 items-center rounded-md border px-3 text-muted-foreground text-sm">
              Loading models…
            </p>
          ) : (
            <ModelPicker
              provider={providerId}
              models={models.data?.models ?? []}
              value={modelId}
              onChange={selectModel}
              disabled={disabled}
              triggerProps={{ id: "model", ...invalid("model") }}
            />
          )}
          <PriceLine provider={providerId} model={modelId} />
          {removedNote && <p className="text-muted-foreground text-sm">{removedNote}</p>}
        </Field>
        <Field id="prompt" label="Prompt" error={errors.prompt}>
          <Textarea
            id="prompt"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={disabled}
            {...invalid("prompt")}
          />
        </Field>
        {(inputRange || attachments.length > 0) && (
          <InputImages
            attachments={attachments}
            range={inputRange}
            refused={refused}
            error={
              errors.inputs ??
              (Object.entries(errors)
                .filter(([k]) => k.startsWith("inputs."))
                .map(([, v]) => v)
                .join("; ") ||
                undefined)
            }
            disabled={disabled}
            onAdd={addFiles}
            onRemove={removeAttachment}
          />
        )}
        {model?.params.aspectRatio && (
          <Field id="params.aspectRatio" label="Aspect ratio" error={errors["params.aspectRatio"]}>
            <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={disabled}>
              <SelectTrigger id="params.aspectRatio" className="w-full" {...invalid("params.aspectRatio")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_ASPECT}>Model default</SelectItem>
                {model.params.aspectRatio.values.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {model?.params.seed && (
          <Field id="params.seed" label="Seed" error={errors["params.seed"]}>
            <Input
              id="params.seed"
              type="number"
              inputMode="numeric"
              placeholder="random"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={disabled}
              {...invalid("params.seed")}
            />
          </Field>
        )}
        <Field id="params.n" label="Images" error={errors["params.n"]}>
          <Input
            id="params.n"
            type="number"
            min={1}
            max={maxN}
            value={n}
            onChange={(e) => setN(e.target.value)}
            disabled={disabled}
            {...invalid("params.n")}
          />
        </Field>

        {job?.status === "failed" && (
          <Notice
            title="Generation failed"
            action={
              <Button variant="ghost" size="sm" onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>
                Dismiss
              </Button>
            }
          >
            <p>{job.error?.message}</p>
          </Notice>
        )}
        {dismissError && (
          <Notice title="Couldn't dismiss the notice">
            <p>{dismissError}</p>
          </Notice>
        )}
        {requestError && <Notice title="Couldn't start the generation">{requestError}</Notice>}

        <EstimateLine
          provider={providerId}
          model={modelId}
          images={Math.max(1, Number(n) || 1)}
          inputs={attachments.length}
        />
        <Button type="submit" disabled={disabled || overLimit}>
          {running || start.isPending ? (
            <>
              <Loader2 className="animate-spin" /> Generating…
            </>
          ) : (
            "Generate"
          )}
        </Button>
        {running && job && (
          <p className="text-muted-foreground text-sm">
            Started {Math.max(0, Math.round((now - Date.parse(job.startedAt)) / 1000))} s ago
          </p>
        )}
        {job?.status === "succeeded" && job.generationId && <LatestResult generationId={job.generationId} />}
      </form>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list.length > 0 && (
          <Field id="provider" label="Provider">
            <Select value={providerId} onValueChange={selectProvider} disabled={running || start.isPending}>
              <SelectTrigger id="provider" className="w-full">
                <SelectValue>{provider?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {list.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.configured ? p.name : `${p.name} — not configured`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {loadingSource && <p className="text-muted-foreground text-sm">Loading the source generation…</p>}
        {draftSource && (
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                Started from:{" "}
                <Link to={`/generations/${draftSource.id}`} className="underline underline-offset-4">
                  {draftSource.relation === "rerun"
                    ? `Re-run of «${excerpt(draftSource.prompt)}»`
                    : `Made from output ${draftSource.output} of «${excerpt(draftSource.prompt)}»`}
                </Link>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove the link to the source"
                onClick={() => setDraftSource(null)}
              >
                ×
              </Button>
            </div>
            {draftSource.relation === "rerun" && (
              <p className="text-muted-foreground">Sends the same inputs again — results can differ.</p>
            )}
          </div>
        )}
        {sourceGone && (
          <Notice
            title="The source generation no longer exists."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSourceGone(false);
                  setDraftSource(null);
                  setErrors(({ source: _drop, ...rest }) => rest);
                }}
              >
                Remove the link
              </Button>
            }
          />
        )}
        {modelNotice && <Notice title={modelNotice} />}
        {hiddenNotice && (
          <Notice
            title={
              <>
                {hiddenNotice}{" "}
                <Link to="/models" className="underline underline-offset-4">
                  Models page
                </Link>
                .
              </>
            }
          />
        )}
        {body}
      </CardContent>
    </Card>
  );
}
