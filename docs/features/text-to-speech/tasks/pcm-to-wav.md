---
id: T4
title: "Wrap raw PCM as a WAV file"
layer: "domain"
deps: []
blocks: ["T8"]
acs: ["AC-10", "AC-20"]
files_hint: ["src/server/modules/audio/wav.ts", "src/server/modules/audio/wav.test.ts"]
owner: "pipeline agent (implement)"
estimate: "S"
context_budget: "S"
status: "todo"
step: ""
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T4 — Wrap raw PCM as a WAV file

## Place in the sequence

- **Blocked by:** — · **Blocks:** T8 — Build the audio service: validate, speak, save atomically, track cost, delete · **Wave:** 1.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to type text, choose any OpenRouter speech model and a voice, and generate speech
> **So that** I get an audio recording I can play and download
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: unit tests prove a valid 44-byte RIFF/WAVE header for the given rate/channels, the default 24 000 Hz mono, unchanged samples, and a thrown conversion error for odd-length or empty data.

## Inlined context

> **ADR-0041 decision:** the audio service's save step prepends a 44-byte WAV header (`audio/wav.ts`), using the rate and channels from the content type (default 24 000 Hz mono) — lossless, no dependency. A failed conversion is a save failure (spec AC-20), not a provider error.
>
> — `adr/0041, Option 1, abridged`

> **Format:** Raw PCM (16-bit little-endian) has no header … Its content type carries `rate=…;channels=…`.
>
> — `adr/0041, Context, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-10 — domain invariant

> **Given** a model that returns audio in a raw form a browser can't play directly
> **When** its recording is saved
> **Then** the saved file plays in the page's player and downloads as a common audio file. Raw audio is wrapped, without loss, as a WAV file; audio that arrives as MP3 is kept as it came. The Owner never chooses an output format, and the recording names its file type. A recording is saved only together with its audio file — never a recording without audio, never an audio file without its recording — even if Ukiyo stops in the middle of saving.
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** the provider answered with audio, but Ukiyo can't save it (for example the disk is full, or raw audio can't be converted)
> **When** the Owner generates
> **Then** the page says that the audio arrived but couldn't be saved, and that the provider may still charge for it. Nothing partial is left behind: no recording without its file and no stray file. The text and settings stay as the Owner set them.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `toPlayable(bytes, mediaType)` → `{bytes, mediaType: 'audio/mpeg'|'audio/wav'}`: mpeg passes through, `audio/pcm[;rate;channels]` gets the header, anything else throws `AudioConversionError`
- [ ] Unit tests incl. header fields (chunk sizes, byte rate, block align, bits 16)

## Edge cases

| Case | Behaviour |
|---|---|
| `audio/pcm;rate=44100;channels=2` | header with 44 100 Hz, 2 channels |
| `audio/pcm` without params | 24 000 Hz mono |
| odd number of bytes or empty | AudioConversionError |
| `audio/ogg` | AudioConversionError |

## Definition of Done

- [ ] unit tests prove a valid 44-byte RIFF/WAVE header for the given rate/channels, the default 24 000 Hz mono, unchanged samples, and a thrown conversion error for odd-length or empty data
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
