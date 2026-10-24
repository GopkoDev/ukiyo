---
status: Accepted
owner: "dmytro.hopko"
reviewers: []
updated_at: "2026-10-25"
feature_size: "M"
ticket: "roadmap step 18"
---

# 0039 — Put speech behind its own provider port with an OpenRouter adapter

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** pipeline agent under the owner's run brief (dmytro.hopko)

## Context

The prototype's OpenRouter speech client lives inside `modules/audio/` (`openrouter-speech.ts`), with its own base URL, key handling and error mapping. That bypasses the provider convention (ADR-0002: a call path is an adapter in `providers/`, and its callers never branch on the provider). `ImageProvider` is image-shaped: `generate` returns images and `listModels` returns `ImageModel`. Speech needs to list models with voices and pricing units, synthesise audio, report credits and look up a deferred cost.

## Decision drivers

- Convention: provider HTTP lives only in `providers/` adapters, plain `fetch` (CLAUDE.md, ADR-0002).
- Spec AC-07…AC-09: per-family wire differences (controls, `provider.options`, formats) must not leak into the audio service.
- Testability: the audio service is tested with a fake port; the adapter with recorded fixtures.
- Steps 19–21 and a possible second speech provider plug into the same port.

## Considered options

1. **A separate `SpeechProvider` port (`speech-port.ts`) + `createOpenRouterSpeech` adapter in `providers/`, a speech registry keyed by provider id, and a `speech-catalog.ts` cache** — mirrors the image side without bending its types.
2. **Add optional speech methods to `ImageProvider`** — one registry, but every image adapter and fake gains irrelevant optional members, and `ProviderId`/`ImageModel` semantics blur.
3. **One generic `MediaProvider` port for images and speech** (`generate(kind, input)`) — a single registry, but its union types leak image and audio shapes into each other, and every shipped image consumer changes.

## Decision outcome

**Chosen:** Option 1. It keeps `ImageProvider` and its consumers untouched (QG-3) and gives audio the same seam images have. The port: `id`, `name`, `configured`, `listModels(signal)`, `speak(input, signal)` → `{ bytes, mediaType, costUsd: number | null, costRef: string | null }`, `credits(signal)`, `lookupCost(costRef, signal)` (same `CostLookup` type as images).

## Consequences

**Positive**
- The audio service never sees URLs, headers or `provider.options`; a fake port drives its tests.
- The cost-sync resolver reuses `lookupCost` with the same `CostLookup` shape (ADR-0043).

**Negative**
- Two small registries (image, speech) instead of one.
- OpenRouter's HTTP error mapping is duplicated in two adapters (≈ 20 lines); extracted only if a third adapter appears.

**Neutral**
- Vercel speech, if it ever comes, is a second adapter behind the same port.
- `CLAUDE.md` §Conventions says «a new provider / call path = a new `ImageProvider` adapter»; it should read «an adapter behind the matching port (`ImageProvider` | `SpeechProvider`)». Left for the owner to edit (agents don't change CLAUDE.md).

## Links

- Spec: [[../spec.md]] §1 AC-07…AC-09, AC-14
- SAD: [[../sad.md]] §4
- Related ADR: [[0043-resolve-recording-costs-with-the-shared-cost-sync-resolver-and-keep-the-estimate-beside-the-cost]], ADR-0002
