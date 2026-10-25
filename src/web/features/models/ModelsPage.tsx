import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, StarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { navigate, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { ModelPreference } from "../../../shared/models";
import type { ImageModel, ProviderId } from "../../../shared/providers";
import { useShortPrice } from "../generate/PricePreview";
import { AudioModels } from "./AudioModels";
import { describeParams } from "./params";
import { type SetPreferenceVars, useModelPreferences, useSetModelPreference } from "./preferences";

type ProviderInfo = { id: ProviderId; name: string; configured: boolean };

function Row({
  provider,
  model,
  inView,
  favorite,
  hidden,
  togglesDisabled,
  failed,
  onFavorite,
  onShow,
}: {
  provider: ProviderId;
  model: ImageModel;
  inView: boolean;
  favorite: boolean;
  hidden: boolean;
  togglesDisabled: boolean;
  failed: boolean;
  onFavorite: () => void;
  onShow: () => void;
}) {
  const price = useShortPrice(provider, model.id, inView, { retryOnMount: true });
  const params = describeParams(model);
  return (
    <TableRow data-model={model.id} className={cn(hidden && "text-muted-foreground")}>
      <TableCell className="max-w-72">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{model.name}</span>
          {hidden && <Badge variant="outline">Hidden</Badge>}
        </div>
        <div className="truncate text-muted-foreground text-xs">{model.id}</div>
        {failed && (
          <p role="alert" className="text-destructive text-xs">
            Couldn't save — try again.
          </p>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {price?.perToken ? <Badge variant="outline">{price.text}</Badge> : (price?.text ?? "…")}
      </TableCell>
      <TableCell>{params.aspectRatios}</TableCell>
      <TableCell>{params.seed}</TableCell>
      <TableCell>{params.images}</TableCell>
      <TableCell>{params.inputs}</TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Favorite ${model.name}`}
          aria-pressed={favorite}
          disabled={togglesDisabled}
          onClick={onFavorite}
        >
          <StarIcon className={cn("size-4", favorite && "fill-current")} aria-hidden />
        </Button>
      </TableCell>
      <TableCell>
        <Switch
          aria-label={`Show ${model.name} in picker`}
          checked={!hidden}
          disabled={togglesDisabled}
          onCheckedChange={onShow}
        />
      </TableCell>
    </TableRow>
  );
}

function ProviderCard({ info }: { info: ProviderInfo }) {
  const { id, name } = info;
  const models = useQuery({
    queryKey: ["models", id],
    queryFn: () => api.models(id),
    enabled: info.configured,
  });
  const prefsQuery = useModelPreferences(id, info.configured);
  const unreadable = prefsQuery.isError;
  const prefs = unreadable ? null : (prefsQuery.data?.preferences ?? null);
  const flags = new Map((prefs ?? []).map((p) => [p.model, p]));

  const [saveFailed, setSaveFailed] = useState<ReadonlySet<string>>(new Set());
  const [forgetFailed, setForgetFailed] = useState<ReadonlySet<string>>(new Set());
  const [forgetting, setForgetting] = useState<ReadonlySet<string>>(new Set());
  const mark = (set: ReadonlySet<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };
  const isForget = (v: SetPreferenceVars) => v.favorite === false && v.hidden === false;

  // Hook-level callbacks run for every overlapping mutation (per-`mutate` ones only for the latest), keyed by model.
  const toggle = useSetModelPreference(id, {
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
  });

  const change = (model: string, flag: { favorite: boolean } | { hidden: boolean }) =>
    toggle.mutate({ model, ...flag });

  const forget = (model: string) => {
    setForgetting((s) => mark(s, model, true));
    setForgetFailed((s) => mark(s, model, false));
    toggle.mutate({ model, favorite: false, hidden: false });
  };

  // Prices only for rows that came into view (SAD §4): one observer per table, rows tracked by model id.
  const [table, setTable] = useState<HTMLTableElement | null>(null); // callback ref: re-observe whenever the table (re)mounts
  const [inView, setInView] = useState<ReadonlySet<string>>(new Set());
  const list = models.data?.models;
  // biome-ignore lint/correctness/useExhaustiveDependencies: rows are re-observed when the list changes
  useEffect(() => {
    if (!table) return;
    const observer = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).map((e) => (e.target as HTMLElement).dataset.model ?? "");
      if (seen.length > 0) setInView((s) => (seen.every((m) => s.has(m)) ? s : new Set([...s, ...seen])));
    });
    for (const row of table.querySelectorAll("tbody tr[data-model]")) observer.observe(row);
    return () => observer.disconnect();
  }, [table, list]);

  let body: React.ReactNode;
  if (!info.configured) {
    body = <p className="text-muted-foreground text-sm">{name} isn't configured — add its key to .env.local.</p>;
  } else if (models.isPending) {
    body = <p className="text-muted-foreground text-sm">Loading models…</p>;
  } else if (!list) {
    body = (
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
        <p>Couldn't load the {name} models.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => models.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (list.length === 0) {
    body = <p className="text-muted-foreground text-sm">No image models.</p>;
  } else {
    const offered = new Set(list.map((m) => m.id));
    const retired: ModelPreference[] = prefs
      ? prefs.filter((p) => !offered.has(p.model) && (p.favorite || p.hidden))
      : [];
    body = (
      <>
        {models.isError && (
          <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
            <p>Couldn't load the {name} models.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => models.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {unreadable && (
          <p className="mb-2 text-muted-foreground text-sm">Favorites and hidden models couldn't be loaded.</p>
        )}
        <Table ref={setTable}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Aspect ratios</TableHead>
              <TableHead>Seed</TableHead>
              <TableHead>Images</TableHead>
              <TableHead>Inputs</TableHead>
              <TableHead>
                <span className="sr-only">Favorite</span>
              </TableHead>
              <TableHead>Show in picker</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((model) => {
              const f = flags.get(model.id);
              return (
                <Row
                  key={model.id}
                  provider={id}
                  model={model}
                  inView={inView.has(model.id)}
                  favorite={f?.favorite ?? false}
                  hidden={f?.hidden ?? false}
                  togglesDisabled={prefs === null}
                  failed={saveFailed.has(model.id)}
                  onFavorite={() => change(model.id, { favorite: !(f?.favorite ?? false) })}
                  onShow={() => change(model.id, { hidden: !(f?.hidden ?? false) })}
                />
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

  const count = list ? ` · ${list.length} ${list.length === 1 ? "model" : "models"}` : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {name}
          {count}
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export const MODELS_PATH = "/models";
export type ModelsTab = "image" | "audio";
/** The view the address names; anything but `?tab=audio` is the Image view (spec AC-09). */
export const modelsTab = (search: string): ModelsTab =>
  new URLSearchParams(search).get("tab") === "audio" ? "audio" : "image";

/** The Models page: Image | Audio, the tab kept in the address (models-page-audio SCR-01 / SCR-02, ADR-0056). */
export function ModelsPage() {
  const route = useRoute();
  const tab = route.name === "page" ? modelsTab(route.search) : "image";
  return (
    <section aria-label="Models" className="flex flex-col gap-4">
      <h2 className="font-semibold">Models</h2>
      <Tabs
        value={tab}
        // One history entry per switch: a focus after the press reports the same value again.
        onValueChange={(v) =>
          v !== modelsTab(window.location.search) && navigate(v === "audio" ? `${MODELS_PATH}?tab=audio` : MODELS_PATH)
        }
      >
        <TabsList>
          <TabsTrigger value="image">Image</TabsTrigger>
          <TabsTrigger value="audio">Audio</TabsTrigger>
        </TabsList>
        <TabsContent value="image" className="flex flex-col gap-4">
          <ImageModels />
        </TabsContent>
        <TabsContent value="audio" className="flex flex-col gap-4">
          <AudioModels />
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** SCR-08 (step 10): every configured provider's image models with price, parameters and the ★ / «show in picker» toggles. */
function ImageModels() {
  const providers = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const list = providers.data?.providers ?? [];
  let body: React.ReactNode;
  if (providers.isPending) body = <p className="text-muted-foreground text-sm">Loading…</p>;
  else if (providers.isError)
    body = (
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-destructive/10 p-3 text-destructive text-sm">
        <p>Couldn't load the providers.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => providers.refetch()}>
          Try again
        </Button>
      </div>
    );
  else if (!list.some((p) => p.configured))
    body = (
      <p className="text-muted-foreground text-sm">
        No provider is configured yet. Add an OpenRouter or Vercel AI Gateway key to .env.local and restart Ukiyo.
      </p>
    );
  else body = list.map((p) => <ProviderCard key={p.id} info={p} />);
  return body;
}
