---
id: T8
title: "Build the audio service: validate, speak, save atomically, track cost, delete"
layer: "app"
deps: ["T3", "T4", "T5", "T6", "T7"]
blocks: ["T9"]
acs: ["AC-03", "AC-04", "AC-05", "AC-06", "AC-08", "AC-09", "AC-10", "AC-13", "AC-16", "AC-20"]
files_hint: ["src/server/modules/audio/service.ts", "src/server/modules/audio/domain.ts", "src/server/modules/audio/service.int.test.ts", "src/server/modules/audio/domain.test.ts"]
owner: "pipeline agent (implement)"
estimate: "L"
context_budget: "M"
status: "done"
step: "COMMIT"
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T8 — Build the audio service: validate, speak, save atomically, track cost, delete

## Place in the sequence

- **Blocked by:** T3 — Build the SpeechProvider port and the OpenRouter speech adapter · T4 — Wrap raw PCM as a WAV file · T5 — Give the file store single-file audio staging, trash and one combined boot sweep · T6 — Generalise cost sync over an injected repo and lookup · T7 — Write the recordings repo over the rebuilt table · **Blocks:** T9 — Expose the audio contract, wire it in createApp and retire the prototype server code · **Wave:** 3.
- **Lane:** own lane.

## Why (user story)

> **As the** Owner
> **I want** to type text, choose any OpenRouter speech model and a voice, and generate speech
> **So that** I get an audio recording I can play and download
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: service integration tests with a fake SpeechProvider prove every flow-1 branch (refused input, provider error/timeout, conversion/save failure → nothing left, saved with known/pending/unavailable + estimate + tracking), delete success/failure/missing, and list with modelName fallback.

## Inlined context

> **Flow 1 (generate and save):** Service->>Catalog: find model; alt model unknown or text over its limit or empty → refused with the reason; else Service->>Adapter: speak (only the model's accepted settings); alt refused, failed, timed out or no audio → provider error (timeout: may still be charged); else audio bytes + generation id → Service: wrap raw PCM as WAV when needed → Files: stage → Repo: insert recording (cost known if stated, else pending with a generation id, else unavailable; estimate) and commit file in one transaction; alt conversion or save fails → discard staged file, storage error (audio arrived, may be charged); else CostSync: track the cost when pending → saved recording
>
> — `sad.md §6, flow 1, abridged`

> **Errors:** `PROVIDER_ERROR` 502 with `details.provider` and `details.upstreamStatus`. A timeout gets the message «did not answer within 180 s — the provider may still charge for it». A missing key is `PROVIDER_NOT_CONFIGURED` 409. A save failure is `STORAGE_ERROR` 500 «The audio arrived but couldn't be saved — the provider may still charge for it». Validation failures are `VALIDATION_ERROR` 400 with `details.fields`
>
> — `sad.md §8, Error handling, abridged`

> **Delete (flow 3):** one transaction: delete the row, then `trashAudioSync` … After commit it purges the file and calls `costSync.forget(id)`. If the transaction fails, `restoreAudioSync` puts the file back and the Owner sees «deletion failed».
>
> — `sad.md §6 flow 3, abridged`

> **Model name:** the catalog name stored with the recording (`model_name`); prototype rows fall back to the family spec name, then the model id
>
> — `sad.md §8, Model display name, verbatim`

> **Timeout:** speech request timeout injected via `AppDeps.generationTimeoutMs` (default 180 s)
>
> — `sad.md §8 Timeouts, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Writes `audio_generations` through T7's repo (all columns); no schema change.

## API contract

Implements the behaviour behind `createRecording`, `listRecordings`, `getRecording`, `deleteRecording` (T9 maps them to HTTP). Errors owned here: VALIDATION_ERROR (fields text | model | voice), PROVIDER_NOT_CONFIGURED, PROVIDER_ERROR, STORAGE_ERROR, NOT_FOUND.

— `contracts/openapi.yaml, operations createRecording/listRecordings/getRecording/deleteRecording, abridged`

## Acceptance criteria

### AC-03 — happy path

> **Given** OpenRouter is configured and the Owner has entered text within the chosen model's character limit, chosen a model and a voice
> **When** the Owner generates speech
> **Then** the page shows that it is working, then shows the new recording with a player that starts playing, a download action, the voice, the model, the time and its cost. The recording appears first in the recent recordings. Ukiyo has saved its text, model, voice, the settings it sent, the audio file, the number of billed characters, its cost, its price estimate (when there was one) and the provider's reference for the later cost lookup.
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — error

> **Given** the text is empty or only spaces and line breaks, or longer than the chosen model's character limit
> **When** the Owner tries to generate
> **Then** the generate action is unavailable, and the character counter shows the limit in a warning colour («5 210 / 5 000 characters»). Nothing is sent to the provider and nothing is charged. If such a request still reaches Ukiyo, it is refused with the reason, for example «Eleven v3 takes at most 5 000 characters».
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — error

> **Given** the provider refuses the request, fails, does not answer within the time limit, or answers with no usable audio
> **When** the Owner generates
> **Then** the page shows a plain message that names what went wrong, using the provider's reason when it gave one (for example insufficient credits, or a voice the model doesn't offer). No recording is saved, and the text, model, voice and settings stay as the Owner set them so they can try again. When the provider did not answer in time, the message also says the provider may still charge for the request.
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — error

> **Given** OpenRouter's key is not configured
> **When** the Owner opens the Speech page
> **Then** the page says that speech needs OpenRouter and how to configure it, and the generate action is unavailable. The image pages keep working with any provider that is configured.
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

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

### AC-16 — domain invariant

> **Given** the Owner deletes a recording
> **When** the deletion completes
> **Then** the recording and its audio file are gone together, with no undo. It disappears from the recent recordings and its file can't be opened any more. Ukiyo stops waiting for its cost. If the deletion fails, the recording stays complete and playable, and the page says the deletion failed.
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** the provider answered with audio, but Ukiyo can't save it (for example the disk is full, or raw audio can't be converted)
> **When** the Owner generates
> **Then** the page says that the audio arrived but couldn't be saved, and that the provider may still charge for it. Nothing partial is left behind: no recording without its file and no stray file. The text and settings stay as the Owner set them.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `domain.ts`: costFromResult(costUsd, costRef) → {costMicros, costStatus, costRef}; toDto(record, modelNameFallback) with `url = /api/audio/recordings/<id>/file`
- [ ] `service.ts` `createAudioService({speech, catalog, repo, files, costSync, now, timeoutMs})`: start(body), list(q), get(id), remove(id), models(), credits(), fileOf(id)
- [ ] voice rule: voiceMode `required` → must be one of the model's listed voices; voiceMode `optional` → null (provider default) or any typed name 1–100 chars
- [ ] Integration tests with a fake port + real SQLite

## Edge cases

| Case | Behaviour |
|---|---|
| model id not in catalog | VALIDATION_ERROR fields.model |
| catalog unreachable | PROVIDER_ERROR (502), nothing sent |
| text over maxChars | VALIDATION_ERROR «<name> takes at most N characters» |
| voice null for voiceMode required | VALIDATION_ERROR fields.voice |
| commit throws | STORAGE_ERROR, staged file discarded, no row |
| toPlayable throws | STORAGE_ERROR (AC-20), nothing written |
| answer without generation id and without cost | costStatus unavailable, not tracked |

## Definition of Done

- [ ] service integration tests with a fake SpeechProvider prove every flow-1 branch (refused input, provider error/timeout, conversion/save failure → nothing left, saved with known/pending/unavailable + estimate + tracking), delete success/failure/missing, and list with modelName fallback
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
