import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { defaultSettings, type VoiceSettings } from "../../../shared/speech";
import type { Control } from "../../../shared/speech-models";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const nearestIndex = (v: number, steps: readonly number[]) =>
  steps.reduce((best, s, i) => (Math.abs(s - v) < Math.abs((steps[best] ?? 0) - v) ? i : best), 0);

/**
 * SCR-02 «Voice adjustment» — the chosen model's controls rendered from its descriptors (slider / steps / switch /
 * text), each with its own range and default (spec AC-07, AC-08). «Reset values» restores the model's defaults.
 */
export function VoiceControls(props: {
  /** Prefix for element ids — the page renders the controls in two panels (review R12). */
  idPrefix?: string;
  controls: readonly Control[];
  settings: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
}) {
  const { controls, settings } = props;
  if (controls.length === 0)
    return <p className="text-muted-foreground text-sm">No adjustable settings for this model</p>;
  const set = (patch: VoiceSettings) => props.onChange({ ...settings, ...patch });
  const value = (c: Control) => settings[c.key] ?? c.default;
  return (
    <div className="space-y-5">
      {controls.map((c) => {
        if (c.kind === "switch")
          return (
            <Label key={c.key} className="gap-2">
              <Switch
                aria-label={c.label}
                checked={Boolean(value(c))}
                onCheckedChange={(on) => set({ [c.key]: on } as VoiceSettings)}
              />
              {c.label}
            </Label>
          );
        if (c.kind === "text")
          return (
            <div key={c.key} className="space-y-2">
              <Label htmlFor={`${props.idPrefix ?? "speech"}-${c.key}`}>{c.label}</Label>
              <Textarea
                id={`${props.idPrefix ?? "speech"}-${c.key}`}
                aria-label={c.label}
                value={String(value(c))}
                maxLength={c.maxLength}
                placeholder="e.g. warm, slow, a little amused"
                onChange={(e) => set({ [c.key]: e.target.value } as VoiceSettings)}
                className="min-h-16"
              />
            </div>
          );
        const n = Number(value(c));
        if (c.kind === "steps") {
          const steps = c.steps ?? [];
          const i = nearestIndex(n, steps);
          const label = c.stepLabels?.[i] ?? String(steps[i]);
          return (
            <Row key={c.key} control={c} display={label}>
              <Slider
                value={[i]}
                min={0}
                max={Math.max(0, steps.length - 1)}
                step={1}
                thumbProps={{ "aria-label": c.label, "aria-valuetext": label }}
                onValueChange={([k]) => k !== undefined && set({ [c.key]: steps[k] } as VoiceSettings)}
              />
            </Row>
          );
        }
        return (
          <Row key={c.key} control={c} display={pct(n)}>
            <Slider
              value={[n]}
              min={c.min}
              max={c.max}
              step={c.step}
              thumbProps={{ "aria-label": c.label, "aria-valuetext": pct(n) }}
              onValueChange={([v]) => v !== undefined && set({ [c.key]: v } as VoiceSettings)}
            />
          </Row>
        );
      })}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => props.onChange(defaultSettings(controls))}>
          <RotateCcw />
          Reset values
        </Button>
      </div>
    </div>
  );
}

function Row(props: { control: Control; display: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{props.control.label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{props.display}</span>
      </div>
      {props.children}
      <div className="flex justify-between text-muted-foreground text-xs">
        <span>{props.control.lowLabel}</span>
        <span>{props.control.highLabel}</span>
      </div>
    </div>
  );
}
