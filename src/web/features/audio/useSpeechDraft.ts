import { useState } from "react";
import { billedChars, type Recording, type SpeechModel, settingsFor, type VoiceSettings } from "../../../shared/speech";

export type Draft = ReturnType<typeof useSpeechDraft>;

/**
 * The Speech form's state — text, model, voice, settings — kept for as long as the page is mounted (ADR-0045).
 * One settings bag for every model (no per-model memory): what is shown and sent is always the current model's
 * accepted subset, shared values brought into its range (spec AC-08).
 */
export function useSpeechDraft(models: SpeechModel[] | undefined) {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState("");
  const [chosenVoice, setChosenVoice] = useState<string | null | undefined>(undefined);
  const [raw, setRaw] = useState<VoiceSettings>({});
  const [notice, setNotice] = useState<string | null>(null);

  const model = models?.find((m) => m.id === modelId) ?? models?.[0];
  /** The voice kept if the model offers it, else its first voice, else the provider default (spec AC-08). */
  const voice: string | null = (() => {
    if (!model) return null;
    if (model.voices.length === 0) return model.voiceMode === "optional" ? (chosenVoice ?? null) : null;
    if (chosenVoice !== undefined && chosenVoice !== null && model.voices.includes(chosenVoice)) return chosenVoice;
    if (chosenVoice === null && model.voiceMode === "optional") return null;
    return model.voices[0] ?? null;
  })();
  const settings = model ? settingsFor(model.controls, raw) : {};
  const chars = billedChars(text);

  return {
    text,
    setText,
    model,
    /** A voice the new model doesn't offer is dropped; settings are brought into its range (spec AC-08). */
    selectModel: (id: string) => {
      const next = models?.find((m) => m.id === id);
      setModelId(id);
      setNotice(null);
      if (!next) return;
      if (next.voices.length === 0 || (chosenVoice && !next.voices.includes(chosenVoice))) setChosenVoice(undefined);
      setRaw((prev) => settingsFor(next.controls, prev));
    },
    voice,
    setVoice: setChosenVoice,
    settings,
    setSettings: setRaw,
    chars,
    tooLong: model ? chars > model.maxChars : false,
    notice,
    /** Puts a recording back into the form; a retired model keeps the current one (spec AC-15). */
    reuse(r: Recording) {
      setText(r.text);
      setChosenVoice(r.voice);
      setRaw(r.settings);
      const offered = models?.some((m) => m.id === r.model);
      if (offered) {
        setModelId(r.model);
        setNotice(null);
      } else setNotice(`${r.modelName} is no longer offered — kept ${model?.name ?? "the current model"}`);
    },
  };
}
