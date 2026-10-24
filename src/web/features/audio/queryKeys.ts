/** TanStack Query keys of the Audio section; every recordings query sits under `RECORDINGS_KEY`. */
export const RECORDINGS_KEY = ["recordings"] as const;
export const RECENT_RECORDINGS_KEY = [...RECORDINGS_KEY, "recent"] as const;
export const SPEECH_MODELS_KEY = ["speech-models"] as const;
export const SPEECH_CREDITS_KEY = ["speech-credits"] as const;
