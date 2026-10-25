import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, SlidersHorizontal, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { replace, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { ModelPreference } from "../../../shared/models";
import type { Recording, SpeechModel } from "../../../shared/speech";
import { balanceText, refreshBalances, useProviderBalance, useProviders } from "../balances/balances";
import { useModelPreferences } from "../models/preferences";
import { onRecordingDeleted } from "./gallery/patchRecordings";
import { SPEECH_PATH } from "./gallery/reuse";
import { limitText, ModelSelect } from "./ModelSelect";
import { SPEECH_MODELS_KEY as MODELS_KEY, RECORDINGS_KEY } from "./queryKeys";
import { RecentRecordings } from "./RecentRecordings";
import { ReplaceTextDialog } from "./ReplaceTextDialog";
import { SpeechResult } from "./SpeechResult";
import { estimateText } from "./speechCost";
import { type Draft, useSpeechDraft } from "./useSpeechDraft";
import { VoiceControls } from "./VoiceControls";
import { VoiceSelect } from "./VoiceSelect";

const group = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");
const PREFS_WAIT_MS = 1500;
const NOT_CONFIGURED = "Speech needs OpenRouter — set OPENROUTER_API_KEY in .env.local and restart the server.";

const notConfigured = (e: unknown) => e instanceof ApiError && e.code === "PROVIDER_NOT_CONFIGURED";
const errorText = (e: unknown) =>
  notConfigured(e) ? NOT_CONFIGURED : e instanceof Error ? e.message : "Something went wrong";

/** Card shell from the reference: a muted frame with a raised content panel and an optional footer strip. */
function Panel({ children, footer, className }: { children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 overflow-hidden rounded-xl bg-muted/40 text-card-foreground text-sm ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex-1 overflow-hidden rounded-lg bg-card p-4 shadow-2xs ring-1 ring-foreground/5">
        {children}
      </div>
      {footer && <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">{footer}</div>}
    </div>
  );
}

function SettingsTab({
  idPrefix,
  draft,
  models,
  prefs,
  modelsError,
  onRetry,
}: {
  idPrefix: string;
  draft: Draft;
  models: SpeechModel[] | undefined;
  prefs: ModelPreference[] | null | undefined;
  modelsError: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-voice`}>Voice</Label>
        <VoiceSelect id={`${idPrefix}-voice`} model={draft.model} value={draft.voice} onChange={draft.setVoice} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-model`}>Model</Label>
        {modelsError ? (
          <p className="text-destructive text-xs">
            Couldn't load speech models — {modelsError}{" "}
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </p>
        ) : (
          <ModelSelect
            id={`${idPrefix}-model`}
            models={models}
            prefs={prefs}
            value={draft.model?.id ?? ""}
            onChange={draft.selectModel}
          />
        )}
      </div>
      <Separator />
      <div className="space-y-5">
        <h3 className="font-semibold text-sm">Voice adjustment</h3>
        {draft.model && (
          <VoiceControls
            idPrefix={idPrefix}
            controls={draft.model.controls}
            settings={draft.settings}
            onChange={draft.setSettings}
          />
        )}
      </div>
    </div>
  );
}

/** SCR-02…SCR-04 — Text to Speech: every OpenRouter speech model, each with its own controls (step 18). */
export function SpeechPage() {
  const queryClient = useQueryClient();
  const models = useQuery({ queryKey: MODELS_KEY, queryFn: api.speechModels, staleTime: 10 * 60_000, retry: false });
  // OpenRouter's balance — the same cache entry as the navigation bar (ADR-0055); «not configured» from the providers list.
  const providers = useProviders();
  const openRouter = providers.data?.providers.find((p) => p.id === "openrouter");
  const credits = useProviderBalance("openrouter", openRouter?.configured === true);
  // The Owner's speech-model favorites / hidden ones shape the list (models-page-audio AC-03, AC-04); a slow read
  // doesn't hold the automatic pick for longer than GeneratePanel's 1.5 s.
  const speechPrefs = useModelPreferences("openrouter", openRouter?.configured === true, "speech");
  const [prefsWaited, setPrefsWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPrefsWaited(true), PREFS_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const prefList = speechPrefs.isError ? null : speechPrefs.data?.preferences;
  const draft = useSpeechDraft(models.data?.models, {
    list: prefList,
    settled: speechPrefs.isSuccess || speechPrefs.isError || prefsWaited || openRouter?.configured === false,
  });
  const [result, setResult] = useState<{ recording: Recording; fresh: boolean } | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  // A recording deleted anywhere (the gallery, the recent list) is no longer the latest result (audio-gallery AC-11).
  useEffect(() => onRecordingDeleted((id) => setResult((cur) => (cur?.recording.id === id ? null : cur))), []);
  // The latest result is read back while its cost is pending, so it settles without a reload (spec AC-13, review R1).
  const latest = useQuery({
    queryKey: ["recording", result?.recording.id],
    queryFn: () => api.recording(result?.recording.id ?? ""),
    enabled: result !== null,
    initialData: result?.recording,
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: (q) => (q.state.status !== "error" && q.state.data?.costStatus === "pending" ? 10_000 : false),
  });
  const shown = result ? (latest.data ?? result.recording) : null;

  // One Owner action sends one paid request (AC-17): the pending flag updates asynchronously, this ref at once.
  const inFlight = useRef(false);
  const generate = useMutation({
    mutationFn: (body: Parameters<typeof api.createRecording>[0]) => api.createRecording(body),
    onSettled: () => {
      inFlight.current = false;
      // A failed or timed-out request may still be billed: the balance shows it (spec §6.1, review R7).
      refreshBalances(queryClient);
    },
    onSuccess: (recording) => {
      // A result that arrives while the Owner is on another section never starts playing by itself (ADR-0050).
      setResult({ recording, fresh: !rootRef.current?.closest("[hidden]") });
      queryClient.invalidateQueries({ queryKey: RECORDINGS_KEY });
    },
  });

  // Reuse handed over from the audio gallery: `?reuse=<id>` on arrival, applied once the recording and the model
  // list are known, never while a request is in flight (audio-gallery ADR-0053, AC-16/AC-17).
  const route = useRoute();
  // Only Speech's own address: the page stays mounted while other sections show, and the image gallery uses
  // `/?reuse=` for its own reuse (review R1).
  const onSpeech = route.name === "page" && route.pathname.replace(/(.)\/$/, "$1") === SPEECH_PATH;
  const reuseMark = onSpeech ? new URLSearchParams(route.search).get("reuse") : null;
  const [reuseId, setReuseId] = useState<string | null>(null);
  const [reuseNote, setReuseNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<Recording | null>(null);
  useEffect(() => {
    if (!reuseMark) return;
    setReuseNote(null);
    if (inFlight.current) setReuseNote("Wait for the current recording to finish, then reuse.");
    else setReuseId(reuseMark);
    replace(window.location.pathname); // the mark is applied once
  }, [reuseMark]);
  const reuseRec = useQuery({
    queryKey: ["recording", reuseId],
    queryFn: () => api.recording(reuseId ?? ""),
    enabled: reuseId !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const applyReuse = (r: Recording) => {
    draft.reuse(r);
    setResult({ recording: r, fresh: false });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the recording or the model list arrives
  useEffect(() => {
    if (reuseId === null) return;
    if (reuseRec.isError && !reuseRec.isFetching) {
      setReuseNote(
        reuseRec.error instanceof ApiError && reuseRec.error.status === 404
          ? "This recording no longer exists."
          : "Couldn't load the recording to reuse.",
      );
      setReuseId(null);
      return;
    }
    if (!reuseRec.data || reuseRec.isFetching || !models.data) return; // wait (a models error shows its own Try again)
    const r = reuseRec.data;
    setReuseId(null);
    if (inFlight.current) {
      // Generate was pressed while the recording loaded: never swap the form under a request (review R2).
      setReuseNote("Wait for the current recording to finish, then reuse.");
      return;
    }
    if (draft.text.trim() && draft.text !== r.text) setAsking(r);
    else applyReuse(r);
  }, [reuseId, reuseRec.data, reuseRec.isError, reuseRec.isFetching, models.data]);

  const unconfigured = openRouter?.configured === false;
  const model = draft.model;
  const canGenerate = !!model && draft.chars > 0 && !draft.tooLong && !unconfigured && !generate.isPending;
  const submit = () => {
    if (!canGenerate || !model || inFlight.current) return;
    inFlight.current = true;
    generate.mutate({ text: draft.text, model: model.id, voice: draft.voice, settings: draft.settings });
  };
  const estimate = model ? estimateText(model.price, draft.chars) : null;
  const maxChars = model?.maxChars ?? 5000;

  const side = (idPrefix: string) => (
    <Tabs defaultValue="settings" className="gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="recent">Recent</TabsTrigger>
      </TabsList>
      <TabsContent value="settings">
        <SettingsTab
          idPrefix={idPrefix}
          draft={draft}
          models={models.data?.models}
          prefs={prefList}
          modelsError={models.isError ? errorText(models.error) : null}
          onRetry={() => models.refetch()}
        />
      </TabsContent>
      <TabsContent value="recent">
        <RecentRecordings
          draftText={draft.text}
          onReuse={(r) => {
            draft.reuse(r);
            setResult({ recording: r, fresh: false });
          }}
        />
      </TabsContent>
    </Tabs>
  );

  return (
    <section ref={rootRef} aria-label="Text to Speech" className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">Text to Speech</h2>
          <p className="text-muted-foreground text-sm">Convert text into natural sounding speech.</p>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="size-8 lg:hidden">
              <SlidersHorizontal />
              <span className="sr-only">Settings</span>
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Speech settings</SheetTitle>
              <SheetDescription className="sr-only">
                Voice, model, voice adjustment and recent recordings
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">{side("speech-sheet")}</div>
          </SheetContent>
        </Sheet>
      </div>
      {unconfigured && (
        <Panel>
          <p className="text-sm">{NOT_CONFIGURED}</p>
        </Panel>
      )}
      {draft.notice && <p className="text-muted-foreground text-sm">{draft.notice}</p>}
      {reuseId !== null && <p className="text-muted-foreground text-sm">Loading the recording…</p>}
      {reuseNote && <p className="text-muted-foreground text-sm">{reuseNote}</p>}
      <ReplaceTextDialog
        open={asking !== null}
        onKeep={() => setAsking(null)}
        onReplace={() => {
          if (asking) applyReuse(asking);
          setAsking(null);
        }}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="space-y-4 lg:space-y-6">
          <Panel
            footer={
              <>
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  {openRouter?.configured && (
                    <>
                      <Coins className="size-4" aria-hidden />
                      <span className="tabular-nums">{balanceText(credits)}</span> credits remaining
                    </>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {estimate && <span className="text-muted-foreground text-xs tabular-nums">{estimate}</span>}
                  <Button disabled={!canGenerate} onClick={submit}>
                    {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {generate.isPending ? "Generating…" : "Generate speech"}
                  </Button>
                </div>
              </>
            }
          >
            <Textarea
              aria-label="Text"
              value={draft.text}
              onChange={(e) => draft.setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder={`Describe what you want to say. Paste a script, a story, or any text up to ${group(maxChars)} characters...`}
              className="field-sizing-content min-h-48 resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 md:text-base lg:min-h-64 dark:bg-transparent"
            />
            <div
              className={cn(
                "mt-2 text-end text-xs tabular-nums",
                draft.tooLong ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {group(draft.chars)} / {group(maxChars)} characters
              {model?.maxCharsSource === "default" && ` · ${limitText(model).split(" · ")[1]}`}
            </div>
          </Panel>
          {generate.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorText(generate.error)}
            </p>
          )}
          {result && shown && (
            <Panel>
              <SpeechResult key={shown.id} recording={shown} autoPlay={result.fresh} />
            </Panel>
          )}
        </div>
        <Panel className="hidden lg:block">{side("speech-panel")}</Panel>
      </div>
    </section>
  );
}
