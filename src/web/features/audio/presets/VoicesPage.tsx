import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ellipsis, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, api } from "@/lib/api";
import { isDialogVisit, Link, navigate, type Route, replace, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { SpeechModel } from "../../../../shared/speech";
import { presetAvailability, type VoicePreset } from "../../../../shared/voice-presets";
import { usePagingSentinel } from "../../media-gallery/usePagingSentinel";
import { type AudioListView, audioDialogViews } from "../gallery/audioGalleryView";
import { audioListOptions } from "../gallery/queries";
import { RecordingCard } from "../gallery/RecordingCard";
import { SPEECH_PATH } from "../gallery/reuse";
import { settingsLabels } from "../gallery/settingsLabels";
import { SPEECH_MODELS_KEY } from "../queryKeys";
import { voiceDot, voiceLabel } from "../VoiceSelect";
import { DeletePresetDialog, RenamePresetDialog } from "./PresetDialogs";
import { retiredText } from "./PresetSelect";
import { presetCostText, presetCountText, presetLastUsedText } from "./presetCost";
import { presetPath, useVoicePreset, useVoicePresets, VOICES_PATH, voicesNotice } from "./queries";

/** The preset an address shows: its own page, or the page behind a recording dialog opened from it (ADR-0059). */
function presetOfRoute(route: Route): string | undefined {
  if (route.name === "page") {
    const m = /^\/audio\/voices\/([^/]+)\/?$/.exec(route.pathname);
    return m?.[1] ? decodeURIComponent(m[1]) : undefined;
  }
  if (route.name === "recording" && isDialogVisit(route)) {
    const grid = audioDialogViews(route.state).grid;
    return grid?.kind === "preset" ? grid.presetId : undefined;
  }
  return undefined;
}

/** The Voices section: the list (SCR-04) or one preset's page (SCR-05). */
export function VoicesPage() {
  const id = presetOfRoute(useRoute());
  return id ? <PresetPage key={id} id={id} /> : <VoicesList />;
}

/** The speech models, read like the Speech page reads them (one cached list, ADR-0045). */
const useSpeechModels = () =>
  useQuery({ queryKey: SPEECH_MODELS_KEY, queryFn: api.speechModels, staleTime: 10 * 60_000, retry: false });

const applyPath = (id: string) => `${SPEECH_PATH}?${new URLSearchParams({ preset: id }).toString()}`;

function Settings({ p }: { p: VoicePreset }) {
  const labels = settingsLabels(p.settings);
  if (labels.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Settings">
      {labels.map((l) => (
        <li key={l}>
          <Badge variant="outline" className="font-normal">
            {l}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function ApplyButton({ p, models }: { p: VoicePreset; models: SpeechModel[] | undefined }) {
  const failedModels = useSpeechModels().isError;
  const state = presetAvailability(p, models);
  // No model list: «loading», or — when it failed — say so on the button (review R4).
  const why =
    state === "retired"
      ? retiredText(p)
      : state === "loading" && failedModels
        ? "Couldn't load the speech models."
        : null;
  const button = (
    <Button size="sm" disabled={state !== "ok"} onClick={() => navigate(applyPath(p.id))}>
      Apply
    </Button>
  );
  if (!why) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{why}</TooltipContent>
    </Tooltip>
  );
}

function SetupLine({ p, models }: { p: VoicePreset; models: SpeechModel[] | undefined }) {
  const name = models?.find((m) => m.id === p.model)?.name ?? p.modelName;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm">
      <span className={cn("size-2.5 shrink-0 rounded-full", voiceDot(p.voice))} aria-hidden />
      <span className="truncate">
        {voiceLabel(p.voice)} · {name}
      </span>
    </span>
  );
}

/** SCR-04 card — name (to its page), voice · model, settings, count · total, last use, Apply, Rename / Delete. */
function PresetCard(props: {
  p: VoicePreset;
  models: SpeechModel[] | undefined;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { p, models } = props;
  return (
    <Card data-preset-id={p.id} className="gap-3 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium">
          <Link to={presetPath(p.id)} className="break-words hover:underline">
            {p.name}
          </Link>
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${p.name}`}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={props.onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onDelete}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {presetAvailability(p, models) === "retired" && (
        <Badge variant="outline" className="self-start">
          No longer offered
        </Badge>
      )}
      <SetupLine p={p} models={models} />
      <Settings p={p} />
      <p className="text-sm tabular-nums">
        {presetCountText(p.stats.recordings)} · {presetCostText(p.stats)}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{presetLastUsedText(p.stats)}</span>
        <ApplyButton p={p} models={models} />
      </div>
    </Card>
  );
}

function Failure({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <p className="text-sm">{text}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** SCR-04 — every preset by name (AC-11). */
function VoicesList() {
  const q = useVoicePresets();
  const models = useSpeechModels().data?.models;
  const [renaming, setRenaming] = useState<VoicePreset | undefined>();
  const [deleting, setDeleting] = useState<VoicePreset | undefined>();
  // «Voice deleted.» once, after a deletion from a preset's page; the flag leaves the address at once.
  const [justDeleted] = useState(() => new URLSearchParams(window.location.search).has("deleted"));
  useEffect(() => {
    if (justDeleted) replace(VOICES_PATH);
  }, [justDeleted]);

  let body: ReactNode;
  if (q.isPending) body = <p className="text-muted-foreground text-sm">Loading…</p>;
  else if (q.isError && !q.data) body = <Failure text="Couldn't load your voices." onRetry={() => q.refetch()} />;
  else if (q.data.presets.length === 0)
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">No voice presets yet.</p>
        <Button asChild>
          <Link to={SPEECH_PATH}>Go to Speech</Link>
        </Button>
      </div>
    );
  else
    body = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {q.data.presets.map((p) => (
          <PresetCard
            key={p.id}
            p={p}
            models={models}
            onRename={() => setRenaming(p)}
            onDelete={() => setDeleting(p)}
          />
        ))}
      </div>
    );
  return (
    <section aria-label="Voices" className="flex flex-col gap-4">
      <h2 className="font-semibold">Voices</h2>
      {justDeleted && <p className="text-muted-foreground text-sm">Voice deleted.</p>}
      {body}
      <RenamePresetDialog preset={renaming} onClose={() => setRenaming(undefined)} />
      <DeletePresetDialog preset={deleting} onClose={() => setDeleting(undefined)} />
    </section>
  );
}

/** SCR-05 — one preset with the grid of its recordings; a card opens the recording dialog over it (AC-13). */
function PresetPage({ id }: { id: string }) {
  const q = useVoicePreset(id);
  const models = useSpeechModels().data?.models;
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const back = (
    <Button variant="link" asChild className="self-start px-0">
      <Link to={VOICES_PATH}>
        <ArrowLeft aria-hidden /> Voices
      </Link>
    </Button>
  );
  let body: ReactNode;
  if (q.isPending) body = <p className="text-muted-foreground text-sm">Loading…</p>;
  else if (q.isError && q.error instanceof ApiError && q.error.status === 404)
    body = (
      <div className="flex flex-col items-start gap-3">
        <p>This voice no longer exists.</p>
        <Button variant="outline" asChild>
          <Link to={VOICES_PATH}>Back to Voices</Link>
        </Button>
      </div>
    );
  else if (q.isError && !q.data) body = <Failure text="Couldn't load this voice." onRetry={() => q.refetch()} />;
  else {
    const p = q.data;
    body = (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="break-words font-semibold text-xl">{p.name}</h2>
            {presetAvailability(p, models) === "retired" && (
              <Badge variant="outline" className="self-start">
                No longer offered
              </Badge>
            )}
            <SetupLine p={p} models={models} />
            <Settings p={p} />
            <p className="text-sm tabular-nums">
              {presetCountText(p.stats.recordings)} · {presetCostText(p.stats)} · {presetLastUsedText(p.stats)}
            </p>
          </div>
          <div className="flex gap-2">
            <ApplyButton p={p} models={models} />
            <Button size="sm" variant="outline" onClick={() => setDialog("rename")}>
              Rename
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("delete")}>
              Delete
            </Button>
          </div>
        </div>
        <PresetGrid preset={p} models={models} />
        <RenamePresetDialog preset={dialog === "rename" ? p : undefined} onClose={() => setDialog(null)} />
        <DeletePresetDialog
          preset={dialog === "delete" ? p : undefined}
          onClose={() => setDialog(null)}
          onDeleted={() => replace(`${VOICES_PATH}?deleted=1`)}
        />
      </>
    );
  }
  return (
    <section aria-label="Voice" className="flex flex-col gap-4">
      {back}
      {body}
    </section>
  );
}

/** The preset's recordings, newest first, with the audio gallery's cards and paging. */
function PresetGrid({ preset, models }: { preset: VoicePreset; models: SpeechModel[] | undefined }) {
  const view: AudioListView = { kind: "preset", presetId: preset.id };
  const q = useInfiniteQuery(audioListOptions(view));
  const paused = isDialogVisit(useRoute());
  const handedOver = voicesNotice.useShown(); // the dialog closed after a delete
  useEffect(() => voicesNotice.clear, []);
  useEffect(() => {
    if (paused) voicesNotice.clear();
  }, [paused]);
  const notice = handedOver && <p className="text-muted-foreground text-sm">Recording deleted.</p>;
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = q;
  const { sentinelRef } = usePagingSentinel({
    ready: q.data !== undefined,
    paused,
    hasNextPage,
    isFetching: q.isFetching,
    isFetchNextPageError,
    fetchNextPage,
  });
  if (q.isPending) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (q.isError && !q.data) return <Failure text="Couldn't load this voice." onRetry={() => q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (items.length === 0)
    return (
      <div className="flex flex-col items-start gap-3">
        {notice}
        <p className="text-muted-foreground">No recordings with this voice yet.</p>
        <ApplyButton p={preset} models={models} />
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      {notice}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {items.map((r) => (
          <RecordingCard key={r.id} r={r} views={{ grid: view, order: view }} gallery="voices" />
        ))}
      </div>
      {isFetchNextPageError && (
        <div className="flex items-center gap-3 self-center text-sm">
          <p className="text-destructive">Couldn't load more.</p>
          <Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => fetchNextPage()}>
            Try again
          </Button>
        </div>
      )}
      {hasNextPage ? (
        <>
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {!isFetchNextPageError && (
            <div className="flex items-center justify-center gap-3">
              {isFetchingNextPage && (
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading more…
                </span>
              )}
              <Button variant="outline" disabled={q.isFetching} onClick={() => fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-center text-muted-foreground text-sm">That's everything</p>
      )}
    </div>
  );
}
