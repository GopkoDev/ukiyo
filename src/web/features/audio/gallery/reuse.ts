import { navigate, replace } from "@/lib/router";

export const SPEECH_PATH = "/audio/speech";

/**
 * Reuse a recording on the Speech page (ADR-0053): `/audio/speech?reuse=<id>`, applied there on arrival. From the
 * dialog or the recording page the history entry is replaced, so Back from Speech returns to the gallery (AC-16).
 */
export function reuseRecording(id: string, from: "card" | "dialog" | "page") {
  const to = `${SPEECH_PATH}?${new URLSearchParams({ reuse: id }).toString()}`;
  if (from === "card") navigate(to);
  else replace(to);
}
