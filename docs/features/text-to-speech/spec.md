---
status: Draft
owner: "dmytro.hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-25"
feature_size: "M"
---

# Spec — text-to-speech

> **Glossary:** [CONTEXT](../../../CONTEXT.md)
> **Reference module / docs / channels used:** [`docs/roadmap.md`](../../roadmap.md) steps 18–21 (owner request, audio epic); the audio prototype on this branch (commits `a1169a1`, `cbb9c47`: `src/server/modules/audio/`, `src/shared/audio.ts`, `src/web/features/audio/SpeechPage.tsx`, migration `0011_create_audio_generations`) and its gaps in [`architecture-map.md` §Constraints](../../architecture-map.md); OpenRouter's live speech catalog (36 models, read 2026-10-25) and its text-to-speech docs ([guide](https://openrouter.ai/docs/guides/overview/multimodal/tts), [API reference](https://openrouter.ai/docs/api/api-reference/tts/create-speech)); the shipped image precedents [`app-shell`](../app-shell/spec.md), [`vercel-ai-gateway`](../vercel-ai-gateway/spec.md) (cost lookup), [`model-price-preview`](../model-price-preview/spec.md) (estimates).

## 1. Context

Ukiyo is an image tool today: its navigation is one flat list (Generate, Gallery, Models) and everything it stores is an image generation. The Owner now also wants to turn text into speech with the same promise — every result kept on the machine with what it cost and how it was made. A prototype Speech page already does this for ElevenLabs only, and the Owner has used it for real (19 recordings on disk). It was written fast. It talks to the provider in its own way instead of the way every image provider is reached. It records an amount without a cost status, so a missing price looks like nothing. It saves files in a way a crash can leave a recording without its file. It offers 9 of the 36 speech models OpenRouter lists.

The trigger is the owner's audio epic (roadmap steps 18–21): this step lays the ground, and the later steps build on it. Step 19 adds an audio gallery with tags and comments, step 20 adds speech models to the Models page, and step 21 adds saved voice presets. So the recording record, its cost and its file layout have to be right now.

Committed approach: the navigation becomes two groups — **Image** first (Generate, Gallery, Models, unchanged) and **Audio** second (Speech now; the audio gallery and voices join in steps 19 and 21). The Speech page keeps the prototype's layout: text on the left, voice, model and voice controls on the right, the latest result with a player, and the recent recordings. Behind it, the page is rebuilt on the project's conventions. It offers every speech model in OpenRouter's catalog. Each model shows only the controls it accepts: known model families get their own controls, and any other model still works with a voice and the text. Before the Owner generates, the page shows a price estimate from the published price. Each saved recording has a cost status: pending while Ukiyo asks the provider what it actually charged, then known, or unavailable if the provider never says. The up-front estimate stays visible beside the cost, always labelled as an estimate. The prototype's recordings are kept as they are.

- Failure modes weighed before the AC (devil's-advocate pass, §1 ¶4 summary): a model whose voices, formats or controls the page gets wrong; audio the browser can't play; an estimate that reads as the real price or as free; a lost recording after a crash or a failed save; prototype recordings losing their cost or file; image features changing by accident. Each one has an AC or an NFR row.
- Decision (owner, 2026-10-25): images and audio stay separate — separate records, separate sections — and audio reuses the image side's saving, cost lookup and page building blocks rather than merging both into one «media» record. The Speech page moves under the Audio group's address space (`/audio/speech`; steps 19 and 21 add siblings under `/audio/`). Its former address `/speech` redirects there, so the address bar shows the new one.
- Decision (owner, 2026-10-25): the prototype's stored data is kept. Recordings that have an amount become cost `known`; recordings without one become `unavailable`.
- Decision override: prototype recordings with an amount become cost `known` although the amount was computed from the published price, not reported by the provider — rationale: owner decision 2026-10-25; per-character prices are the billing formula. The prototype did store the provider's reference, but by owner decision its rows are not looked up again — their amount is final.
- Decision (owner, 2026-10-25, see §8 Q2): a recording keeps its up-front price estimate beside its cost. This differs from image generations, where the estimate is never stored. The reason is that a speech price is almost always per character, so the estimate is the best figure the Owner has until (or unless) the provider reports the real cost.

## 2. Goals

- The Owner can turn text into speech with any speech model OpenRouter offers, using only the controls that model accepts.
- Every recording is kept on the machine with its text, model, voice, settings, audio and an honest cost. The cost is never shown as free when it is unknown, and an estimate is never shown as the real cost.
- Ukiyo reads as one app with two areas, Image and Audio, and steps 19–21 can add audio pages without another redesign.

## 3. Non-goals

- An audio gallery with paging, tags, comments and a detail view — step 19. This step keeps only the recent recordings on the Speech page.
- Speech models on the Models page, with ★ and hide — step 20. The Speech page lists every catalog model.
- Saved voice presets — step 21.
- Voice cloning or voice design from reference audio or images, multi-speaker dialogue, and streaming playback while the audio is still being made. Each of these needs its own interaction design.
- Speech through Vercel AI Gateway. The owner asked for OpenRouter's speech models.
- Speech-to-text, music or sound effects. The epic is text to speech only.

## 4. User stories

### US-01: Find Image and Audio apart

**As the** Owner
**I want** the navigation split into an Image group and an Audio group
**So that** I can find image and speech tools apart, and new audio pages have a place to go

### US-02: Turn text into speech

**As the** Owner
**I want** to type text, choose any OpenRouter speech model and a voice, and generate speech
**So that** I get an audio recording I can play and download

### US-03: Use each model's own controls

**As the** Owner
**I want** to see only the controls the chosen model accepts (for example speed, stability or delivery instructions)
**So that** every setting I change actually affects the result

### US-04: Know what a recording costs

**As the** Owner
**I want** an estimate before I generate and an honest recorded cost afterwards
**So that** I can control what I spend and compare models

### US-05: Keep and manage my recordings

**As the** Owner
**I want** my recent recordings on the Speech page, where I can play, download, reuse and delete them
**So that** nothing I made is lost, and I can generate again from a past recording

### US-06: Keep my prototype recordings

**As the** Owner
**I want** the recordings I made with the prototype to stay, with their audio, settings and cost
**So that** the rebuild loses nothing I already paid for

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** Ukiyo is open
**When** the Owner looks at the navigation bar
**Then** it shows an «Image» group first, with Generate, Gallery and Models in today's order, and an «Audio» group second, with Speech. Each entry opens its page. The current page is marked in its group. Every image page address works as before, and the Speech page's former address still opens the Speech page.

### AC-02 (US-01) — cross-context

**Given** the Owner has an unsent prompt on the Generate page, or text and settings on the Speech page
**When** the Owner moves to another section and comes back
**Then** the prompt, or the text and settings, are still there (app-shell keeps the Generate page as it is). A recording that is still being generated keeps showing as in progress, with the generate action unavailable. One that finished while the Owner was away shows as the latest result and first in the recent recordings. One that failed shows its error.

### AC-03 (US-02) — happy path

**Given** OpenRouter is configured and the Owner has entered text within the chosen model's character limit, chosen a model and a voice
**When** the Owner generates speech
**Then** the page shows that it is working, then shows the new recording with a player that starts playing, a download action, the voice, the model, the time and its cost. The recording appears first in the recent recordings. Ukiyo has saved its text, model, voice, the settings it sent, the audio file, the number of billed characters, its cost, its price estimate (when there was one) and the provider's reference for the later cost lookup.

### AC-04 (US-02) — error

**Given** the text is empty or only spaces and line breaks, or longer than the chosen model's character limit
**When** the Owner tries to generate
**Then** the generate action is unavailable, and the character counter shows the limit in a warning colour («5 210 / 5 000 characters»). Nothing is sent to the provider and nothing is charged. If such a request still reaches Ukiyo, it is refused with the reason, for example «Eleven v3 takes at most 5 000 characters».

### AC-05 (US-02) — error

**Given** the provider refuses the request, fails, does not answer within the time limit, or answers with no usable audio
**When** the Owner generates
**Then** the page shows a plain message that names what went wrong, using the provider's reason when it gave one (for example insufficient credits, or a voice the model doesn't offer). No recording is saved, and the text, model, voice and settings stay as the Owner set them so they can try again. When the provider did not answer in time, the message also says the provider may still charge for the request.

### AC-06 (US-02) — error

**Given** OpenRouter's key is not configured
**When** the Owner opens the Speech page
**Then** the page says that speech needs OpenRouter and how to configure it, and the generate action is unavailable. The image pages keep working with any provider that is configured.

### AC-07 (US-03) — happy path

**Given** the Owner chooses a model
**When** the controls are shown
**Then** only the controls that model accepts appear, each with its own range and default. For example: ElevenLabs models show stability, similarity and, where the model supports them, style, speaker boost and speed; models that take delivery instructions show a free-text «delivery instructions» field; models that honour speed show a speed control. The voice list is that model's own voices. Each model's price and character limit are shown next to it in the model list. The list is grouped by the model's maker, ElevenLabs first and the others in alphabetical order, with each group in catalog order. When a model offers more than 20 voices, the voice list can be filtered by typing. Delivery instructions take up to 1 000 characters, and they are not billed characters.

### AC-08 (US-03) — domain invariant

**Given** the Owner changes a control and then switches to a model that doesn't accept it
**When** the Owner generates
**Then** only the new model's accepted settings are sent and recorded, and a setting the model ignores is never shown as applied. The text is kept. The voice is kept if the new model offers it; otherwise the model's first listed voice is selected, or «provider default» when it lists none. A control that both models accept keeps its value, brought into the new model's range when it is outside it. Ukiyo does not remember separate values per model. «Reset values» restores the current model's defaults for the voice controls and the delivery instructions, and leaves the voice and the text as they are.

### AC-09 (US-03) — domain invariant

**Given** a catalog model Ukiyo has no specific knowledge of, or a model whose catalog entry lists no voices
**When** the Owner chooses it
**Then** it stays usable. An unknown model offers the voice and the text only. A model without listed voices lets the Owner either use the provider's default voice or type a voice name, and the recording names the voice that was asked for («provider default» when none was). A model's character limit comes from what Ukiyo knows about its family. Otherwise it comes from the limit the catalog states for it. When neither gives one, a default of 5 000 characters applies, labelled «limit not published». Text over the limit is refused before sending and never cut short. Ukiyo never hides a catalog model because it doesn't know its controls.

### AC-10 (US-02) — domain invariant

**Given** a model that returns audio in a raw form a browser can't play directly
**When** its recording is saved
**Then** the saved file plays in the page's player and downloads as a common audio file. Raw audio is wrapped, without loss, as a WAV file; audio that arrives as MP3 is kept as it came. The Owner never chooses an output format, and the recording names its file type. A recording is saved only together with its audio file — never a recording without audio, never an audio file without its recording — even if Ukiyo stops in the middle of saving.

### AC-11 (US-04) — happy path

**Given** the chosen model has a published price per character
**When** the Owner types
**Then** next to the generate action, the page shows an estimate labelled as an estimate («≈ $0.0012»), computed from the billed characters × the published price. Billed characters are the text's Unicode code points after removing spaces and line breaks at its start and end, which is the text as it is sent. Inline delivery tags are included. An emoji built from several code points counts as several, as the providers bill it. The counter, the refusal (AC-04), the estimate and the recorded count all use this one rule. Amounts show two significant digits («≈ $0.0012», «≈ $0.72»). A non-zero amount below $0.0001 shows as «< $0.0001», never as $0. The same rule applies to recorded costs. It updates as the text changes. A model priced at zero shows «Free».

### AC-12 (US-04) — domain invariant

**Given** the chosen model has no published price, or is priced by something other than characters (for example per second of audio, or per token)
**When** the Owner types
**Then** the page says how the model is priced («priced per second of audio», «priced per token»), or that its price is unknown, instead of a number — never «$0» and never «Free» for an unknown price. Unlike image models, speech models get no estimate from the Owner's past costs in this step, so such a recording has no estimate.

### AC-13 (US-04) — domain invariant

**Given** a recording has just been saved
**When** the Owner looks at its cost
**Then** while Ukiyo is still waiting for the provider to report the actual charge, it reads «cost pending», with the estimate beside it when there is one. If the provider's answer already states the charge, the cost is known at once. Otherwise, once the provider reports the charge (within ten minutes), it changes to that amount without a reload. If the provider never reports it, it reads «cost unavailable», with the estimate still shown as an estimate. An unknown cost is never shown or counted as $0.

### AC-14 (US-04) — cross-context

**Given** the Owner generated a recording
**When** the generation finishes
**Then** the OpenRouter credit balance shown on the Speech page refreshes. Recordings never appear in the image gallery or in the recent generations next to the Generate form, and they never change an image model's price estimate or cost history.

### AC-15 (US-05) — happy path

**Given** the Owner has made recordings
**When** the Owner opens the Speech page's recent recordings
**Then** the ten latest are listed, newest first, each with a player, its text excerpt, voice, model, time, cost (with its status) and a download action. Choosing one puts its text, model, voice and settings back into the form, so the Owner can generate again. If the form holds unsent text that differs from the recording's, the page asks before replacing it. A recording whose model is no longer offered still shows its model's name and plays. Choosing it says that the model is no longer offered and keeps the current model. It still fills in the text, plus the voice and the settings that the current model accepts.

### AC-16 (US-05) — domain invariant

**Given** the Owner deletes a recording
**When** the deletion completes
**Then** the recording and its audio file are gone together, with no undo. It disappears from the recent recordings and its file can't be opened any more. Ukiyo stops waiting for its cost. If the deletion fails, the recording stays complete and playable, and the page says the deletion failed.

### AC-17 (US-02) — domain invariant

**Given** a recording is being generated
**When** the Owner tries to generate again
**Then** the generate action is unavailable until the current request ends, also after moving to another section and back (AC-02). One Owner action never sends two paid requests. A second browser tab, or a reload of the page during a request, is not guarded. After a reload, a recording that finished still appears in the recent recordings.

### AC-18 (US-06) — happy path

**Given** the Owner's machine holds recordings made with the prototype
**When** the Owner opens the Speech page after the update
**Then** each prototype recording is still listed and plays, with its text, model, voice and settings. Its recorded amount shows as its cost and is final (Ukiyo does not look it up again), and a recording that had no amount shows «cost unavailable» — never $0.

### AC-19 (US-02) — authorization

**Given** Ukiyo is running
**When** a page from another site in the Owner's browser asks Ukiyo to generate speech, list recordings or delete one
**Then** Ukiyo refuses, as it does every other request from another site. The OpenRouter key never reaches the browser, the saved recording or the logs.

### AC-20 (US-02) — error

**Given** the provider answered with audio, but Ukiyo can't save it (for example the disk is full, or raw audio can't be converted)
**When** the Owner generates
**Then** the page says that the audio arrived but couldn't be saved, and that the provider may still charge for it. Nothing partial is left behind: no recording without its file and no stray file. The text and settings stay as the Owner set them.

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Speech catalog requests | ≤ 1 provider catalog request per 10 minutes while the page is used; the page shows the model list ≤ 300 ms p95 from a warm catalog | integration test with a counting fake provider + timing in the `nfr` project |
| Recent recordings | the ten latest of 1 000 recordings ≤ 100 ms p95 server time | `nfr` integration test with seeded recordings |
| Saving after the audio arrives | file + record saved ≤ 500 ms p95 for a 10 MB audio file | `nfr` integration test with a fake provider returning 10 MB |
| Provider time limit | a request with no answer ends in a plain error after 180 s (same as images) | integration test with a controllable clock / abort |
| Cost lookups | per new recording (prototype recordings are never looked up) ≤ 8 lookups, none later than 10 minutes after the answer; lookups resume after a restart | unit test of the lookup schedule (shared with images) + integration test of restart |
| Prototype data | 100 % of the prototype recordings and files keep their text, model, voice, settings, file and amount after the update | migration test on a copy of a prototype-shaped database |

## 6.1 Security / privacy

- **Data classification:** internal — the Owner's own texts and recordings.
- **Personal data touched:** the texts the Owner types may contain anything; they stay on the machine and go only to the provider the Owner chose.
- **AuthZ/AuthN impact:** no new boundary; every new action stays behind the request guard (AC-19).
- **Abuse cases:**
  - A foreign page triggers paid speech: refused (AC-19).
  - A double click sends two paid requests: prevented (AC-17).
  - A request that timed out may still be billed by the provider: the Owner is told so (AC-05); the credit balance (AC-14) shows the effect.
  - A crafted recording path reads files outside the data dir: audio is served only for a recorded recording, from inside the data dir.
- **Security review:** N/A — same local-only model as images; no new secrets.

## 7. Metrics / KPIs

- **Speech models usable from the Speech page** — baseline: 9 of 36 catalog models (ElevenLabs only), target: 36 of 36 selectable at ship, and at least one real recording from a non-ElevenLabs model during ship verification.
- **Recordings whose cost reads as $0 while unknown** — baseline: possible (prototype stores no status), target: 0.
- **Prototype recordings preserved** — baseline: 19 recordings + 19 files, target: 19 + 19 after the update.
- **Recordings without a file, or files without a recording** — baseline: possible after a failed save, target: 0.

## 8. Open questions

- [x] Does OpenRouter's generation lookup report the actual charge of a speech request? **Yes** — resolved at ship verification 2026-10-25: three real recordings (ElevenLabs v4, Gemini 3.8 Flash TTS, Fish Audio S1) all went from pending to known through the generation lookup within the bounded schedule (ElevenLabs and Fish equal to the estimate). — owner: agent, due: ship verification.
- [x] Should a recording keep its up-front estimate beside its cost (unlike images)? **Yes** — decided by the Owner 2026-10-25 (at the start of step 19): `estimate_micros` stays stored beside the cost, always labelled as an estimate. — owner: Owner, due: review of step 18.
