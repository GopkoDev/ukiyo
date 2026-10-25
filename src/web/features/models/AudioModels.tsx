import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, StarIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ModelPreference } from "../../../shared/models";
import type { SpeechModel } from "../../../shared/speech";
import { limitText } from "../audio/ModelSelect";
import { SPEECH_MODELS_KEY } from "../audio/queryKeys";
import { priceText } from "../audio/speechCost";
import { useProviders } from "../balances/balances";
import { type SetPreferenceVars, useModelPreferences, useSetModelPreference } from "./preferences";

const NONE = "—";

/** «12 voices», «1 voice», or «provider default» for a model without named voices (spec AC-01). */
export const voicesText = (m: Pick<SpeechModel, "voices">) =>
  m.voices.length === 0 ? "provider default" : `${m.voices.length} voice${m.voices.length === 1 ? "" : "s"}`;

/** The voice settings a model accepts by name, e.g. «speed, stability», or «—». */
export const controlsText = (m: Pick<SpeechModel, "controls">) =>
  m.controls.length === 0 ? NONE : m.controls.map((c) => c.label.toLowerCase()).join(", ");

/** The speech catalog — the Speech page's cache entry (same key and freshness, so no extra read). */
export const useSpeechModels = (enabled = true) =>
  useQuery({ queryKey: SPEECH_MODELS_KEY, queryFn: api.speechModels, staleTime: 10 * 60_000, retry: false, enabled });

const mark = (set: ReadonlySet<string>, key: string, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
};

/** SCR-02 — every OpenRouter speech model with price, limit, voices, controls and the ★ / «Show in picker» toggles. */
export function AudioModels() {
  const providers = useProviders();
  const openRouter = providers.data?.providers.find((p) => p.id === "openrouter");
  const configured = openRouter?.configured === true;
  const models = useSpeechModels(configured || providers.isError); // no read until OpenRouter is known configured
  const prefsQuery = useModelPreferences("openrouter", configured, "speech");
  // A failed providers read leaves the preferences unknown: same as unreadable ones (review R9).
  const prefsUnreadable = prefsQuery.isError || providers.isError;
  const prefs = prefsUnreadable ? null : (prefsQuery.data?.preferences ?? null);
  const flags = new Map((prefs ?? []).map((p) => [p.model, p]));

  const [saveFailed, setSaveFailed] = useState<ReadonlySet<string>>(new Set());
  const [forgetFailed, setForgetFailed] = useState<ReadonlySet<string>>(new Set());
  const [forgetting, setForgetting] = useState<ReadonlySet<string>>(new Set());
  const isForget = (v: SetPreferenceVars) => v.favorite === false && v.hidden === false;
  const toggle = useSetModelPreference(
    "openrouter",
    {
      onSuccess: (_saved, v) => {
        if (!isForget(v)) setSaveFailed((s) => mark(s, v.model, false));
      },
      onError: (_error, v) => {
        if (isForget(v)) setForgetFailed((s) => mark(s, v.model, true));
        else setSaveFailed((s) => mark(s, v.model, true));
      },
      onSettled: (v) => {
        if (isForget(v)) setForgetting((s) => mark(s, v.model, false));
      },
    },
    "speech",
  );
  const forget = (model: string) => {
    setForgetting((s) => mark(s, model, true));
    setForgetFailed((s) => mark(s, model, false));
    toggle.mutate({ model, favorite: false, hidden: false });
  };

  const list = models.data?.models;
  let body: React.ReactNode;
  if (providers.isPending) body = <p className="text-muted-foreground text-sm">Loading…</p>;
  else if (openRouter && !configured)
    body = <p className="text-muted-foreground text-sm">OpenRouter isn't configured — add its key to .env.local.</p>;
  else if (models.isPending) body = <p className="text-muted-foreground text-sm">Loading speech models…</p>;
  else if (!list)
    body = (
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
        <p>Couldn't load the speech models.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => models.refetch()}>
          Try again
        </Button>
      </div>
    );
  else if (list.length === 0) body = <p className="text-muted-foreground text-sm">No speech models.</p>;
  else {
    const offered = new Set(list.map((m) => m.id));
    // Built only from a list that loaded and preferences that could be read (spec AC-06, AC-08).
    const retired: ModelPreference[] = prefs
      ? prefs.filter((p) => !offered.has(p.model) && (p.favorite || p.hidden))
      : [];
    body = (
      <>
        {prefsUnreadable && (
          <p className="mb-2 text-muted-foreground text-sm">Favorites and hidden models couldn't be loaded.</p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Maker</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Character limit</TableHead>
              <TableHead>Voices</TableHead>
              <TableHead>Controls</TableHead>
              <TableHead>
                <span className="sr-only">Favorite</span>
              </TableHead>
              <TableHead>Show in picker</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((model) => {
              const f = flags.get(model.id);
              const favorite = f?.favorite ?? false;
              const hidden = f?.hidden ?? false;
              return (
                <TableRow key={model.id} data-model={model.id} className={cn(hidden && "text-muted-foreground")}>
                  <TableCell className="max-w-72">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      {hidden && <Badge variant="outline">Hidden</Badge>}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">{model.id}</div>
                    {saveFailed.has(model.id) && (
                      <p role="alert" className="text-destructive text-xs">
                        Couldn't save — try again.
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{model.maker}</TableCell>
                  <TableCell className="text-muted-foreground">{priceText(model.price)}</TableCell>
                  <TableCell>{limitText(model)}</TableCell>
                  <TableCell>{voicesText(model)}</TableCell>
                  <TableCell className="max-w-56 whitespace-normal">{controlsText(model)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Favorite ${model.name}`}
                      aria-pressed={favorite}
                      disabled={prefs === null}
                      onClick={() => toggle.mutate({ model: model.id, favorite: !favorite })}
                    >
                      <StarIcon className={cn("size-4", favorite && "fill-current")} aria-hidden />
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Show ${model.name} in picker`}
                      checked={!hidden}
                      disabled={prefs === null}
                      onCheckedChange={() => toggle.mutate({ model: model.id, hidden: !hidden })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {retired.length > 0 && (
          <div className="mt-4">
            <h4 className="text-muted-foreground text-sm">No longer offered</h4>
            <ul className="mt-1 flex flex-col gap-1">
              {retired.map((p) => (
                <li key={p.model} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{p.model}</span>
                  {p.favorite && <Badge variant="outline">Favorite</Badge>}
                  {p.hidden && <Badge variant="outline">Hidden</Badge>}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={forgetting.has(p.model)}
                    onClick={() => forget(p.model)}
                  >
                    {forgetting.has(p.model) && <Loader2Icon className="animate-spin" aria-hidden />}
                    Forget
                  </Button>
                  {forgetFailed.has(p.model) && (
                    <span role="alert" className="text-destructive text-xs">
                      Couldn't forget — try again.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }

  const count = list ? ` · ${list.length} speech ${list.length === 1 ? "model" : "models"}` : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          OpenRouter
          {count}
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
