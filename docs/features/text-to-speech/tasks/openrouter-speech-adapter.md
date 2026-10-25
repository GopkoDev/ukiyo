---
id: T3
title: "Build the SpeechProvider port and the OpenRouter speech adapter"
layer: "infra"
deps: ["T2"]
blocks: ["T8"]
acs: ["AC-05", "AC-07", "AC-09", "AC-10", "AC-13"]
files_hint: ["src/server/modules/providers/speech-port.ts", "src/server/modules/providers/openrouter-speech.ts", "src/server/modules/providers/openrouter-speech.test.ts", "src/server/modules/providers/speech-catalog.ts", "src/server/modules/providers/speech-catalog.test.ts", "tests/fixtures/openrouter/speech/"]
owner: "pipeline agent (implement)"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T3 — Build the SpeechProvider port and the OpenRouter speech adapter

## Place in the sequence

- **Blocked by:** T2 — Add the speech family spec map and the shared speech DTOs · **Blocks:** T8 — Build the audio service: validate, speak, save atomically, track cost, delete · **Wave:** 2.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to type text, choose any OpenRouter speech model and a voice, and generate speech
> **So that** I get an audio recording I can play and download
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: adapter unit tests over recorded fixtures prove the catalog mapping for all 36 models, per-family request bodies, PCM vs mp3 request, credits, cost lookup and error mapping; the catalog caches 10 min.

## Inlined context

> **ADR-0039 decision:** A separate `SpeechProvider` port (`speech-port.ts`) + `createOpenRouterSpeech` adapter in `providers/`, a speech registry keyed by provider id, and a `speech-catalog.ts` cache. The port: `id`, `name`, `configured`, `listModels(signal)`, `speak(input, signal)` → `{ bytes, mediaType, costUsd: number | null, costRef: string | null }`, `credits(signal)`, `lookupCost(costRef, signal)` (same `CostLookup` type as images).
>
> — `adr/0039, Options 1 + Decision outcome, abridged`

> **OpenRouter facts:** `POST /api/v1/audio/speech` takes `model`, `input`, `voice`, `response_format` (`mp3` | `pcm`, default pcm), `speed`, `instructions` and `provider.options.<slug>`. It answers with raw audio bytes; a PCM answer's content type carries `rate` and `channels`; the generation id comes in the `X-Generation-Id` header. … `GET /api/v1/models?output_modalities=speech` is public … `GET /api/v1/generation?id=` (Bearer key) gives `total_cost`, with `api_type` including `tts`.
>
> — `sad.md §2 Technical, abridged`

> **ADR-0041 split:** the adapter returns the bytes with their content type as received, and the audio service's save step prepends a 44-byte WAV header
>
> — `adr/0041, Option 1, abridged`

> **Errors:** The adapter throws `ProviderError("openrouter", upstreamStatus, message)`. A missing key → the service maps to PROVIDER_NOT_CONFIGURED. Generation lookup: 404 → not-yet; total_cost number → known; other → not-yet (retried by cost-sync).
>
> — `sad.md §8 Error handling, abridged`

> **Precedent:** `providers/openrouter.ts` call()/ErrorBody/reasons mapping and `providers/catalog.ts` 10-min cache with in-flight dedupe (`CATALOG_TTL_MS`) — mirror them; the prototype client `modules/audio/openrouter-speech.ts` shows the credits + speak shape.
>
> — `architecture-map.md §Conventions, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface (the routes in T9 call this port).

## Acceptance criteria

### AC-05 — error

> **Given** the provider refuses the request, fails, does not answer within the time limit, or answers with no usable audio
> **When** the Owner generates
> **Then** the page shows a plain message that names what went wrong, using the provider's reason when it gave one (for example insufficient credits, or a voice the model doesn't offer). No recording is saved, and the text, model, voice and settings stay as the Owner set them so they can try again. When the provider did not answer in time, the message also says the provider may still charge for the request.
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy path

> **Given** the Owner chooses a model
> **When** the controls are shown
> **Then** only the controls that model accepts appear, each with its own range and default. For example: ElevenLabs models show stability, similarity and, where the model supports them, style, speaker boost and speed; models that take delivery instructions show a free-text «delivery instructions» field; models that honour speed show a speed control. The voice list is that model's own voices. Each model's price and character limit are shown next to it in the model list. The list is grouped by the model's maker, ElevenLabs first and the others in alphabetical order, with each group in catalog order. When a model offers more than 20 voices, the voice list can be filtered by typing. Delivery instructions take up to 1 000 characters, and they are not billed characters.
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a catalog model Ukiyo has no specific knowledge of, or a model whose catalog entry lists no voices
> **When** the Owner chooses it
> **Then** it stays usable. An unknown model offers the voice and the text only. A model without listed voices lets the Owner either use the provider's default voice or type a voice name, and the recording names the voice that was asked for («provider default» when none was). A model's character limit comes from what Ukiyo knows about its family. Otherwise it comes from the limit the catalog states for it. When neither gives one, a default of 5 000 characters applies, labelled «limit not published». Text over the limit is refused before sending and never cut short. Ukiyo never hides a catalog model because it doesn't know its controls.
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant

> **Given** a model that returns audio in a raw form a browser can't play directly
> **When** its recording is saved
> **Then** the saved file plays in the page's player and downloads as a common audio file. Raw audio is wrapped, without loss, as a WAV file; audio that arrives as MP3 is kept as it came. The Owner never chooses an output format, and the recording names its file type. A recording is saved only together with its audio file — never a recording without audio, never an audio file without its recording — even if Ukiyo stops in the middle of saving.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — domain invariant

> **Given** a recording has just been saved
> **When** the Owner looks at its cost
> **Then** while Ukiyo is still waiting for the provider to report the actual charge, it reads «cost pending», with the estimate beside it when there is one. If the provider's answer already states the charge, the cost is known at once. Otherwise, once the provider reports the charge (within ten minutes), it changes to that amount without a reload. If the provider never reports it, it reads «cost unavailable», with the estimate still shown as an estimate. An unknown cost is never shown or counted as $0.
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Record the live catalog: `tests/fixtures/openrouter/speech/models.json` (the 36-model `GET /models?output_modalities=speech` answer read 2026-10-25), plus `generation-found.json` / `generation-not-found.json`, `error-402.json`
- [ ] `speech-port.ts`: `SpeechProvider`, `SpeechInput {model: SpeechModel, text, voice|null, settings}`, `SpeechResult`, reuse `CostLookup`/`ProviderError` from `port.ts`
- [ ] `openrouter-speech.ts`: listModels (catalog + T2 spec map → SpeechModel), speak (body per family: response_format from spec, voice omitted when null, settings mapped onto wire via the spec), credits (null when unreadable), lookupCost; injected fetch
- [ ] `speech-catalog.ts`: per-provider cache, 10 min TTL, in-flight dedupe, no caching of failures; `find(provider, id)`
- [ ] Unit tests with `tests/helpers/fake-fetch.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| provider answers 402 | ProviderError with upstreamStatus 402 and the provider's message |
| fetch hangs, signal aborts | ProviderError «The provider did not answer in time» |
| 200 with zero bytes | ProviderError «The provider returned no audio» |
| PCM-only family | request carries response_format pcm; result mediaType `audio/pcm;rate=…` |
| voice null | no `voice` key in the body |
| no key | speak/credits/lookupCost throw not-configured; listModels still works (public) |

## Definition of Done

- [ ] adapter unit tests over recorded fixtures prove the catalog mapping for all 36 models, per-family request bodies, PCM vs mp3 request, credits, cost lookup and error mapping; the catalog caches 10 min
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
