import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, SlidersHorizontal, Sparkles } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Recording, SpeechModel } from "../../../shared/speech";
import { limitText, ModelSelect } from "./ModelSelect";
import { SpeechResult } from "./SpeechResult";
import { estimateText } from "./speechCost";
import { type Draft, useSpeechDraft } from "./useSpeechDraft";
import { VoiceControls } from "./VoiceControls";
import { VoiceSelect } from "./VoiceSelect";

export const RECORDINGS_KEY = ["recordings"] as const;
const MODELS_KEY = ["speech-models"] as const;
const CREDITS_KEY = ["speech-credits"] as const;

const group = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");
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
  draft,
  models,
  modelsError,
  onRetry,
}: {
  draft: Draft;
  models: SpeechModel[] | undefined;
  modelsError: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="speech-voice">Voice</Label>
        <VoiceSelect id="speech-voice" model={draft.model} value={draft.voice} onChange={draft.setVoice} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="speech-model">Model</Label>
        {modelsError ? (
          <p className="text-destructive text-xs">
            Couldn't load speech models — {modelsError}{" "}
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </p>
        ) : (
          <ModelSelect id="speech-model" models={models} value={draft.model?.id ?? ""} onChange={draft.selectModel} />
        )}
      </div>
      <Separator />
      <div className="space-y-5">
        <h3 className="font-semibold text-sm">Voice adjustment</h3>
        {draft.model && (
          <VoiceControls controls={draft.model.controls} settings={draft.settings} onChange={draft.setSettings} />
        )}
      </div>
    </div>
  );
}

/** SCR-02…SCR-04 — Text to Speech: every OpenRouter speech model, each with its own controls (step 18). */
export function SpeechPage() {
  const queryClient = useQueryClient();
  const models = useQuery({ queryKey: MODELS_KEY, queryFn: api.speechModels, staleTime: 10 * 60_000, retry: false });
  const credits = useQuery({ queryKey: CREDITS_KEY, queryFn: api.speechCredits, retry: false });
  const draft = useSpeechDraft(models.data?.models);
  const [result, setResult] = useState<{ recording: Recording; fresh: boolean } | null>(null);

  // One Owner action sends one paid request (AC-17): the pending flag updates asynchronously, this ref at once.
  const inFlight = useRef(false);
  const generate = useMutation({
    mutationFn: (body: Parameters<typeof api.createRecording>[0]) => api.createRecording(body),
    onSettled: () => {
      inFlight.current = false;
    },
    onSuccess: (recording) => {
      setResult({ recording, fresh: true });
      queryClient.invalidateQueries({ queryKey: RECORDINGS_KEY });
      queryClient.invalidateQueries({ queryKey: CREDITS_KEY });
    },
  });

  const unconfigured = notConfigured(credits.error);
  const model = draft.model;
  const canGenerate = !!model && draft.chars > 0 && !draft.tooLong && !unconfigured && !generate.isPending;
  const submit = () => {
    if (!canGenerate || !model || inFlight.current) return;
    inFlight.current = true;
    generate.mutate({ text: draft.text, model: model.id, voice: draft.voice, settings: draft.settings });
  };
  const estimate = model ? estimateText(model.price, draft.chars) : null;
  const maxChars = model?.maxChars ?? 5000;

  const side = (
    <Tabs defaultValue="settings" className="gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="settings">
        <SettingsTab
          draft={draft}
          models={models.data?.models}
          modelsError={models.isError ? errorText(models.error) : null}
          onRetry={() => models.refetch()}
        />
      </TabsContent>
    </Tabs>
  );

  return (
    <section aria-label="Text to Speech" className="space-y-4 lg:space-y-6">
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
            <div className="px-4 pb-4">{side}</div>
          </SheetContent>
        </Sheet>
      </div>
      {unconfigured && (
        <Panel>
          <p className="text-sm">{NOT_CONFIGURED}</p>
        </Panel>
      )}
      {draft.notice && <p className="text-muted-foreground text-sm">{draft.notice}</p>}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="space-y-4 lg:space-y-6">
          <Panel
            footer={
              <>
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  {credits.data && (
                    <>
                      <Coins className="size-4" aria-hidden />
                      <span className="tabular-nums">${credits.data.remainingUsd.toFixed(2)}</span> credits remaining
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
          {result && (
            <Panel>
              <SpeechResult recording={result.recording} autoPlay={result.fresh} />
            </Panel>
          )}
        </div>
        <Panel className="hidden lg:block">{side}</Panel>
      </div>
    </section>
  );
}
