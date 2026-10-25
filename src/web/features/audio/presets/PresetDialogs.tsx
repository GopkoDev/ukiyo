import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { checkPresetName, MAX_PRESET_NAME, type PresetSetup, type VoicePreset } from "../../../../shared/voice-presets";
import { presetChanged, presetDeleted } from "./queries";

const SAVE_FAILED = "Couldn't save — try again.";

/** The server's field message for the name, else the generic failure (spec AC-02). */
function failureOf(err: unknown): { field?: string; form?: string } {
  if (err instanceof ApiError && err.code === "VALIDATION_ERROR") {
    const name = (err.details?.fields as Record<string, unknown> | undefined)?.name;
    if (typeof name === "string") return { field: name };
  }
  return { form: SAVE_FAILED };
}

/** The name field with its rules checked before sending; shared by Save and Rename (SCR-02, SCR-03). */
function NameForm(props: {
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.initial);
  const [field, setField] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const send = useMutation({ mutationFn: (n: string) => props.onSubmit(n) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (send.isPending) return;
    const checked = checkPresetName(name);
    setForm(null);
    if (!checked.ok) {
      setField(checked.message);
      return;
    }
    setField(null);
    send.mutate(checked.name, {
      onError: (err) => {
        const f = failureOf(err);
        setField(f.field ?? null);
        setForm(f.form ?? null);
      },
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="preset-name">Name</Label>
        <Input
          id="preset-name"
          value={name}
          maxLength={MAX_PRESET_NAME * 4}
          autoFocus
          aria-invalid={field ? true : undefined}
          aria-describedby={field ? "preset-name-error" : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {field && (
          <p id="preset-name-error" className="text-destructive text-xs">
            {field}
          </p>
        )}
      </div>
      {form && (
        <p role="alert" className="text-destructive text-sm">
          {form}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={send.isPending}>
          {send.isPending && <Loader2 className="animate-spin" />}
          {props.submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * SCR-02 — save the current setup as a new preset, or (when `applied` is modified) choose «Update «name»» or
 * «Save as new» (spec AC-01, AC-02, AC-06). `onSaved` gets the preset to apply.
 */
export function SavePresetDialog(props: {
  open: boolean;
  onClose: () => void;
  setup: PresetSetup;
  suggestion: string;
  /** The applied preset the setup was changed from, if any. */
  applied: VoicePreset | undefined;
  onSaved: (p: VoicePreset) => void;
}) {
  const qc = useQueryClient();
  const [asNew, setAsNew] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (props.open) {
      setAsNew(false);
      setFailed(false);
    }
  }, [props.open]);
  const update = useMutation({
    mutationFn: (id: string) => api.updateVoicePreset(id, props.setup),
    onSuccess: (p) => {
      presetChanged(qc, p, false);
      props.onSaved(p);
      props.onClose();
    },
    onError: () => setFailed(true),
  });
  const create = async (name: string) => {
    const p = await api.createVoicePreset({ name, ...props.setup });
    presetChanged(qc, p, false);
    props.onSaved(p);
    props.onClose();
  };
  const choosing = props.applied !== undefined && !asNew;
  return (
    <Dialog open={props.open} onOpenChange={(next) => !next && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save voice preset</DialogTitle>
          <DialogDescription>
            {choosing
              ? "This voice preset was changed. Update it, or keep it and save a new one."
              : "Saves the model, voice and settings — not the text."}
          </DialogDescription>
        </DialogHeader>
        {choosing && props.applied ? (
          <div className="flex flex-col gap-3">
            {failed && (
              <p role="alert" className="text-destructive text-sm">
                {SAVE_FAILED}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAsNew(true)}>
                Save as new
              </Button>
              <Button disabled={update.isPending} onClick={() => props.applied && update.mutate(props.applied.id)}>
                {update.isPending && <Loader2 className="animate-spin" />}
                Update «{props.applied.name}»
              </Button>
            </DialogFooter>
          </div>
        ) : (
          props.open && (
            <NameForm initial={props.suggestion} submitLabel="Save" onSubmit={create} onCancel={props.onClose} />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

/** SCR-03 — rename a preset; a case-only change of its own name is valid (spec AC-02, AC-07). */
export function RenamePresetDialog(props: {
  preset: VoicePreset | undefined;
  onClose: () => void;
  onRenamed?: (p: VoicePreset) => void;
}) {
  const qc = useQueryClient();
  const p = props.preset;
  return (
    <Dialog open={p !== undefined} onOpenChange={(next) => !next && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename voice</DialogTitle>
          <DialogDescription>Recordings made with it show the new name.</DialogDescription>
        </DialogHeader>
        {p && (
          <NameForm
            key={p.id}
            initial={p.name}
            submitLabel="Rename"
            onCancel={props.onClose}
            onSubmit={async (name) => {
              const renamed = await api.updateVoicePreset(p.id, { name });
              presetChanged(qc, renamed, true);
              props.onRenamed?.(renamed);
              props.onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const recordingsText = (n: number) =>
  n === 0 ? "It has no recordings." : `Its ${n} recording${n === 1 ? " is" : "s are"} kept.`;

/** SCR-07 — delete a preset after confirming; its recordings stay, unlinked (spec AC-07, AC-08). */
export function DeletePresetDialog(props: {
  preset: VoicePreset | undefined;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const p = props.preset;
  const del = useMutation({
    mutationFn: (id: string) => api.deleteVoicePreset(id),
    onSuccess: (_, id) => {
      presetDeleted(qc, id);
      props.onDeleted?.(id);
      close();
    },
    onError: (err, id) => {
      if (err instanceof ApiError && err.code === "NOT_FOUND") {
        presetDeleted(qc, id);
        props.onDeleted?.(id);
        close();
      }
    },
  });
  const close = () => {
    del.reset();
    props.onClose();
  };
  return (
    <Dialog open={p !== undefined} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete «{p?.name}»?</DialogTitle>
          <DialogDescription>{p ? recordingsText(p.stats.recordings) : ""}</DialogDescription>
        </DialogHeader>
        {del.isError && !(del.error instanceof ApiError && del.error.code === "NOT_FOUND") && (
          <p role="alert" className="text-destructive text-sm">
            Couldn't delete — try again.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} autoFocus>
            Cancel
          </Button>
          <Button variant="destructive" disabled={del.isPending} onClick={() => p && del.mutate(p.id)}>
            {del.isPending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
