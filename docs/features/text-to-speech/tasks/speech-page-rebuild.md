---
id: T13
title: "Rebuild the Speech page on the new contract"
layer: "ui"
deps: ["T9", "T10", "T11", "T12"]
blocks: ["T14", "T16"]
acs: ["AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-08", "AC-14", "AC-17", "AC-20"]
files_hint: ["src/web/features/audio/SpeechPage.tsx", "src/web/features/audio/SpeechForm.tsx", "src/web/features/audio/SpeechResult.tsx", "src/web/features/audio/useSpeechDraft.ts", "src/web/features/audio/SpeechPage.test.tsx", "src/web/lib/api.ts", "src/shared/audio.ts"]
owner: "pipeline agent (implement)"
estimate: "L"
context_budget: "M"
status: "todo"
step: ""
---

<!-- Self-contained task (sdd:tasks). Work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T13 — Rebuild the Speech page on the new contract

## Place in the sequence

- **Blocked by:** T9 — Expose the audio contract, wire it in createApp and retire the prototype server code · T10 — Group the navigation into Image and Audio and move Speech under /audio · T11 — Show speech prices, estimates and recording costs honestly · T12 — Build ModelSelect, VoiceSelect and descriptor-driven VoiceControls · **Blocks:** T14 — List recent recordings with reuse, delete and live pending costs · T16 — Register the audio components in the design canon and the architecture map · **Wave:** 5.
- **Lane:** shares files with T14 — serialized.

## Why (user story)

> **As the** Owner
> **I want** to type text, choose any OpenRouter speech model and a voice, and generate speech
> **So that** I get an audio recording I can play and download
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers: component tests prove compose/validation/working/provider-error/save-error/not-configured/models-error states, one request per click, state kept across navigation, result autoplay + download, credits refresh; prototype shared/audio.ts and old api methods deleted; full gate green.

## Inlined context

> **SCR-02 states:** default · loading (models) · error (models) «Couldn't load speech models — Try again» · not configured «Speech needs OpenRouter — set OPENROUTER_API_KEY in .env.local and restart the server» · validation: blank → disabled; over the limit → counter in destructive colour «5 210 / 5 000 characters»; server refusal under the panel (role=alert) · limit not published · working «Generating…», survives navigation · error (provider): provider's reason; timeout «… did not answer within 180 s — the provider may still charge for it» · error (save) «The audio arrived but couldn't be saved — the provider may still charge for it» · model gone notice
>
> — `screens.md SCR-02, abridged`

> **SCR-03:** voice dot + name («Provider default» when none), model name, relative time, cost (CostLabel), download, native player; autoplays only for the recording just generated; «Audio unavailable» when the file can't load
>
> — `screens.md SCR-03, abridged`

> **Layout:** The rebuild keeps this layout and splits the file into components (reference: text panel with counter, credits and «Generate speech», side panel «Settings» | «Recent» tabs; below lg a Sheet).
>
> — `screens.md §Source, abridged`

> **Reuse:** prototype `Panel`, Textarea, Button, Tabs, Sheet, Loader icon; TanStack Query `useMutation`; `api` client pattern `request(schema, path)`
>
> — `architecture-map.md §Frontend, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Web client methods in `src/web/lib/api.ts`: speechModels → `GET /audio/models`, speechCredits → `GET /audio/credits`, recordings(cursor?, limit?) → `GET /audio/recordings`, createRecording(body) → `POST /audio/recordings`, recording(id), deleteRecording(id); error codes read: VALIDATION_ERROR, PROVIDER_NOT_CONFIGURED, PROVIDER_ERROR, STORAGE_ERROR.

— `contracts/openapi.yaml, paths, abridged`

## Acceptance criteria

### AC-02 — cross-context

> **Given** the Owner has an unsent prompt on the Generate page, or text and settings on the Speech page
> **When** the Owner moves to another section and comes back
> **Then** the prompt, or the text and settings, are still there (app-shell keeps the Generate page as it is). A recording that is still being generated keeps showing as in progress, with the generate action unavailable. One that finished while the Owner was away shows as the latest result and first in the recent recordings. One that failed shows its error.
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

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

### AC-14 — cross-context

> **Given** the Owner generated a recording
> **When** the generation finishes
> **Then** the OpenRouter credit balance shown on the Speech page refreshes. Recordings never appear in the image gallery or in the recent generations next to the Generate form, and they never change an image model's price estimate or cost history.
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — domain invariant

> **Given** a recording is being generated
> **When** the Owner tries to generate again
> **Then** the generate action is unavailable until the current request ends, also after moving to another section and back (AC-02). One Owner action never sends two paid requests. A second browser tab, or a reload of the page during a request, is not guarded. After a reload, a recording that finished still appears in the recent recordings.
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** the provider answered with audio, but Ukiyo can't save it (for example the disk is full, or raw audio can't be converted)
> **When** the Owner generates
> **Then** the page says that the audio arrived but couldn't be saved, and that the provider may still charge for it. Nothing partial is left behind: no recording without its file and no stray file. The text and settings stay as the Owner set them.
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] api.ts: new methods with shared schemas; remove `audioGenerations`, `generateSpeech`, `deleteAudio`, `audioCredits` and the `../../shared/audio` import
- [ ] Split SpeechPage into SpeechForm (text, counter, estimate, credits, generate), side panel (Settings tab with T12 controls; Recent tab placeholder for T14), SpeechResult
- [ ] Draft state (text, model, voice, settings) kept in the page (kept mounted, T10)
- [ ] Delete `src/shared/audio.ts`
- [ ] Component tests

## Edge cases

| Case | Behaviour |
|---|---|
| double click Generate | one request |
| navigate away during a request and back | still «Generating…», then the result |
| 409 on credits | not-configured notice, credits hidden |
| models request fails | Try again re-requests |

## Definition of Done

- [ ] component tests prove compose/validation/working/provider-error/save-error/not-configured/models-error states, one request per click, state kept across navigation, result autoplay + download, credits refresh; prototype shared/audio.ts and old api methods deleted; full gate green
- [ ] every Hard Rule inlined above still holds
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green
