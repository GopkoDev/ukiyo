---
id: T2
title: "Add the speech family spec map and the shared speech DTOs"
layer: "domain"
deps: []
blocks: ["T3", "T7", "T11", "T12"]
acs: ["AC-07", "AC-08", "AC-09", "AC-11", "AC-12"]
files_hint: ["src/shared/speech-models.ts", "src/shared/speech-models.test.ts", "src/shared/speech.ts", "src/shared/speech.test.ts"]
owner: "pipeline agent (implement)"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T2 — Add the speech family spec map and the shared speech DTOs

## Place in the sequence

- **Blocked by:** — · **Blocks:** T3 — Build the SpeechProvider port and the OpenRouter speech adapter · T7 — Write the recordings repo over the rebuilt table · T11 — Show speech prices, estimates and recording costs honestly · T12 — Build ModelSelect, VoiceSelect and descriptor-driven VoiceControls · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to see only the controls the chosen model accepts (for example speed, stability or delivery instructions)
> **So that** every setting I change actually affects the result
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers: unit tests prove family matching, control descriptors, settingsFor clamping, limit precedence, pricing unit, billedChars and the estimate.

## Inlined context

> **ADR-0040 decision:** A family spec map in `src/shared/speech-models.ts` — entries matched by id prefix, with optional per-id overrides. Each declares the controls (kind, range, step, default), `maxChars`, the output format (`mp3` | `pcm`), whether voice is required or optional, the pricing-unit label for completion-priced models, and how each control maps onto the wire. Unmatched models get `{ controls: [], voice: required-if-listed, format: mp3 }`.
>
> — `adr/0040, Option 1, verbatim`

> **Family facts (OpenRouter docs + live catalog 2026-10-25):** ElevenLabs: per-id limits/controls as the prototype `SPEECH_MODEL_SPECS` (v4 10 000 stability+similarity; v3 5 000 stability steps 0/0.5/1 + similarity + style; multilingual-v2 10 000 all five; flash-v2.5 40 000 / flash-v2 30 000 speed+stability+similarity+speakerBoost; turbo-v2.5 40 000 / turbo-v2 30 000 stability+similarity+speakerBoost), wire `provider.options.elevenlabs.voice_settings` (stability, similarity_boost, style, use_speaker_boost), speed top-level. `instructions` honoured by OpenAI gpt-4o-mini-tts, Gemini TTS (`google/gemini-*-tts*`), Fish Audio (`fish-audio/`). `speed` honoured by OpenAI TTS (0.25–4) and ByteDance Seed (0.5–2.0, limit 3 000 chars). PCM only: `heygen/`, `google/gemini-`. mp3 only: `minimax/`, `mistralai/voxtral`. No voices listed (voice optional): `fish-audio/`, `bytedance-seed/`. Pricing: `pricing.completion > 0` → per-output («per second of audio» for bytedance-seed, «per token» for google); else `pricing.prompt` → per-character (0 → free); missing → unknown.
>
> — `sad.md §2 Technical + scratchpad catalog read, abridged`

> **Billed characters:** `billedChars(text) = [...text.trim()].length` (code points of the trimmed text), one function in `src/shared/…` used by the counter, the server check, the estimate and the stored count
>
> — `sad.md §8, Billed characters, verbatim`

> **Display of amounts:** two significant digits; a non-zero amount below $0.0001 shows «< $0.0001»; 0 shows «Free» only for a published zero price
>
> — `sad.md §8, Display of amounts, abridged`

> **Contract shapes:** SpeechModel {id, name, maker, maxChars, maxCharsSource: family|catalog|default, voiceMode: required|optional, voices[], price {unit: per-character|per-output|free|unknown, usdPerChar?, outputLabel?}, controls: Control[] {key, kind: slider|steps|switch|text, label, min,max,step, steps, stepLabels, default, lowLabel, highLabel, maxLength}}; VoiceSettings {speed, stability, similarity, style, speakerBoost, instructions ≤1000}; StartSpeechRequest {text 1–40000 trimmed, model, voice: string|null, settings}; Recording {id, createdAt, provider, model, modelName, voice|null, text, settings, mediaType audio/mpeg|audio/wav, characters, costMicros|null, costStatus, estimateMicros|null, durationMs|null, url}; RecordingPage {items, nextCursor}; CreditsResponse {remainingUsd}|null.
>
> — `contracts/openapi.yaml components.schemas, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Shared zod schemas for every `components.schemas` entry of `contracts/openapi.yaml` (SpeechModel, SpeechModelsResponse, Control, SpeechPrice, VoiceSettings, StartSpeechRequest, Recording, RecordingPage, CreditsResponse). New file `src/shared/speech.ts` — the prototype's `src/shared/audio.ts` stays untouched until T13 deletes it (it still compiles the prototype).

## Acceptance criteria

### AC-07 — happy path

> **Given** the Owner chooses a model
> **When** the controls are shown
> **Then** only the controls that model accepts appear, each with its own range and default. For example: ElevenLabs models show stability, similarity and, where the model supports them, style, speaker boost and speed; models that take delivery instructions show a free-text «delivery instructions» field; models that honour speed show a speed control. The voice list is that model's own voices. Each model's price and character limit are shown next to it in the model list. The list is grouped by the model's maker, ElevenLabs first and the others in alphabetical order, with each group in catalog order. When a model offers more than 20 voices, the voice list can be filtered by typing. Delivery instructions take up to 1 000 characters, and they are not billed characters.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** the Owner changes a control and then switches to a model that doesn't accept it
> **When** the Owner generates
> **Then** only the new model's accepted settings are sent and recorded, and a setting the model ignores is never shown as applied. The text is kept. The voice is kept if the new model offers it; otherwise the model's first listed voice is selected, or «provider default» when it lists none. A control that both models accept keeps its value, brought into the new model's range when it is outside it. Ukiyo does not remember separate values per model. «Reset values» restores the current model's defaults for the voice controls and the delivery instructions, and leaves the voice and the text as they are.
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a catalog model Ukiyo has no specific knowledge of, or a model whose catalog entry lists no voices
> **When** the Owner chooses it
> **Then** it stays usable. An unknown model offers the voice and the text only. A model without listed voices lets the Owner either use the provider's default voice or type a voice name, and the recording names the voice that was asked for («provider default» when none was). A model's character limit comes from what Ukiyo knows about its family. Otherwise it comes from the limit the catalog states for it. When neither gives one, a default of 5 000 characters applies, labelled «limit not published». Text over the limit is refused before sending and never cut short. Ukiyo never hides a catalog model because it doesn't know its controls.
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy path

> **Given** the chosen model has a published price per character
> **When** the Owner types
> **Then** next to the generate action, the page shows an estimate labelled as an estimate («≈ $0.0012»), computed from the billed characters × the published price. Billed characters are the text's Unicode code points after removing spaces and line breaks at its start and end, which is the text as it is sent. Inline delivery tags are included. An emoji built from several code points counts as several, as the providers bill it. The counter, the refusal (AC-04), the estimate and the recorded count all use this one rule. Amounts show two significant digits («≈ $0.0012», «≈ $0.72»). A non-zero amount below $0.0001 shows as «< $0.0001», never as $0. The same rule applies to recorded costs. It updates as the text changes. A model priced at zero shows «Free».
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** the chosen model has no published price, or is priced by something other than characters (for example per second of audio, or per token)
> **When** the Owner types
> **Then** the page says how the model is priced («priced per second of audio», «priced per token»), or that its price is unknown, instead of a number — never «$0» and never «Free» for an unknown price. Unlike image models, speech models get no estimate from the Owner's past costs in this step, so such a recording has no estimate.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `src/shared/speech-models.ts`: `FAMILIES` (prefix → spec) + per-id overrides; `specFor(id)`; `makerOf(id)` (ElevenLabs first in `MAKER_ORDER`, then alphabetical); `maxCharsFor(id, catalogContextLength)` → {maxChars, source}; `priceFrom(pricing)` → SpeechPrice; `controlsFor(id)` → Control[]
- [ ] `src/shared/speech.ts`: zod schemas from the contract; `billedChars`; `settingsFor(controls, settings)` keeps accepted keys, clamps into range, fills defaults; `defaultSettings(controls)`; `estimateMicros(chars, price)`
- [ ] Unit tests for each function, including an unknown id, an id with a colon voice, a v5 ElevenLabs id inheriting the family, emoji code points

## Edge cases

| Case | Behaviour |
|---|---|
| unknown model id | controls [] — voice + text only; maxChars from catalog, else 5 000 `default` |
| new elevenlabs/eleven-v5 | inherits ElevenLabs family controls |
| speed 1.2 switching to a model with max 1.1 | clamped to 1.1 |
| text '  hi  ' | 2 billed characters |
| pricing {prompt: '0', completion: '0'} | free |
| pricing {prompt:'0', completion:'0.0025'} for bytedance-seed | per-output «per second of audio», no estimate |

## Definition of Done

- [ ] unit tests prove family matching, control descriptors, settingsFor clamping, limit precedence, pricing unit, billedChars and the estimate
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
