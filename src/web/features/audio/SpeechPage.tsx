import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Download, Loader2, RotateCcw, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { excerpt, formatRelative } from "@/lib/format";
import {
  type AudioGeneration,
  DEFAULT_VOICE_SETTINGS,
  SPEECH_MODELS,
  type SpeechModel,
  speechModel,
  type Voice,
  type VoiceSettings,
} from "../../../shared/audio";

const AUDIO_QUERY_KEY = ["audio-generations"] as const;
const DOTS = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-teal-500"];

/** A stable colour per voice, so the same voice always gets the same dot. */
function dotFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return DOTS[Math.abs(h) % DOTS.length];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const V3_STABILITY: Record<number, string> = { 0: "Creative", 0.5: "Natural", 1: "Robust" };

/** Card shell from the reference: a muted frame with a raised content panel and an optional footer strip. */
function Panel({ children, footer, className }: { children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col gap-1 overflow-hidden rounded-xl bg-muted/40 text-card-foreground text-sm ring-1 ring-foreground/10 ${className ?? ""}`}
    >
      <div className="flex-1 overflow-hidden rounded-lg bg-card p-4 shadow-2xs ring-1 ring-foreground/5">
        {children}
      </div>
      {footer && <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">{footer}</div>}
    </div>
  );
}

function SliderRow(props: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  low: string;
  high: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{props.label}</Label>
        <span className="text-muted-foreground text-xs tabular-nums">{props.display}</span>
      </div>
      <Slider
        aria-label={props.label}
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step}
        onValueChange={([v]) => v !== undefined && props.onChange(v)}
      />
      <div className="flex justify-between text-muted-foreground text-xs">
        <span>{props.low}</span>
        <span>{props.high}</span>
      </div>
    </div>
  );
}

type SettingsProps = {
  voices: Voice[] | undefined;
  voicesError: string | null;
  voiceId: string;
  onVoice: (id: string) => void;
  model: SpeechModel;
  onModel: (id: string) => void;
  settings: Required<VoiceSettings>;
  onSettings: (s: Required<VoiceSettings>) => void;
};

function SettingsTab({ voices, voicesError, voiceId, onVoice, model, onModel, settings, onSettings }: SettingsProps) {
  const set = (patch: Partial<VoiceSettings>) => onSettings({ ...settings, ...patch });
  const has = (c: keyof VoiceSettings) => model.controls.includes(c);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="speech-voice">Voice</Label>
        {voicesError ? (
          <p className="text-destructive text-xs">{voicesError}</p>
        ) : (
          <Select value={voiceId} onValueChange={onVoice} disabled={!voices}>
            <SelectTrigger id="speech-voice" className="w-full">
              <SelectValue placeholder={voices ? "Choose a voice" : "Loading voices…"} />
            </SelectTrigger>
            <SelectContent>
              {voices?.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className={`size-2.5 shrink-0 rounded-full ${dotFor(v.id)}`} aria-hidden />
                  {v.description ? `${v.name} - ${v.description}` : v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="speech-model">Model</Label>
        <Select value={model.id} onValueChange={onModel}>
          <SelectTrigger id="speech-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEECH_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Separator />
      <div className="space-y-5">
        <h3 className="font-semibold text-sm">Voice adjustment</h3>
        {has("speed") && (
          <SliderRow
            label="Speed"
            value={settings.speed}
            display={pct(settings.speed)}
            min={0.7}
            max={1.2}
            step={0.01}
            low="Slower"
            high="Faster"
            onChange={(speed) => set({ speed })}
          />
        )}
        {has("stability") &&
          (model.stabilitySteps ? (
            <SliderRow
              label="Stability"
              value={nearest(settings.stability, model.stabilitySteps)}
              display={V3_STABILITY[nearest(settings.stability, model.stabilitySteps)] ?? ""}
              min={0}
              max={1}
              step={0.5}
              low="Creative"
              high="Robust"
              onChange={(stability) => set({ stability })}
            />
          ) : (
            <SliderRow
              label="Stability"
              value={settings.stability}
              display={pct(settings.stability)}
              min={0}
              max={1}
              step={0.01}
              low="More variable"
              high="More stable"
              onChange={(stability) => set({ stability })}
            />
          ))}
        {has("similarity") && (
          <SliderRow
            label="Similarity"
            value={settings.similarity}
            display={pct(settings.similarity)}
            min={0}
            max={1}
            step={0.01}
            low="Low"
            high="High"
            onChange={(similarity) => set({ similarity })}
          />
        )}
        {has("style") && (
          <SliderRow
            label="Style Exaggeration"
            value={settings.style}
            display={pct(settings.style)}
            min={0}
            max={1}
            step={0.01}
            low="None"
            high="Exaggerated"
            onChange={(style) => set({ style })}
          />
        )}
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-2">
        {has("speakerBoost") ? (
          <Label className="gap-2">
            <Switch checked={settings.speakerBoost} onCheckedChange={(speakerBoost) => set({ speakerBoost })} />
            Speaker Boost
          </Label>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" onClick={() => onSettings(DEFAULT_VOICE_SETTINGS)}>
          <RotateCcw />
          Reset values
        </Button>
      </div>
    </div>
  );
}

const nearest = (v: number, steps: readonly number[]) =>
  steps.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), steps[0] ?? v);

function HistoryTab({ onPick }: { onPick: (g: AudioGeneration) => void }) {
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: AUDIO_QUERY_KEY, queryFn: api.audioGenerations });
  const remove = useMutation({
    mutationFn: api.deleteAudio,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AUDIO_QUERY_KEY }),
  });
  if (history.isPending) return <p className="text-muted-foreground text-xs">Loading…</p>;
  if (history.isError) return <p className="text-destructive text-xs">Couldn't load the history.</p>;
  if (history.data.items.length === 0) return <p className="text-muted-foreground text-xs">No speech generated yet.</p>;
  return (
    <ul className="max-h-[70vh] space-y-3 overflow-y-auto">
      {history.data.items.map((g) => (
        <li key={g.id} className="space-y-2 rounded-lg border p-3">
          <button type="button" className="block w-full text-left" onClick={() => onPick(g)}>
            <span className="line-clamp-2">{excerpt(g.text, 140)}</span>
            <span className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs">
              <span className={`size-2 rounded-full ${dotFor(g.voiceId)}`} aria-hidden />
              {g.voiceName} · {speechModel(g.model)?.name ?? g.model} · {formatRelative(g.createdAt)}
            </span>
          </button>
          {/* biome-ignore lint/a11y/useMediaCaption: generated speech has no caption track */}
          <audio controls preload="none" src={g.url} className="h-8 w-full" />
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" asChild>
              <a href={g.url} download>
                <Download />
                Download
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(g.id)}
              aria-label={`Delete speech from ${formatRelative(g.createdAt)}`}
            >
              <Trash2 />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SidePanel(props: SettingsProps & { onPick: (g: AudioGeneration) => void }) {
  return (
    <Tabs defaultValue="settings" className="gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="settings">
        <SettingsTab {...props} />
      </TabsContent>
      <TabsContent value="history">
        <HistoryTab onPick={props.onPick} />
      </TabsContent>
    </Tabs>
  );
}

const errorText = (e: unknown) =>
  e instanceof ApiError && e.code === "PROVIDER_NOT_CONFIGURED"
    ? "ElevenLabs isn't configured — set ELEVENLABS_API_KEY in .env.local and restart the server."
    : e instanceof Error
      ? e.message
      : "Something went wrong";

/** Text to Speech — ElevenLabs models only; every result is saved under the data dir. */
export function SpeechPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(SPEECH_MODELS[0]?.id ?? "");
  const [chosenVoice, setChosenVoice] = useState("");
  const [settings, setSettings] = useState<Required<VoiceSettings>>(DEFAULT_VOICE_SETTINGS);
  const [result, setResult] = useState<AudioGeneration | null>(null);

  const model = speechModel(modelId) ?? (SPEECH_MODELS[0] as SpeechModel);
  const voices = useQuery({ queryKey: ["audio-voices"], queryFn: api.voices, retry: false, staleTime: 10 * 60_000 });
  const credits = useQuery({ queryKey: ["audio-credits"], queryFn: api.audioCredits, retry: false });
  const voiceId = chosenVoice || voices.data?.voices[0]?.id || "";
  const voice = voices.data?.voices.find((v) => v.id === voiceId);

  const generate = useMutation({
    mutationFn: api.generateSpeech,
    onSuccess: (g) => {
      setResult(g);
      queryClient.invalidateQueries({ queryKey: AUDIO_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["audio-credits"] });
    },
  });

  const tooLong = text.length > model.maxChars;
  const canGenerate = text.trim().length > 0 && !tooLong && voice !== undefined && !generate.isPending;
  const submit = () =>
    voice && generate.mutate({ text, model: model.id, voiceId: voice.id, voiceName: voice.name, settings });

  const pick = (g: AudioGeneration) => {
    setResult(g);
    setText(g.text);
    if (speechModel(g.model)) setModelId(g.model);
    setChosenVoice(g.voiceId);
    setSettings({ ...DEFAULT_VOICE_SETTINGS, ...g.settings });
  };

  const panelProps = {
    voices: voices.data?.voices,
    voicesError: voices.isError ? errorText(voices.error) : null,
    voiceId,
    onVoice: setChosenVoice,
    model,
    onModel: setModelId,
    settings,
    onSettings: setSettings,
    onPick: pick,
  };

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
              <SheetDescription className="sr-only">Voice, model and voice adjustment</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">
              <SidePanel {...panelProps} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="space-y-4 lg:space-y-6">
          <Panel
            footer={
              <>
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  {credits.data && (
                    <>
                      <Coins className="size-4" aria-hidden />
                      <span className="tabular-nums">
                        {(credits.data.limit - credits.data.used).toLocaleString("en-US")}
                      </span>{" "}
                      credits remaining
                    </>
                  )}
                </span>
                <Button disabled={!canGenerate} onClick={submit}>
                  {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {generate.isPending ? "Generating…" : "Generate speech"}
                </Button>
              </>
            }
          >
            <Textarea
              aria-label="Text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) submit();
              }}
              placeholder={`Describe what you want to say. Paste a script, a story, or any text up to ${model.maxChars.toLocaleString("en-US")} characters...`}
              className="field-sizing-content min-h-48 resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 md:text-base lg:min-h-64 dark:bg-transparent"
            />
            <div
              className={`mt-2 text-end text-xs tabular-nums ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
            >
              {text.length.toLocaleString("en-US")} / {model.maxChars.toLocaleString("en-US")} characters
            </div>
          </Panel>
          {generate.isError && (
            <p role="alert" className="text-destructive text-sm">
              {errorText(generate.error)}
            </p>
          )}
          {result && (
            <Panel>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={`size-2.5 rounded-full ${dotFor(result.voiceId)}`} aria-hidden />
                    {result.voiceName}
                    <span className="font-normal text-muted-foreground text-xs">
                      {speechModel(result.model)?.name ?? result.model} · {formatRelative(result.createdAt)}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <a href={result.url} download>
                      <Download />
                      Download
                    </a>
                  </Button>
                </div>
                {/* biome-ignore lint/a11y/useMediaCaption: generated speech has no caption track */}
                <audio
                  key={result.id}
                  controls
                  autoPlay={result.id === generate.data?.id}
                  src={result.url}
                  className="w-full"
                />
              </div>
            </Panel>
          )}
        </div>
        <Panel className="hidden lg:block">
          <SidePanel {...panelProps} />
        </Panel>
      </div>
    </section>
  );
}
