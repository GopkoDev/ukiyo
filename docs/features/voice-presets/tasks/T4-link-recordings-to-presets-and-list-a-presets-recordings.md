---
id: T4
title: "Link recordings to presets and list a preset's recordings"
layer: "app"
deps: ["T3"]
blocks: ["T5", "T6"]
acs: ["AC-04", "AC-05", "AC-08", "AC-13", "AC-16", "AC-18"]
files_hint: ["src/shared/speech.ts", "src/server/modules/audio/repo.ts", "src/server/modules/audio/presets-repo.ts", "src/server/modules/audio/service.ts", "src/server/modules/audio/routes.ts", "src/server/modules/audio/presets-link.int.test.ts"]
owner: "dmytro.hopko"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T4 — Link recordings to presets and list a preset's recordings

## Place in the sequence

- **Blocked by:** T3 · **Blocks:** T5, T6.
- **Lane:** see files_hint overlaps.

## Why (user story)

> ### US-04: Know which recordings a preset made
> 
> **As the** Owner
> **I want** every recording made with an applied, unchanged preset to be linked to it
> **So that** I can tell later which speaker made which recording
>
> — `spec.md §4, US-04, verbatim`

## Inlined context

> ADR-0058: compare at receipt; `INSERT … SELECT … WHERE EXISTS` in the recording's transaction; unknown/different/deleted preset → saved unlinked.
>
> — `sad.md §4/§6 + adr/, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [screens.md](../screens.md) · [adr/](../adr/). Do not guess.

## Data delta

Inserts into `voice_preset_recordings`; reads it for `Recording.preset` and the preset filter. — `data-model.md, abridged`

## API contract

createRecording (presetId), listRecordings (preset), Recording.preset. — `contracts/openapi.yaml, abridged`

## Acceptance criteria

### AC-04 (US-04) — happy path

**Given** a preset is applied and unchanged
**When** the Owner generates a recording
**Then** the recording is saved linked to that preset; its detail (dialog and page) names the preset with a way to open the preset's page; the preset's count, total and last use include it as soon as the recording is saved
— `spec.md §5, AC-04, verbatim`

### AC-05 (US-02, US-04) — domain invariant

**Given** a preset is applied
**When** the Owner changes the speech model, the voice or any voice setting (only the current values count, so changing a value and back restores plain «<name>»)
**Then** the Speech page shows the preset as «<name> · modified» while any value differs from the preset and as plain «<name>» again once every value equals it; a recording generated while it differs is saved with no preset link; a recording is linked only when the model, voice and settings sent equal the preset's at the moment Ukiyo receives the request — Ukiyo checks this itself, so a link never claims a setup the recording wasn't made with; «equal» means the same model, the same voice (the provider's default voice equals only the provider's default voice) and the settings sent — as the model accepts them, defaults filled in, delivery instructions trimmed, empty instructions meaning none — equal to the preset's stored settings exactly, so a setting the preset holds that the model no longer accepts counts as a difference (AC-10); «Detach» — an action next to the applied preset — removes the applied preset and leaves the form's values as they are; a preset that no longer exists stops being applied the same way
— `spec.md §5, AC-05, verbatim`

### AC-08 (US-03) — domain invariant

**Given** a preset with recordings is deleted
**When** the Owner looks at those recordings anywhere (audio gallery, recent recordings, a recording's dialog or page)
**Then** each recording still plays and still shows its own text, model, voice, settings and cost; nothing about it changed except that no preset is named
— `spec.md §5, AC-08, verbatim`

### AC-13 (US-06) — happy path

**Given** a preset has recordings
**When** the Owner opens it from Voices
**Then** its page (an address of its own that a reload or a copied link opens again) shows the preset's name, model, voice, settings, count, total and last use with «Apply», «Rename» and «Delete», and below them a newest-first grid of exactly its recordings in the audio gallery's cards, loading more as the Owner scrolls; each card shows the model, voice and settings that recording was actually made with (recordings made before an update may differ from the preset's current setup); opening a card shows the recording dialog over this grid, ← → step through this preset's recordings only, Back closes the dialog and returns to the preset's page at the same scroll; with no recordings the page reads «No recordings with this voice yet.» with «Apply»
— `spec.md §5, AC-13, verbatim`

### AC-16 (US-05) — cross-context

**Given** a preset's recording is deleted, or a new one is made, anywhere in Ukiyo
**When** the Owner looks at Voices or the preset's page without reloading
**Then** the count, the total and the last use match the recordings that exist, and a deleted recording's card is gone from the preset's grid; deleting a recording never deletes or changes a preset beyond its count, total and last use; the deleted recording's dialog steps to its neighbour within the preset's recordings as the gallery's does
— `spec.md §5, AC-16, verbatim`

### AC-18 (US-04) — cross-context

**Given** a recording is being generated with a preset applied
**When** the Owner updates, renames or deletes that preset before the recording arrives
**Then** the recording is still saved (a paid recording is never lost because of a preset change); it is linked when the preset still exists and its setup at the moment Ukiyo received the request equalled what was sent, and unlinked when the preset was deleted before the recording was saved
— `spec.md §5, AC-18, verbatim`

## Definition of Done

StartSpeechRequest.presetId + Recording.preset; start() compares with presetMatches at receipt and inserts the link inside the save transaction only if the preset still exists; never refuses; GET /audio/recordings?preset= (exclusive with model); every Recording DTO carries preset {id,name}|null; integration tests (match, differs, unknown, deleted mid-request, preset delete keeps recordings, recording delete drops link, no extra provider call); gate green
