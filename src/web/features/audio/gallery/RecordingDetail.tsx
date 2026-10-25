import { ArrowLeft, Download, RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { excerpt, formatDateTime, formatDuration, formatUsdSig } from "@/lib/format";
import { Link, navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { Recording } from "../../../../shared/speech";
import { CostLabel } from "../CostLabel";
import { DeleteRecording } from "../DeleteRecording";
import { voiceDot, voiceLabel } from "../VoiceSelect";
import { AUDIO_GALLERY_PATH } from "./audioGalleryView";
import { useRecording } from "./queries";
import { RecordingNotes } from "./RecordingNotes";
import { reuseRecording } from "./reuse";
import { settingsLabels } from "./settingsLabels";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Player({ r }: { r: Recording }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {broken ? (
        <p className="text-muted-foreground text-sm">Audio unavailable</p>
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: generated speech has no caption track
        <audio
          key={r.id}
          controls
          preload="none"
          src={r.url}
          onError={() => setBroken(true)}
          className="w-full"
          aria-label={`Play «${excerpt(r.text, 40)}»`}
        />
      )}
      <Button variant="outline" size="sm" asChild className="self-start">
        <a href={`${r.url}?download=1`} download>
          <Download aria-hidden />
          Download
        </a>
      </Button>
    </div>
  );
}

/** SCR-04 / SCR-05 body — `dialog` splits it into the player + text and the metadata columns. */
export function RecordingBody({ r, layout }: { r: Recording; layout: "dialog" | "page" }) {
  const labels = settingsLabels({ ...r.settings, instructions: undefined });
  const actions = (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => reuseRecording(r.id, layout)}>
        <RotateCcw aria-hidden /> Reuse
      </Button>
      <DeleteRecording
        recording={r}
        variant="button"
        onDeleted={layout === "page" ? () => navigate(`${AUDIO_GALLERY_PATH}?deleted=1`) : undefined}
      />
    </div>
  );
  const details = (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
          <Row label="Model">{r.modelName}</Row>
          <Row label="Voice">
            <span className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", voiceDot(r.voice))} aria-hidden />
              {voiceLabel(r.voice)}
            </span>
          </Row>
          <Row label="Settings">{labels.length ? labels.join(" · ") : "none"}</Row>
          {r.settings.instructions && (
            <Row label="Instructions">
              <span className="whitespace-pre-wrap">{r.settings.instructions}</span>
            </Row>
          )}
          <Row label="Created">{formatDateTime(r.createdAt)}</Row>
          <Row label="Duration">{r.durationMs === null ? "not recorded" : formatDuration(r.durationMs)}</Row>
          <Row label="Characters">{r.characters}</Row>
          <Row label="File type">{r.mediaType === "audio/wav" ? "WAV" : "MP3"}</Row>
          <Row label="Cost">
            <span className="flex flex-wrap items-center gap-2">
              <CostLabel {...r} />
              <Badge variant={r.costStatus === "known" ? "secondary" : "outline"}>{r.costStatus}</Badge>
            </span>
          </Row>
          {r.estimateMicros !== null && (
            <Row label="Estimate">≈ {formatUsdSig(r.estimateMicros / 1_000_000)} (before generating)</Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
  const text = <p className="select-text whitespace-pre-wrap break-words text-base">{r.text}</p>;
  if (layout === "dialog")
    return (
      <div className="grid gap-6 lg:h-full lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4 lg:overflow-y-auto">
          <Player r={r} />
          {text}
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:overflow-y-auto">
          {actions}
          <RecordingNotes r={r} />
          {details}
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      {actions}
      <Player r={r} />
      {text}
      <RecordingNotes r={r} />
      {details}
    </div>
  );
}

/** SCR-05 — one recording on its own page (a direct visit), with a way back to the gallery. */
export function RecordingPage({ id }: { id: string }) {
  const q = useRecording(id);
  let body: ReactNode;
  if (q.isPending) body = <p className="text-muted-foreground text-sm">Loading…</p>;
  else if (q.isError && q.error instanceof ApiError && q.error.status === 404)
    body = <p>This recording no longer exists.</p>;
  else if (q.isError)
    body = (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm">Couldn't load this recording</p>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          Try again
        </Button>
      </div>
    );
  else body = <RecordingBody r={q.data} layout="page" />;
  return (
    <div className="flex flex-col gap-4">
      <Button variant="link" asChild className="self-start px-0">
        <Link to={AUDIO_GALLERY_PATH}>
          <ArrowLeft aria-hidden /> Gallery
        </Link>
      </Button>
      {body}
    </div>
  );
}
