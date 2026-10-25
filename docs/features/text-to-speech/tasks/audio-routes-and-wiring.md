---
id: T9
title: "Expose the audio contract, wire it in createApp and retire the prototype server code"
layer: "ports"
deps: ["T8"]
blocks: ["T13", "T15"]
acs: ["AC-03", "AC-04", "AC-05", "AC-06", "AC-15", "AC-16", "AC-19"]
files_hint: ["src/server/modules/audio/routes.ts", "src/server/modules/audio/routes.int.test.ts", "src/server/modules/audio/repo.ts", "src/server/modules/audio/recordings-repo.ts", "src/server/modules/audio/openrouter-speech.ts", "src/server/app.ts", "src/server/modules/generations/service.ts", "tests/fixtures/openrouter/speech-models.json"]
owner: "pipeline agent (implement)"
estimate: "M"
context_budget: "M"
status: "done"
step: "COMMIT"
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T9 — Expose the audio contract, wire it in createApp and retire the prototype server code

## Place in the sequence

- **Blocked by:** T8 — Build the audio service: validate, speak, save atomically, track cost, delete · **Blocks:** T13 — Rebuild the Speech page on the new contract · T15 — Prove the audio NFRs and the image/audio separation · **Wave:** 4.
- **Lane:** shares files with T1, T5, T6, T7 — serialized.

## Why (user story)

> **As the** Owner
> **I want** to type text, choose any OpenRouter speech model and a voice, and generate speech
> **So that** I get an audio recording I can play and download
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: route integration tests prove every operation of contracts/openapi.yaml with the shared schemas (incl. 403 for a foreign origin on each), boot wiring (one sweep with both id sets, audio cost resume), and the prototype server files are gone; full gate green.

## Inlined context

> **Wiring:** `createApp(deps)` builds every module by hand from explicit deps … boot side effects run inside `createApp`: prompt-key backfill, file sweep, cost resume
>
> — `architecture-map.md §Conventions, abridged`

> **Sweep order:** One sweep, called once on boot after both repos exist (in `createApp`, after audio is wired), so an interrupted audio deletion is restored instead of wiped.
>
> — `adr/0042, Consequences, verbatim`

> **Cost sync instance:** build a second instance for recordings over the audio repo and the speech registry
>
> — `adr/0043, Option 1, abridged`

> **Retire prototype:** the contract replaces the prototype routes (`/api/audio`, `/api/audio/:id/file`, `DELETE /api/audio/:id`): their only client is the SPA … `/api/audio/models` and `/api/audio/credits` keep their paths.
>
> — `contracts/api-sync-report.md, abridged`

> **Transient:** The old SpeechPage + `src/shared/audio.ts` + old `api.ts` audio methods still compile after this task and call removed endpoints at runtime until T13 replaces them (same PR).
>
> — `tasks breakdown, ordering`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `GET /api/audio/models` → 200 SpeechModelsResponse · 502
- `GET /api/audio/credits` → 200 CreditsResponse · 409
- `GET /api/audio/recordings?cursor&limit(1–100, default 10)` → 200 RecordingPage · 400
- `POST /api/audio/recordings` → 201 Recording · 400 / 409 / 500 / 502
- `GET /api/audio/recordings/{id}` → 200 Recording · 404
- `DELETE /api/audio/recordings/{id}` → 204 · 404 · 500
- `GET /api/audio/recordings/{id}/file[?download=1]` → 200 audio/mpeg|audio/wav (immutable cache, inline or attachment) · 404
- all → 403 FORBIDDEN for a foreign origin (request guard)

— `contracts/openapi.yaml, paths, abridged`

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

### AC-15 — happy path

> **Given** the Owner has made recordings
> **When** the Owner opens the Speech page's recent recordings
> **Then** the ten latest are listed, newest first, each with a player, its text excerpt, voice, model, time, cost (with its status) and a download action. Choosing one puts its text, model, voice and settings back into the form, so the Owner can generate again. If the form holds unsent text that differs from the recording's, the page asks before replacing it. A recording whose model is no longer offered still shows its model's name and plays. Choosing it says that the model is no longer offered and keeps the current model. It still fills in the text, plus the voice and the settings that the current model accepts.
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** the Owner deletes a recording
> **When** the deletion completes
> **Then** the recording and its audio file are gone together, with no undo. It disappears from the recent recordings and its file can't be opened any more. Ukiyo stops waiting for its cost. If the deletion fails, the recording stays complete and playable, and the page says the deletion failed.
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — authorization

> **Given** Ukiyo is running
> **When** a page from another site in the Owner's browser asks Ukiyo to generate speech, list recordings or delete one
> **Then** Ukiyo refuses, as it does every other request from another site. The OpenRouter key never reaches the browser, the saved recording or the logs.
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Rewrite `audio/routes.ts` as a thin layer over T8 (zod-parse body; fields errors)
- [ ] Delete prototype `audio/openrouter-speech.ts` and `audio/repo.ts`; rename `recordings-repo.ts` → `repo.ts`
- [ ] `app.ts`: speech registry + catalog + audio costSync + service; `sweepOnBoot` → one `files.sweep(genIds, recordingIds)` after audio is built; `audioCostSync.resume()`; `stopBackground` stops both
- [ ] Replace `tests/fixtures/openrouter/speech-models.json` with the recorded 36-model catalog (or point tests at `speech/models.json`)
- [ ] Rewrite `routes.int.test.ts` against the contract

## Edge cases

| Case | Behaviour |
|---|---|
| unknown route id format | 404 |
| file missing on disk | 404 |
| foreign Origin header | 403 |
| restart with a pending recording | lookup resumes |

## Definition of Done

- [ ] route integration tests prove every operation of contracts/openapi.yaml with the shared schemas (incl. 403 for a foreign origin on each), boot wiring (one sweep with both id sets, audio cost resume), and the prototype server files are gone; full gate green
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
